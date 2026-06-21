# Eravat 2.0 — Combined QA & Code Review Summary

**Date:** 2026-06-09
**Branch:** `main`
**Method:** Independent multi-angle code review (9 angles, parallel agent analysis + verification) merged with prior QA Audit 2026-05-26.
**Scope:** All source files in `eravat-app/src/`, `supabase/functions/`, `supabase/migrations/`, and untracked working-tree files.

---

## Overall Verdict

🟠 **AMBER — Do not ship S-1 / S-2 / S-3 without fixes. High-priority items (H-1 through H-5) should be resolved before or immediately after launch.**

- 3 severe blockers (S-series)
- 5 high-priority issues (H-series)
- 7 medium issues (M-series)
- 6 low / backlog items (L-series)
- 4 items investigated and cleared (no action required)

---

## Severity Ladder

### 🔴 SEVERE — Block launch

#### S-1 — Production build broken
**File:** `AdminConflict.tsx`, `AdminGeneral.tsx`, `AdminLive.tsx`, `SyncService.extended.test.ts`
**Source:** QA-26 (S1.1) — corroborated
**Status:** Confirmed; verify still present

`npm run build` exits with 27 TypeScript errors. CI/CD deploy will not succeed.

Root cause: `new Map()` constructed without explicit type arguments → `Array.from(map.values())` infers as `unknown[]` → downstream `.sort()`/`setState` type mismatch. Also 2 unused vars in test file.

**Fix:** Annotate all `Map` constructors (`Map<string, LinePoint>()`, `Map<string, DivisionRow>()`, etc.); remove unused vars in `SyncService.extended.test.ts`.
**Effort:** 1–2 hours.
**DB Impact:** None — TypeScript annotations only.

---

#### S-2 — `test_notif.ts` leaks PII if bundled
**File:** `eravat-app/test_notif.ts`
**Source:** QA-26 (S1.2) — still present (untracked, in `git status`)
**Status:** Confirmed

Debug script in the Vite source root queries `profiles(id, phone)` and `notifications`, then `console.log`s the rows. If accidentally imported or bundled, it would expose user phone numbers.

```ts
const { data: users } = await supabase.from('profiles').select('id, phone').limit(5);
console.log("Users:", users);
```

**Fix:** Delete the file (or move to `scripts/` outside Vite root and add to `.gitignore`).
**Effort:** 1 minute.
**DB Impact:** None — delete a file; it only reads the DB, no schema change.

---

#### S-3 — Grain damage double-counted in `countDamages`
**File:** `eravat-app/src/services/adminAnalyticsService.ts:179`
**Source:** New (independent review)
**Status:** Confirmed

In `countDamages()`, for a report whose `conflict_damages.category = 'grain'` AND whose description also contains the word "grain":

1. The loop at line 174 increments `counts.grain++` (via `mapDamageCategory` returning `'grain'`).
2. `inferGrainDamage()` scans `conflict_damages.description` for `/grain/i` and returns `true` → `grainReports.add(report.id)`.
3. Line 179: `counts.grain += grainReports.size` adds it a second time.
4. The deduplication block (lines 182–185) only protects `counts.total`, not `counts.grain`.

Result: Grain damage count overstated on the Conflict Dashboard.

**Fix:** Before `counts.grain += grainReports.size`, subtract reports already counted via explicit category:

```ts
const alreadyCountedGrain = new Set(
  reports.filter(r =>
    (r.conflict_damages ?? []).some(d => mapDamageCategory(d.category ?? '') === 'grain')
  ).map(r => r.id)
);
counts.grain += [...grainReports].filter(id => !alreadyCountedGrain.has(id)).length;
```

**Effort:** 30 minutes.
**DB Impact:** None — pure client-side aggregation logic.

---

### 🟠 HIGH — Fix before or immediately after launch

#### H-1 — Unscoped notification query (wrong KPIs + performance + privacy)
**File:** `eravat-app/src/pages/admin/AdminLive.tsx:146,182`
**Source:** Corroborated (QA-26 S2.2 + independent review)
**Status:** Confirmed

Two problems in `fetchData`:

