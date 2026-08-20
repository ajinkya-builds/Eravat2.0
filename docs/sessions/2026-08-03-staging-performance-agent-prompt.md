# Agent prompt — Eravat staging performance hardening + APK

Copy everything below the line into a new agent chat after `origin/staging` includes Hathi Mitra.

---

## Mission

You are working on **Eravat 2.0** at `/Volumes/Eravat/Eravat 2.0`.

**Branch:** `staging` (track `origin/staging`). Do not merge to `main`/prod unless explicitly asked.

**Environment:** Staging only  
- Supabase project: `ttjtyvxfiqhjdngkgdkf`  
- App env: `eravat-app/.env.staging.local` (`VITE_SUPABASE_URL` → staging)  
- Follow `.cursor/rules/supabase-remote-apply.mdc` for staging DB/Edge changes; **do not** apply performance migrations to prod (`mnytrlcmdpkfhrzrtesf`) unless Ajinkya asks.

**Goal:** Remove UI load/lag across the app so that:

1. **≥50 concurrent open app sessions** can use core flows without noticeable jank / multi-second spinners (login, home/dashboard, map, report wizard, history, profile, Hathi Mitra list/onboard, admin where relevant).
2. **~3,000 users may be logged in** with the app backgrounded / process not foregrounded — sessions must remain valid safely (PIN/session restore, token refresh, push registration) without hammering Supabase or waking the UI into expensive work loops. Validate this model; fix if background clients cause undue API/Realtime load.
3. After fixes: **run tests** (unit + staging smoke) and **generate a staging APK**.

## Product / stack context (do not re-litigate)

- Capacitor + React + Vite app in `eravat-app/`
- Supabase Auth (phone OTP) + local PIN lock; offline Dexie sync for reports
- Recent work on staging includes review batches + **Hathi Mitra** (`villages`/`villagers`, `/villagers/onboard`, `/villagers`) — keep that working
- Do not reopen finished review §§1–5,7–10 / report wizard §3 except where a change is required for performance

## Scale assumptions to design for

| Mode | Target | Implication |
|------|--------|-------------|
| Foreground concurrent | ≥50 | List queries, map pins, dashboard, autocomplete must be indexed, paginated, debounced, cached |
| Background logged-in | ~3,000 | Prefer silent token refresh; no polling storms; Realtime only when needed; push tokens update infrequently; cold start should restore session without N+1 fetches |
| Data | Staging has ~6.7k villagers + geo + reports | Villager search/autocomplete must not full-table scan on every keystroke without limits/indexes |

## Required workflow

### 1) Baseline (measure before changing)

- Profile slow paths: Dashboard, Map, History/Territory, Report wizard open, Admin users, Villagers list/autocomplete, Auth cold start / PIN unlock, SyncService on reconnect
- Use Chrome/WebView performance + Network; Capacitor Android if available
- Check Supabase advisors (`get_advisors`) on staging for missing indexes / RLS perf
- Document top offenders with approximate timings in `docs/sessions/`

### 2) Fix across layers (prioritize highest impact)

**Client**

- Eliminate waterfalls (Auth profile + assignments + home recent sightings)
- Debounce search/autocomplete (villages/villagers already partially debounced — verify)
- Paginate / limit list queries; avoid selecting unused columns / heavy embeds
- Cache stable reference data (geo divisions/ranges/beats) for session
- Ensure background: no aggressive intervals; Network listeners shouldn’t re-fetch entire app state repeatedly
- Code-split heavy routes (map/leaflet, admin) if main bundle is a cold-start cost
- Review `AuthContext` refresh / secure session decrypt path for redundant profile loads

**Supabase / Postgres (staging)**

- Add indexes supporting hot filters (villagers name/mobile, villages name_normalized, reports by territory/time, notifications)
- Fix slow RLS if policies re-evaluate expensive functions per row — use selective indexes / simplify with care
- Avoid N+1 RPCs; prefer single round-trips
- Confirm Realtime publications aren’t over-subscribed from the client

**Background session validity (~3k idle logins)**

- Validate: JWT refresh behavior with Capacitor backgrounding; `eravat_secure_session` / PIN restore path
- Ensure push token registration doesn’t fire on every resume in a loop
- Ensure SyncService doesn’t upload empty queues in a busy loop when online flaps
- Document expected battery/network cost for idle logged-in devices

### 3) Test plan (must run)

- Unit/CI: `eravat-app` existing tests + any new perf-critical utils
- Staging smoke (manual or scripted) with staging credentials:
  - Cold start → session restore / PIN if set → Home
  - Dashboard recent sightings
  - Map load + filter
  - Report wizard open
  - History
  - Hathi Mitra list search + onboard form village suggestions
  - Toggle airplane / reconnect sync once
- Concurrency check (best effort): multi-tab or light load script against staging API for hot endpoints (do not DoS; stay under ~50 parallel clients)
- Background validation: leave session logged in, background app, wait through a refresh window, foreground — still authenticated without full re-login (unless PIN lock policy requires unlock)

### 4) Deliver staging APK

- Build Capacitor Android **staging** APK pointed at `ttjtyvxfiqhjdngkgdkf` (use existing staging APK scripts/docs under `docs/` / `Go live Prep - Staging` patterns; `base: /` for Android)
- Place artifact under a clear path (e.g. `Go live Prep - Staging/generated/`) and note version/commit SHA in the session doc
- Do not publish to Play Store

### 5) Docs / handoff

Write `docs/sessions/YYYY-MM-DD-staging-performance.md` with: baseline numbers, changes, indexes/migrations applied on staging, test results, APK path, residual risks.

## Constraints

- Staging-first; no prod DB/perf migrations without explicit ask
- Don’t commit secrets (`.env*.local`, service role keys)
- Don’t force-push `main`; normal push to `staging` is fine
- Prefer focused PRs/commits on `staging`
- Keep Hathi Mitra + volunteer onboard flows working

## Success criteria

- [ ] Measurable reduction on previously slow screens (document before/after)
- [ ] 50 concurrent foreground users: no systemic failures / multi-second freezes on core flows (best-effort evidence)
- [ ] 3,000 background sessions model validated (no polling storms; session restore works)
- [ ] Staging tests pass / smoke documented
- [ ] Staging APK produced and path documented

Start by checking out `staging`, confirming app points at staging Supabase, measuring baselines, then fix systematically.
