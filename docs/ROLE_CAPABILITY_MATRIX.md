# Eravat 2.0 — Role Capability Matrix & Gap Analysis

> Last updated: 2026-05-21  
> Scope: DFO, Range Officer, Beat Guard, Volunteer (field hierarchy)

---

## 1. Intended capabilities (forest management context)

| Capability | DFO | Range Officer | Beat Guard | Volunteer |
|------------|-----|---------------|------------|-----------|
| Division / range oversight dashboards | Yes | Range only | No | No |
| Approve / review subordinate reports | Yes (division) | Yes (range) | Beat (own beat) | Own only |
| Register Range Officers & Beat Guards | Yes | Beat Guards only | No | No |
| Onboard Gram Mitra / volunteers | Yes (division beats) | Yes (range beats) | Yes (own beat) | No |
| Submit field reports (sightings, conflict) | Yes | Yes | Yes | Yes |
| Territory history (scoped) | Division | Range | Beat | Own reports |
| Proximity notifications | Yes | Yes | Yes | Limited / own |
| Manage personnel (admin UI) | Via admin panel | Blocked from `/admin` route | Blocked | Blocked |
| GPS on user profile | Required | Required | Required | Required |
| Phone OTP login | Yes | Yes | Yes | Yes |

---

## 2. Current implementation (codebase audit)

| Capability | DFO | Range Officer | Beat Guard | Volunteer |
|------------|-----|---------------|------------|-----------|
| Report RLS read scope | Division (`can_read_report`) | Range | Beat | Own (`user_id`) |
| `create-user` RBAC | RO + BG | BG + **volunteer** | **volunteer** | — |
| `/admin` route guard | Yes | **No** (redirect home) | No | No |
| Admin dashboard KPIs | Yes (`useAdminFilters`) | Partial (filters) | No | No |
| Volunteer onboarding UI | Admin users form only | **Was missing** → field flow added | **Was missing** → `/volunteers/onboard` | N/A |
| Profile `latitude` / `longitude` | **Was missing** → migration + UI | Same | Same | Same |
| Region assignment | `division_id` | `range_id` | `beat_id` | `beat_id` (now enforced) |
| Centroid fallback location | SQL backfill | Same | Same | Beat centroid |

**Enforcement layers:** Route guards (`ProtectedRoute`, `AdminRoute`), PostgreSQL RLS (`reports`, `profiles`), Edge Functions (`create-user`, `update-user`, `_shared/rbac.ts`).

---

## 3. Gap analysis (before → after this session)

| Gap | Severity | Status |
|-----|----------|--------|
| Beat Guard could not onboard volunteers (no UI, RBAC `beat_guard: []`) | High | **Fixed** — RBAC + `/volunteers/onboard` + simplified admin volunteer form |
| Volunteers created without `beat_id` / territory | High | **Fixed** — `create-user` requires beat; inherits beat from Beat Guard caller |
| No mandatory user GPS on `profiles` | High | **Fixed** — columns, backfill, profile edit, completion gate |
| Range Officer blocked from `/admin` but treated like DFO in filters | Medium | **Open** — product decision: extend `AdminRoute` or add RO-scoped routes |
| Volunteer sign-up required email/password in admin modal | Medium | **Fixed** — auto credentials + minimal fields |
| `profiles` RLS allows self-update only (location safe) | — | **Verified** — no change required |
| DFO cannot manage volunteers in RBAC before | Medium | **Fixed** — `dfo` / `range_officer` may create `volunteer` |

---

## 4. Files touched (reference)

- `supabase/migrations/20260521000000_profile_location_and_volunteer_onboarding.sql`
- `supabase/functions/_shared/rbac.ts`, `create-user/index.ts`
- `eravat-app/src/lib/rbac.ts`, `OnboardVolunteer.tsx`, `LocationFields.tsx`, `EditProfile.tsx`
- `docs/schema.md`, `docs/PROJECT_BRAIN.md`, `docs/INDEX.md`

---

## 5. Deployment notes

1. Apply migration on Supabase (`supabase db push` or SQL editor).
2. Redeploy Edge Functions: `create-user` (and ensure `get_geo_centroid_lat_lng` RPC exists after migration).
3. Ship frontend build to GH Pages / APK.