**Problem A — Division filter not applied to notifications (line 146):**
```ts
let notifQ = supabase.from('notifications')
  .select('id, user_id, report_id')
  .gte('created_at', since);
const { data: allNotifs } = await notifQ;  // beatFilter never applied
```
When an admin selects a division, `beatFilter` is applied to the reports query but never to the notifications query. `totalWarnings` and `warningRecipients` KPIs count all system notifications for the period, not just those for the selected division.

**Problem B — Unbounded `allQ` fetch (line 182):**
```ts
let allQ = supabase
  .from('reports')
  .select('id, observations(type, conflict_loss_details), conflict_damages(category)')
  .gte('device_timestamp', since);
// No .limit() — fetches unlimited rows on every page change
```
On 180-day ranges with high activity this returns thousands of rows, causing slow renders and potential browser OOM.

**Fix (minimal, client-only):**
- For Problem A: filter notifications by joining to report IDs — fetch report IDs for the selected division first, then `notifQ.in('report_id', reportIds)`.
- For Problem B: add `.limit(2000)` to `allQ`, matching the pattern used elsewhere.

**Deeper fix (server-side, recommended):** Push count + distinct-recipients aggregation to a Postgres function filtered by division. Removes the double-fetch entirely.

**Effort:** Minimal fix 1–2 h. Deeper fix 4 h.
**DB Impact:** Minimal fix = none. Deeper fix = one new Postgres RPC (read-only, no table change). Must-do regardless: **verify RLS on `notifications` already scopes by caller role** — this finding's privacy dimension depends on it.

---

#### H-2 — `syncService` hardcodes `status:'pending'` on every upsert
**File:** `eravat-app/src/services/syncService.ts:249`
**Source:** QA-26 (S2.1) — confirmed
**Status:** Confirmed (latent)

```ts
.upsert({
  id: report.id,
  user_id: report.user_id,
  ...
  status: 'pending',   // hardcoded on every upsert, even retries
});
```

Safe today because only locally-`pending`/`failed` reports are synced. **Latent risk:** any future edit-and-resync flow would clobber an admin's `approved`/`rejected` server status back to `'pending'`.

**Fix:** Remove `status` from the upsert payload. The column default on the server handles new rows.
**Effort:** 2 hours (including regression test).
**DB Impact:** None — client-side change only. Column and default already exist.

---

#### H-3 — FNV-1a UUID derivation is collision-fragile
**File:** `eravat-app/src/services/syncService.ts:162-178`
**Source:** New (independent review)
**Status:** Confirmed

`stableHex32` derives all four UUID segments from a single 32-bit FNV-1a hash:

```ts
const h2 = Math.imul(hash ^ 0x9e3779b1, 2246822519) >>> 0;
const h3 = Math.imul(hash ^ 0x85ebca6b, 3266489917) >>> 0;
const h4 = Math.imul(hash ^ 0xc2b2ae35, 668265263) >>> 0;
```

If two different `${report.id}:obs` inputs produce the same 32-bit FNV hash, all four segments are identical → `stableUuidFrom` returns the same UUID for both. The `.upsert()` on `observations` and `conflict_damages` silently overwrites the first report's row with the second's data.

**Fix:** Replace `stableUuidFrom` with `crypto.randomUUID()` generated at report-save time, persisted in the local Dexie record (`obs_id` field already exists for this purpose). Deterministic generation is only needed for idempotent retry, but Dexie already handles that via the stored `obs_id`.

**Effort:** 2 hours.
**DB Impact:** None to schema. Note: existing unsynced local reports keep their old deterministic `obs_id`. These will continue to work on retry (idempotent upsert by same key). No server-side cleanup needed.

---

#### H-4 — Phone enumeration via `message` field
**File:** `eravat-app/src/contexts/AuthContext.tsx:272`
**Source:** New (independent review) — refines QA-26 which cleared enumeration
**Status:** Confirmed

QA-26 declared OTP sign-in safe from enumeration (generic error messages). However, the function also returns a `message` field with distinct values:

```ts
// line 272 — phone not found:
return { error: new Error('Invalid credentials...'), message: 'user_not_found' };

// vs rate limit:
return { error: ..., message: 'rate_limit' };

// vs send failure:
return { error: ..., message: 'send_failed' };
```

A caller (or intercepted response) can distinguish "number not registered" from other failure modes via `message`, enabling phone number enumeration.

**Fix:** Return a single generic `message: 'failed'` for all non-success cases in `signInWithPhoneOTP`. Internal error routing can use separate codes that are not surfaced in the response.

