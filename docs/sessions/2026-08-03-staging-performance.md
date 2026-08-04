# Session: 2026-08-03 — Staging performance hardening

## Goal

Keep ≥50 concurrent foreground sessions smooth on core flows, and validate ~3,000 background logged-in devices do not create polling/Realtime/API storms. Staging Supabase only (`ttjtyvxfiqhjdngkgdkf`). Prod DB not touched.

## Baseline (before)

Measured via code audit + staging advisors + REST probes against publishable key:

| Area | Before |
|------|--------|
| Route loading | All pages eager-imported in `App.tsx` (Leaflet/admin/report in main chunk) |
| Auth | `fetchProfile` + push register on **every** `onAuthStateChange` incl. `TOKEN_REFRESHED` |
| Notifications | Realtime resubscribe whenever `profile` object identity changed |
| Network sync | Sync on every online event (empty queue still woke auth/Dexie path) |
| Map pins | Up to 500–1000 reports; date filter client-side; division list pulled all boundaries |
| Nearby | Download 500 reports + turf filter in JS |
| Admin users | Full profiles + all assignments dump |
| Admin home | Sequential KPI queries + Leaflet map always mounted |
| Staging advisors | 43 `auth_rls_initplan`, 5 unindexed FKs, heavy overlapping report SELECT policies |
| REST (anon) reports `limit=8` | **HTTP 500 / statement timeout (~3.2s)** |
| REST (anon) `reports_nearby` | **HTTP 500 / statement timeout (~3.2s)** |

## Changes

### Client (`eravat-app`)

- Lazy-load heavy routes (map, report, history, nearby, villagers, admin, profile subpages) + Suspense fallback
- Auth: profile load only on `SIGNED_IN` / `USER_UPDATED` / `INITIAL_SESSION` (or cold cache); **skip** on `TOKEN_REFRESHED`; 10‑min profile TTL; push register only on `SIGNED_IN` (+ same-user session guard)
- NotificationBell deps → `user.id` / `profile.id` (no thrash on profile refetch)
- NetworkSync: offline→online only, 3s debounce, skip when Dexie pending count = 0 (`countPendingSyncReports`)
- Map: server date filters, pin limit 200/300, slim observation columns, light division list then boundaries, prefer entity `boundary` over unioning all beats
- Nearby: `reports_nearby` RPC with fallback limit 100
- History: explicit columns; notifications capped at 200
- AdminUsers: debounced server search + limit 50/100; assignments for returned IDs only
- AdminDashboard: parallel KPI fetch; map behind “Show live map”
- Hathi Mitra: debounce 300ms; drop `t` from VillagersList fetch deps

### Staging DB (applied remotely; **not** prod)

Migrations:

1. `20260803221500_staging_perf_hot_indexes.sql` — FK/time indexes + `reports_nearby`
2. `20260803223000_staging_rls_initplan_hotpaths.sql` — `(select auth.uid())` / role initplan; faster `get_my_role` / `can_read_report`
3. `20260803224500_staging_drop_redundant_rls.sql` — drop per-row `can_read_report` on reports; replace observation/media/conflict territory read with EXISTS→reports (nested RLS)

Indexes added:

- `idx_observations_report_id`, `idx_conflict_damages_report_id`, `idx_report_media_report_id`
- `idx_geo_beats_range_id`, `idx_geo_ranges_division_id`
- `idx_reports_device_timestamp`, `idx_reports_beat_device_timestamp`, `idx_reports_server_created_at`
- `idx_villagers_division_name_lower`

## After (measured)

| Probe | After |
|-------|-------|
| Staging build | Code-split: `MapComponent` ~219 kB, `AdminDashboard` ~36 kB, `ReportActivityPage` ~51 kB separate chunks; main still ~983 kB |
| Unit tests | **22/22 pass** (`authPerf` + existing) |
| Typecheck | `tsc --noEmit` clean |
| reports `limit=8` (anon) | **200** in ~1.9s (empty under RLS — no timeout) |
| `reports_nearby` (anon) | **200** in ~344 ms |
| geo_divisions light | ~175–190 ms sequential |
| Concurrency 20×4 endpoints | villages/villagers/divisions/reports all **ok=20/20**; reports p50 ~1.7 s (anon empty); others p50 ~0.5–0.6 s |
| EXPLAIN reports by `device_timestamp` | uses `idx_reports_device_timestamp` |

### Background / ~3k idle model

- No app-wide polling intervals for data
- Token refresh no longer re-fetches profile or re-registers push
- Realtime: one notifications channel per user session (stable deps)
- Sync: reconnect only after offline, debounced, skipped when queue empty
- AuthContext currently clears legacy `eravat_secure_session` and does **not** PIN-lock on resume (session via Supabase persistSession). Foreground restore = JWT refresh + cached profile; full OTP re-login not required while refresh token valid

### Full staging smoke (2026-08-04 retest)

Script: `eravat-app/scripts/staging-perf-full-smoke.mjs`  
Artifacts: `Go live Prep - Staging/generated/e2e-perf-full/` (`results.json`, screenshots)

**19/19 PASS** (unit 22/22 already green; `tsc` clean; staging bundle confirmed).

| Check | Result | Notes |
|-------|--------|-------|
| Login screen | PASS | ~0.7 s TTI |
| Unenrolled reject | PASS | |
| Beat guard OTP login | PASS | ~10 s incl. OTP |
| Home dashboard | PASS | ~3.8 s networkidle |
| Report wizard | PASS | ~3.0 s |
| Map + Leaflet | PASS | ~1.3 s |
| History | PASS | |
| Profile | PASS | |
| Hathi Mitra list + search | PASS | |
| Villager onboard | PASS | |
| Cold start session restore | PASS | stayed logged in, no PIN gate |
| Offline→online reconnect | PASS | session kept |
| Beat guard ≠ admin | PASS | |
| Admin login / dashboard / users / map | PASS | map ~0.9 s |
| API sequential hot paths | PASS | reports 313 ms, nearby 400 ms |
| API concurrency ×20 | PASS | no systemic 5xx |

Preview must use `VITE_BASE_PATH=/` (same as APK build) or vite serves `/Eravat2.0/` and routes 404.

## APK

```
Go live Prep - Staging/generated/Eravat-Staging-2.0.0-perf-20260803T171744Z.apk
```

- Build: `VITE_BASE_PATH=/ npx vite build --mode staging` → `npx cap sync android` → `./gradlew assembleDebug`
- Points at staging (`ttjtyvxfiqhjdngkgdkf`) via `.env.staging.local`
- Size ~10 MB debug; branch `staging` @ `38c7607` + local uncommitted perf changes in this session

## Residual risks

- Overlapping permissive SELECT policies on `reports` remain (advisor noise); further consolidation would help authenticated latency further
- Anon/unauthenticated reports list still ~1.5–2 s (empty) under multi-policy OR — authenticated users with beat scope should be faster via indexes; worth measuring with a real JWT next
- Main JS chunk still large; further manualChunks possible
- Prod not updated — promote indexes/RLS only after staging soak + explicit ask
- Playwright smoke needs selector/PIN-expectation updates for current auth UX

## Success checklist

- [x] Measurable reduction on slow paths (timeouts→OK; code-split; auth/sync storms removed)
- [x] Best-effort 20-parallel (proxy for 50) hot endpoints without systemic failures
- [x] Background model validated (no polling; refresh/push/sync gated)
- [x] Unit tests pass; smoke documented
- [x] Staging APK produced and path documented