**Effort:** 30 minutes.
**DB Impact:** None — `get_email_by_phone` RPC unchanged.

---

#### H-5 — Bundle 1.8 MB JS / 516 KB gzip
**File:** Bundle-wide (Vite build output)
**Source:** QA-26 (S2.4) — confirmed
**Status:** Confirmed

Vite warns main chunk exceeds 500 KB. This is a forest-staff PWA targeting rural 3G — slow first paint is a real-world blocker, especially given the offline-first design goal.

**Fix:** Route-level `React.lazy()` for all `/admin/*` routes; dynamic import of Recharts and Leaflet only when used.
**Effort:** 4–6 hours.
**DB Impact:** None.

---

### 🟡 MEDIUM — First post-launch sprint

#### M-1 — `wasAuthenticated` uses `useState` instead of `useRef`
**File:** `eravat-app/src/contexts/AuthContext.tsx:67`
**Source:** Corroborated (QA-26 S2.3 + independent)
**Status:** Confirmed (code quality / fragility)

```ts
const wasAuthenticated = useState({ current: false });
// later:
wasAuthenticated[0].current = true;  // direct mutation of state object
```

Works only because React preserves the object reference when the setter is never called. Direct state mutation bypasses React's model and is fragile under concurrent/strict mode rendering changes.

**Fix:** `const wasAuthenticated = useRef(false);` — update two read/write sites.
**Effort:** 5 minutes.
**DB Impact:** None.

---

#### M-2 — `AdminLive` stale-filter / missing effect dependencies
**File:** `eravat-app/src/pages/admin/AdminLive.tsx:232`
**Source:** Corroborated (QA-26 S4 + independent)
**Status:** Confirmed (React hooks violation)

```ts
useEffect(() => {
  fetchData(selectedDivision, timeRange, page);
}, [page]);  // fetchData, selectedDivision, timeRange missing from deps
```

Works today only because `selectedDivision`/`timeRange` changes exclusively through `handleApply` (which also sets page). If that flow ever changes, stale filter values will be silently used on page navigation.

**Fix:** Add missing deps, or restructure to use `useCallback` with proper deps.
**Effort:** 30 minutes.
**DB Impact:** None.

---

#### M-3 — Division filter applied client-side after 2000-row hard limit
**File:** `eravat-app/src/services/adminAnalyticsService.ts:123-139`
**Source:** New (independent review)
**Status:** Confirmed

`fetchAdminReports` fetches up to 2000 rows unfiltered, then filters by `divisionId` in JavaScript. If there are more than 2000 total reports in the date range, the selected division's reports beyond the cut-off are silently missing — no error, no warning.

```ts
const { data, error } = await supabase
  .from('reports')
  .select(REPORT_SELECT)
  .gte('device_timestamp', start)
  .lte('device_timestamp', end)
  .limit(2000);                    // ← limit applied before division filter

if (!filters.divisionId) return rows;
return rows.filter(r => reportDivisionId(r) === filters.divisionId);  // ← client-side
```

**Fix:** Move the division filter server-side: use the beat-ID resolution pattern already present in `AdminGeneral`/`AdminLive` (fetch range_ids → beat_ids → `.in('beat_id', beatIds)`).
**Effort:** 2 hours.
**DB Impact:** None to schema — uses existing joins and columns.

---

#### M-4 — Silent `catch {}` hides profile fetch errors
**File:** `eravat-app/src/contexts/AuthContext.tsx:137`
**Source:** New (independent review)
**Status:** Confirmed

```ts
} catch {
  // Profile fetch failed
}
```

Any unhandled exception inside `fetchProfile` (malformed Supabase response, JSON parse error, network error after the try-block begins) is swallowed silently. The profile state retains its previous (possibly stale) value. A user whose profile data is corrupted will appear authenticated with wrong data rather than being shown an error or signed out.

**Fix:** At minimum, log the error and call `setProfile(null)` in the catch block.
**Effort:** 15 minutes.
**DB Impact:** None.

---

#### M-5 — `ADMIN_ROLES` list diverges from `ROLE_HIERARCHY`
**File:** `eravat-app/src/components/ProtectedRoute.tsx:5`, `eravat-app/src/lib/rbac.ts`
**Source:** New (independent review)
**Status:** Confirmed (design inconsistency)

`ProtectedRoute.tsx` defines:
```ts
const ADMIN_ROLES = ['admin', 'ccf', 'dfo'];
```

`rbac.ts` `ROLE_HIERARCHY` grants management capabilities to `rrt` and `range_officer` but they cannot access any `/admin` route — silently redirected to `/` with no explanation. Also: `dfo` gets full admin panel access including `AdminUsers` (user deletion) — confirm this is intended.

Two separate role lists with no shared source of truth.

**Fix:**
- If keeping the restricted set: add an inline comment explaining the intentional narrowing.
- If widening to `rrt`/`range_officer`: also **update RLS policies** on admin-read tables so those roles return data (otherwise the UI loads but queries return empty).

**Effort:** 30 min decision + 1–4 h if RLS changes needed.
**DB Impact:** **Conditional** — frontend-only if role set is unchanged. If `rrt`/`range_officer` are admitted, must add RLS policies on `reports`, `notifications`, `user_region_assignments`, `profiles` for those roles.

---

#### M-6 — 53 unguarded `console.*` calls in production paths
**File:** Multiple — concentrated in `AuthContext.tsx`, `syncService.ts`, `ReportStepper.tsx`
**Source:** QA-26 (S3.1)
**Status:** Confirmed

Diagnostic logs fire in production, exposing internal state, user IDs, and error details to the browser console. Some include UUIDs and sync payloads.

**Fix:** Wrap with `if (import.meta.env.DEV)` or convert to a thin logger utility.
**Effort:** 2–3 hours.
**DB Impact:** None.

---

#### M-7 — 112 ESLint errors / 16 warnings
**File:** Repo-wide
**Source:** QA-26 (S3.2)
**Status:** Confirmed

Primarily `@typescript-eslint/no-explicit-any` in test mocks and `no-unused-vars` in Playwright fixtures. CI lint gate is broken. `react-hooks/rules-of-hooks` false-positives from `use*`-named non-hook functions in `tests/fixtures/auth.fixture.ts` — rename those functions.

**Fix:** Resolve `any` leakage in test mocks; remove/rename unused vars; rename `use*` test helpers.
**Effort:** 3–4 hours.
**DB Impact:** None.

---

### 🟢 LOW — Backlog / hygiene

#### L-1 — Dead-code branch in `verifyOTP`
**File:** `eravat-app/src/contexts/AuthContext.tsx:310`
**Source:** New (independent review)
**Status:** Confirmed

`normalisePhone` always returns ≤10 digits for Indian numbers. The guard at line 310:
```ts
if (storedDigits.length === 12 && storedDigits.startsWith('91')) {
```
can never be true. This dead branch masks future phone-format regressions silently.

**Fix:** Remove the 12-digit check; simplify to always construct `+91${tenDigit}`.
**Effort:** 10 minutes.
**DB Impact:** None.

---

#### L-2 — No-op date math (confusing non-pattern)
**File:** `eravat-app/src/pages/admin/AdminConflict.tsx:154`, `AdminGeneral.tsx:207`
**Source:** Corroborated (QA-26 S3.4 + independent)
**Status:** Confirmed (cosmetic)

```ts
let cur = startOfMonth(parseISO(`${start}-01`.slice(0, 10)));
```

`start` is already `YYYY-MM-DD`. Appending `-01` then slicing to 10 chars returns the same string. The intended pattern was likely `${start.slice(0, 7)}-01` (snap to first of month). `startOfMonth` compensates so it's functionally correct but misleading.

**Fix:** `startOfMonth(parseISO(start))` — simpler and correct.
**Effort:** 5 minutes.
**DB Impact:** None.

---

#### L-3 — `report_media` column-name guessing ladder
**File:** `eravat-app/src/services/syncService.ts:99-104`
**Source:** QA-26 (S4)
**Status:** Confirmed

The service tries 5 column names (`file_path`, `storage_path`, `path`, `media_path`, `object_path`) to insert media rows, caching a hint after first success. This is a workaround for schema uncertainty across environments.

**Fix:** Confirm the canonical column name in the live `report_media` schema and remove the fallback ladder.
**Effort:** 1 hour (schema verification + cleanup).
**DB Impact:** **Schema verification required.** If the column name is inconsistent across envs, a small migration to standardize it may be needed. No data migration.

---

#### L-4 — Cross-tab sync lock TOCTOU
**File:** `eravat-app/src/services/syncService.ts:11-31`
**Source:** New (independent review)
**Status:** Confirmed (low probability)

`tryAcquireCrossTabSyncLock` reads `localStorage`, evaluates the lock, then writes — non-atomic. Two tabs executing simultaneously can both read "no lock" and both proceed with sync. In practice low-impact because per-report `user_id` validation and server-side upsert semantics are idempotent.

**Fix:** Use the Web Locks API (`navigator.locks.request`) for a true atomic cross-tab lock.
**Effort:** 2 hours.
**DB Impact:** None — `localStorage` only.

---

#### L-5 — Async `useEffect` cleanup (brief duplicate listener)
**File:** `eravat-app/src/App.tsx:70`
**Source:** New (independent review)
**Status:** Confirmed (Strict Mode only)

```ts
return () => { listener.then(l => l.remove()); };
```

`listener` is a `Promise<PluginListenerHandle>`. The cleanup is async and not awaited. During React Strict Mode's double-mount cycle, the first mount's listener is still active when the second mount registers a second listener, causing `networkStatusChange` to fire twice → two concurrent `syncData()` calls.

**Fix:** Await the Promise before registering, storing the handle directly:
```ts
const handle = await Network.addListener('networkStatusChange', ...);
return () => { handle.remove(); };
```
Or use a `useRef` to store the handle synchronously.
**Effort:** 30 minutes.
**DB Impact:** None.

---

#### L-6 — Schema-gap KPIs hardcoded to 0
**File:** `AdminConflict.tsx`, `AdminGeneral.tsx`, `AdminLive.tsx`
**Source:** QA-26 (S3.3) — intentional/deferred
**Status:** PM decision required

Human Death, Human Injury, and Grain Damage KPIs display `0` permanently with `⚠ Schema` badges. Honest, but requires explicit PM sign-off on shipping permanently-zero KPIs in v1.

**Fix (if real values needed):** Schema migration to add values to the `loss_category` enum and/or new columns on `observations`/`conflict_damages`, plus a data-entry path.

**Effort (if pursued):** 2–3 days (migration + UI + data-entry flow).
**DB Impact:** **Schema migration required** — new `loss_category` enum values and/or columns on `observations`/`conflict_damages`. The only finding in this report whose full resolution is fundamentally a DB schema change.

---

## Findings Investigated and Cleared ✅

These came up during analysis but are **mitigated or intentional** — no action required:

| Finding | Verdict |
|---------|---------|
| `beat_guard` can onboard volunteers via `canOnboardVolunteers` | **Intentional by design.** The `create-user` Edge Function explicitly handles this at line 142 with server-side `canManageRole` enforcement. ✅ |
| Temporary password shown plaintext in `OnboardVolunteer.tsx` | **Necessary UX.** Volunteers have no email; beat guard must relay the password. Low risk in context. Consider mask-on-copy as UX improvement only. ✅ |
| Admin queries lack server-side role checks | **Mitigated by RLS.** QA-26 spot-checked the four hardening migrations — territory-scoped policies present and correct. Recheck on every new table. ✅ |
| `PushNotificationService` `activeUserId` race condition | **Structurally mitigated.** `attachListeners` calls `removeAllListeners()` on user change; `unregister` nulls `activeUserId`. Only a sub-millisecond gap remains. ✅ |

---

## Database Impact Summary

**15 of 19 findings require zero database changes.**

| Severity | Issue | DB Change? | Detail |
|----------|-------|------------|--------|
| S-1 | Build broken | No | TS annotations only |
| S-2 | `test_notif.ts` PII | No | Delete a file |
| S-3 | Grain double-count | No | Client aggregation logic |
| H-1 | Unscoped notifications | **Conditional** | Minimal fix = none; server-side fix = 1 new RPC. Also: verify `notifications` RLS. |
| H-2 | `status:'pending'` clobber | No | Remove field from client payload |
| H-3 | UUID collision | No | Switch to stored `crypto.randomUUID()`; no migration |
| H-4 | Phone enumeration | No | Remove `message` field from response |
| H-5 | Bundle size | No | Frontend code-splitting only |
| M-1 | `useState` as ref | No | 5-min refactor |
| M-2 | Stale effect deps | No | Add to deps array |
| M-3 | Division filter post-limit | No | Move filter server-side using existing columns |
| M-4 | Silent catch | No | Add error handling |
| M-5 | Role list divergence | **Conditional** | Frontend-only if no role set change; **RLS update required if `rrt`/`range_officer` admitted** |
| M-6 | Unguarded console logs | No | Wrap with DEV guard |
| M-7 | ESLint errors | No | Code quality only |
| L-1 | Dead verifyOTP branch | No | Remove dead code |
| L-2 | No-op date math | No | Simplify expression |
| L-3 | Column-name ladder | **Possible** | Schema verify may reveal a rename migration |
| L-4 | Sync lock TOCTOU | No | localStorage only |
| L-5 | Async cleanup | No | Frontend hook fix |
| L-6 | Schema-gap KPIs | **Yes (if pursued)** | Requires new `loss_category` enum values + columns on `observations`/`conflict_damages` |

---

## Proposed Action Order

### Phase 0 — Now (before any commit)
- [ ] **S-2:** Delete `eravat-app/test_notif.ts` — 1 minute
- [ ] **S-3:** Fix grain double-count in `adminAnalyticsService.ts` — 30 min
- [ ] **H-4:** Remove `message:'user_not_found'` from OTP response — 30 min
- [ ] **M-1:** `useState` → `useRef` in `AuthContext.tsx:67` — 5 min
- [ ] **L-1:** Remove dead 12-digit branch in `verifyOTP` — 10 min
- [ ] **L-2:** Simplify no-op date math in admin pages — 5 min

### Phase 1 — Before launch (Days 1–2)
- [ ] **S-1:** Fix 27 TypeScript errors so `npm run build` passes
- [ ] **H-2:** Remove `status:'pending'` from sync upsert + regression test
- [ ] **H-3:** Replace `stableUuidFrom` with stored `crypto.randomUUID()`
- [ ] **H-1:** Add division filter + `.limit()` to notification query (minimal fix)

### Phase 2 — Post-launch sprint (Week 1)
- [ ] **H-5:** Route-level lazy loading (< 500 KB target)
- [ ] **M-2:** Fix `AdminLive` effect deps
- [ ] **M-3:** Move division filter server-side in `fetchAdminReports`
- [ ] **M-4:** Add error handling to `fetchProfile` catch block
- [ ] **M-5:** PM decision on role-list divergence (with or without RLS changes)
- [ ] **M-6:** Wrap console.* calls with DEV guard (53 instances)
- [ ] **M-7:** Resolve ESLint errors (112 errors, restore CI lint gate)

### Phase 3 — Backlog
- [ ] **L-3:** Pin canonical `report_media` column name
- [ ] **L-4:** Replace localStorage lock with Web Locks API
- [ ] **L-5:** Await network listener handle before cleanup
- [ ] **L-6:** PM sign-off or schema migration for Human Death/Injury/Grain Damage KPIs
- [ ] **H-1 deep fix:** Server-side notification aggregation RPC

---

## Referenced Files

| File | Issues |
|------|--------|
| `eravat-app/src/contexts/AuthContext.tsx` | H-4, M-1, M-4, L-1 |
| `eravat-app/src/services/adminAnalyticsService.ts` | S-3, M-3 |
| `eravat-app/src/pages/admin/AdminLive.tsx` | H-1, M-2 |
| `eravat-app/src/services/syncService.ts` | H-2, H-3, L-3, L-4 |
| `eravat-app/src/components/ProtectedRoute.tsx` | M-5 |
| `eravat-app/src/lib/rbac.ts` | M-5 |
| `eravat-app/src/pages/admin/AdminConflict.tsx` | S-1, L-2 |
| `eravat-app/src/pages/admin/AdminGeneral.tsx` | S-1, L-2 |
| `eravat-app/src/pages/admin/AdminLive.tsx` | S-1 |
| `eravat-app/src/services/__tests__/SyncService.extended.test.ts` | S-1 |
| `eravat-app/test_notif.ts` | S-2 |
| `eravat-app/src/App.tsx` | L-5 |

---

*Generated: 2026-06-09 | Independent review method: 9-angle parallel analysis (line-by-line, removed-behavior, cross-file tracer, language pitfalls, security, access control, cleanup, efficiency, altitude) with single-vote verification pass.*
