# Observability & Product Analytics — CTO Plan

> **Audience:** Product + eng. Written so a non-technical PM can decide *what* we need; engineers get *how* to build it.  
> **Constraint:** $0 for staging and production (free tiers only, with hard spend caps).  
> **Status:** Unified local instrumentation ready; PostHog org connected via MCP. Wizard branch must **not** be merged as-is — reconciled into current work. Waiting on live smoke test to confirm event delivery.  
> **Date:** 2026-08-04

---

## Setup checklist — what Product / CTO must do (you)

### Current PostHog status (verified via MCP)

| Item | Status |
| ---- | ------ |
| Organization | **Eravat 2.0** (US cloud) |
| Projects | **Eravat Staging** only (free plan — second project blocked for now) |
| Dashboard | [Analytics basics (wizard)](https://us.posthog.com/project/542599/dashboard/1952666) — empty until first events |
| App env keys | Written to local `.env.local` / `.env.staging.local` / `.env.production.local` (same Staging token until Prod project exists) |
| Wizard GitHub branch | `origin/posthog/instrumentation-c5bed1` — **do not merge raw**; features folded into staging working tree |

### Decision (2026-08-04)

- Use **one** PostHog project (**Eravat Staging**) for local + staging now.
- **Prod project deferred** — free plan cannot add another project yet. Tracked as open todo.
- Until then, every event is tagged with `app_env` (`development` / `staging` / `production`) so we can filter if a prod build temporarily shares this project.
- When a Production project is available: create it, put its `phc_` only in `.env.production.local` + CI, set billing limit $0, and stop using the Staging token on prod builds.

### Still do in PostHog UI

1. ~~Rename Default project~~ → **Eravat Staging** (done).
2. **Organization → Billing** → set **billing limits to $0** on Product Analytics, Error Tracking, Session Replay, Logs (if not already).
3. **Later:** create **Eravat Production** when the plan allows (see todo above).

### Do **not** merge the wizard branch as-is

The GitHub wizard branch uses different env var names, throws in local dev when keys are missing, and lacks auth/sync/screen/privacy instrumentation. Current local code is the source of truth.

---

## What Engineering already wired

App code is ready; remote delivery starts when keys are in env files.

| Piece | Location |
| ----- | -------- |
| PostHog SDK init | `eravat-app/src/lib/posthogClient.ts`, called from `main.tsx` |
| Structured logger → errors to PostHog | `eravat-app/src/lib/logger.ts` |
| Product events (`track`) | `eravat-app/src/lib/analytics.ts` |
| Screen views | `ScreenAnalytics` in router |
| Crash reporting | `AppErrorBoundary` |
| Auth / OTP / PIN events | `AuthContext`, `Login` |
| Report save funnel | `ReportStepper` |
| Sync + network | `syncService`, `NetworkSync` in `App.tsx` |
| Privacy toggle (persisted) | `PrivacySecurity` + `analyticsConsent.ts` |
| Env template | `eravat-app/.env.example` |

Without `VITE_POSTHOG_KEY`, the app runs normally and skips remote telemetry (safe for local/dev).

---

## 1. Executive answer (baseline before this work)

**Did the app have a logging mechanism?**  
**No — not in a product sense** (before this instrumentation).

What existed before:

| What you might think is logging | What it actually is |
| ------------------------------- | ------------------- |
| `console.log` / `console.error` in the app | Developer debug prints. Visible only on the phone/browser being tested. **Lost in the field.** |
| React `AppErrorBoundary` | Shows a recovery screen when the UI crashes. Still only logs to the device console. |
| Supabase Dashboard → Logs | Backend/API/Edge Function logs. Useful for server issues; **not** user journeys or app crashes on devices. |
| Admin “analytics” dashboards | Business KPIs (sightings, conflict). **Not** product analytics (who got stuck where). |
| Privacy → “Share Analytics” toggle | Was a UI stub — **now wired** to consent + PostHog opt-in/out. |
| `audit_log` DB table | Schema exists; **app never writes to it**. |

**Bottom line for PM:** After keys are added and a staging build is shipped, you will see crashes and funnels in PostHog without collecting phones from the field.

---

## 2. What we need (plain language)

We need **two related but different systems**:

### A. Logging / error observability (“something broke”)

Answers:

- What crashed?
- Which screen / sync step failed?
- Staging vs production?
- App version / device / role?

### B. User-journey analytics (“how people use the app”)

Answers:

- Which paths are most common?
- Where do funnels drop off (OTP → PIN → dashboard → first report)?
- Which failures are frequent (OTP fail, sync fail, media upload fail)?
- Do offline users recover successfully when they come online?

**Recommendation:** One free platform for both → **PostHog Cloud** (separate projects for Staging and Production). Keep **Supabase logs** for backend. Do **not** buy Sentry + Mixpanel + Datadog.

---

## 3. Why PostHog (CTO decision)

| Need | PostHog free tier (approx.) | Why it fits Eravat |
| ---- | --------------------------- | ------------------ |
| Product analytics / funnels / paths | **1M events / month** | Field force is small vs consumer apps; 1M is ample. |
| Error / exception tracking | **100K exceptions / month** | Covers crashes + caught failures. |
| Session replay (optional later) | **5K recordings / month** | Useful for UI bugs; must be privacy-gated. |
| Cost | $0 with **billing limits set to $0** | Meets “free for staging + prod”. |
| Capacitor / PWA | Official JS SDK | Works in browser PWA and Android WebView. |
| Team seats | Unlimited | PM + eng can all view dashboards. |

**Alternatives considered and rejected for v1:**

| Tool | Why not first |
| ---- | ------------- |
| Sentry alone | Excellent errors; weak funnels → we’d still need a second tool. |
| Firebase Analytics / Crashlytics | Tight to Google; weaker funnel UX for PMs; we’d still need product analytics. |
| Mixpanel / Amplitude | Analytics-only; paid sooner; no free error tracking. |
| Self-host PostHog / GlitchTip | “Free software” but **not free** (server time, ops). |
| Only Supabase `audit_log` | Good for security audit; bad for funnels, crashes, mobile offline. |

**Backend stays on Supabase:** Edge Function `console` logs + Dashboard / MCP `get_logs` remain the source of truth for server-side failures (`create-user`, `send-push`, etc.).

---

## 4. Target architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Eravat App (PWA / Capacitor Android)                       │
│                                                             │
│  logger.ts  ──► structured console (dev)                    │
│       │                                                     │
│       ├──► PostHog captureException  (errors / crashes)     │
│       └──► PostHog capture(event)    (journey / funnels)    │
│                                                             │
│  Privacy "Share Analytics" toggle ──► opt-in gate           │
│  Offline queue (Dexie) ──► flush events when online         │
└───────────────────────────┬─────────────────────────────────┘
                            │
          ┌─────────────────┴─────────────────┐
          ▼                                   ▼
   PostHog project: Staging          PostHog project: Production
   (VITE_POSTHOG_KEY_STAGING)        (VITE_POSTHOG_KEY_PROD)
          │                                   │
          └────────── PM dashboards ──────────┘
               Funnels · Paths · Failures · Errors

Supabase (unchanged): Auth / DB / Storage / Edge Function platform logs
```

**Environment rule:** Staging APK / staging web build → Staging PostHog project. Production build → Production PostHog project. Never mix.

---

## 5. Privacy & compliance (non-negotiable)

Eravat is used by Forest Department field staff. Treat telemetry as **operational diagnostics**, not marketing tracking.

1. **Opt-in:** Wire the existing Privacy → “Share Analytics” toggle. Default **on** for enrolled staff (operational tool), but honor off immediately (stop sending; flush local queue).
2. **No secrets:** Never send OTP codes, PIN, passwords, access tokens, full phone numbers in clear text.
3. **Identifiers:** Prefer opaque `user_id` (Supabase UUID). If phone is needed for support, hash/mask (last 4 only).
4. **No report media in telemetry:** Never upload photos, GPS tracks as blobs, or report narrative text to PostHog.
5. **Session replay:** Off by default. Enable later only on staging, with masking of all inputs and no media.
6. **PII in properties:** Allowed properties are role, division/range/beat **IDs** (not village names if sensitive), app version, platform, online/offline, error codes.
7. **Document in Privacy Policy** before production enablement.
8. **Billing safety:** In both PostHog projects set **billing limits to $0** so overage cannot create a bill.

---

## 6. Logging design (errors)

### 6.1 Thin app logger

Add `eravat-app/src/lib/logger.ts`:

| Level | When | Sent to PostHog? |
| ----- | ---- | ---------------- |
| `debug` | Dev-only noisy traces | No |
| `info` | Significant milestones (optional) | Only if also a product event |
| `warn` | Recoverable oddities | Optional as `$exception` with severity warn |
| `error` | Failures that need attention | Yes — `captureException` + context |

Replace ad-hoc `console.error` in critical paths first: Auth, ReportStepper, syncService, PushNotificationService, AppErrorBoundary, supabase client init.

### 6.2 Always attach context

Every remote error should include:

- `env`: `staging` | `production`
- `app_version` / build id
- `platform`: `web` | `android`
- `online`: boolean
- `user_role` (if logged in)
- `screen` / route
- `feature`: e.g. `auth.otp`, `report.save`, `sync.upload_media`

### 6.3 Wire AppErrorBoundary

On render crash → `logger.error` + PostHog exception with component stack. Keep the existing recovery UI.

### 6.4 Backend

No change required for v1 beyond continuing to use Supabase logs. Optional later: forward Edge Function errors to PostHog via a small wrapper (still free within exception quota).

---

## 7. User-journey / funnel design

### 7.1 Event naming convention

`domain.object_action` in `snake_case`, past tense where it fits:

Examples: `auth.otp_sent`, `auth.otp_failed`, `report.wizard_opened`, `sync.completed`.

Keep a **single event catalog** in this doc (below). Engineers must not invent one-off names.

### 7.2 Core events (v1 catalog)

#### Auth & unlock

| Event | When | Key properties |
| ----- | ---- | -------------- |
| `auth.login_opened` | Login screen shown | `platform` |
| `auth.phone_submitted` | User taps Send OTP | `enrolled` (bool if known) |
| `auth.otp_sent` | OTP request succeeded | |
| `auth.otp_failed` | OTP request/verify failed | `error_code` |
| `auth.otp_verified` | OTP accepted | |
| `auth.unenrolled_rejected` | Number not enrolled | |
| `auth.pin_setup_started` | First-time PIN flow | |
| `auth.pin_setup_completed` | PIN saved | |
| `auth.pin_unlock_succeeded` | Cold start unlock OK | |
| `auth.pin_unlock_failed` | Wrong PIN / lockout | `attempts` |
| `auth.session_restored` | Returning session | |

#### Core field loop

| Event | When | Key properties |
| ----- | ---- | -------------- |
| `app.screen_viewed` | Route change | `screen` |
| `report.wizard_opened` | `/report` opened | `online` |
| `report.step_viewed` | Stepper step shown | `step` |
| `report.datetime_captured` | Device date/time applied | `duration_ms`, `source` (`prefetch` / `retry`) |
| `report.gps_prefetch_started` | GPS request began | `source`, `timeout_ms` |
| `report.gps_acquired` | GPS fix received | `duration_ms`, `accuracy_m`, `source` |
| `report.gps_failed` | GPS request failed | `duration_ms`, `error_code`, `source` |
| `report.save_started` | Save tapped | `has_media`, `online` |
| `report.save_succeeded` | Local +/or remote save OK | `report_type`, `queued` |
| `report.save_failed` | Save error | `error_code`, `online` |
| `map.opened` | Map page | |
| `history.opened` | Territory history | |
| `nearby.opened` | Nearby sightings | |

#### Sync & offline (highest value for field ops)

| Event | When | Key properties |
| ----- | ---- | -------------- |
| `sync.started` | Sync kickoff | `pending_count` |
| `sync.completed` | Sync finished | `uploaded`, `duration_ms` |
| `sync.failed` | Sync error | `error_code`, `stage` |
| `sync.media_failed` | Media upload fail | `error_code` |
| `network.went_offline` | Connectivity lost | |
| `network.came_online` | Connectivity restored | `pending_count` |

#### Admin (lighter)

| Event | When | Key properties |
| ----- | ---- | -------------- |
| `admin.dashboard_opened` | Admin home | `role` |
| `admin.users_opened` | User management | |
| `admin.user_create_failed` | Edge fn error | `error_code` |

### 7.3 Funnels to configure in PostHog (PM views)

**Funnel 1 — Activation (Beat Guard)**  
`auth.login_opened` → `auth.otp_sent` → `auth.otp_verified` → `auth.pin_setup_completed` → `app.screen_viewed` (dashboard) → `report.save_succeeded` (first)

**Funnel 2 — Daily report**  
`report.wizard_opened` → `report.step_completed` (last step) → `report.save_started` → `report.save_succeeded`

**Funnel 3 — Offline resilience**  
`network.went_offline` → `report.save_succeeded` (`queued=true`) → `network.came_online` → `sync.completed`

**Funnel 4 — Return unlock**  
`auth.session_restored` / cold start → `auth.pin_unlock_succeeded` → dashboard

### 7.4 Paths & failure analysis

In PostHog:

- **Paths** — most common screen sequences (discover unexpected navigation).
- **Insight: failure rates** — count `*.failed` / `*.succeeded` by `error_code`, role, env, app version.
- **Retention (optional v2)** — weekly active field users who submit ≥1 report.

Identify users only by UUID + role + territory IDs for support triage — never dump PII into shared dashboards.

---

## 8. Implementation plan (phased)

### Phase 0 — Accounts & policy (½ day, PM + eng)

1. Create PostHog org; two projects: `Eravat Staging`, `Eravat Production`.
2. Set **billing limit $0** on every product in both projects.
3. Add API keys to CI / `.env` as `VITE_POSTHOG_KEY` + `VITE_POSTHOG_HOST` (defaults to `https://us.i.posthog.com` or EU host if preferred for data residency).
4. Update Privacy Policy copy for operational analytics.
5. Decide default for Share Analytics (recommend: on for enrolled users).

### Phase 1 — Foundation + errors (1–2 days eng)

1. Add `posthog-js` dependency.
2. Create `src/lib/posthog.ts` (init once; disable if no key or analytics opted out).
3. Create `src/lib/logger.ts`.
4. Hook `AppErrorBoundary`.
5. Instrument Auth + syncService + ReportStepper error paths.
6. Verify exceptions appear in Staging project from staging APK / web.

### Phase 2 — Journey events + funnels (2–3 days eng)

1. Add `src/lib/analytics.ts` (`track(event, props)` → PostHog if opted in).
2. Autocapture **off** (we want a controlled catalog; Capacitor noise is high).
3. Manual `app.screen_viewed` on React Router changes.
4. Instrument event catalog v1 (auth, report, sync, network).
5. Wire Privacy toggle to persist preference (local storage / profile flag) and call `posthog.opt_out_capturing()` / `opt_in`.
6. Build the four funnels in PostHog; share dashboard link with PM.

### Phase 3 — Hardening (1 day)

1. Offline event queue: buffer analytics while offline; flush on reconnect (PostHog SDK helps; verify under Dexie/offline scenarios).
2. Sample or drop ultra-noisy events if volume grows.
3. Add app version + git SHA to every event.
4. Document “how to read dashboards” for PM (short section below).
5. Optional: write important **security** actions to existing `audit_log` (admin user CRUD) — separate from PostHog.

### Phase 4 — Optional later

- Session replay on **staging only**, fully masked.
- Feature flags via PostHog for gradual rollouts.
- Edge Function → PostHog exception bridge.
- Crashlytics only if native Android crashes outside WebView become a real problem.

---

## 9. Staging vs Production checklist

| Item | Staging | Production |
| ---- | ------- | ---------- |
| PostHog project | `Eravat Staging` | `Eravat Production` |
| Build flavor / env | Staging Supabase + staging key | Prod Supabase + prod key |
| Billing limit | $0 | $0 |
| Session replay | Optional, masked | Off until explicitly approved |
| Autocapture | Off | Off |
| Who looks at dashboards | Eng + PM daily during pilot | PM weekly; eng on incidents |

---

## 10. How the PM uses this (no engineering required)

1. Open PostHog → choose **Production** (or Staging when testing builds).
2. **Funnels** → Activation / Daily report / Offline / Unlock — watch conversion %.
3. **Insights** → filter events ending in `_failed` last 7 days — sort by count.
4. **Error tracking** → open top issues; share link with eng (includes stack + context).
5. **Paths** → see common journeys; spot dead-ends (e.g. Settings loops).

When reporting a bug to eng, include: date/time, approximate user role, screen, and PostHog error/funnel link — not the user’s OTP or PIN.

---

## 11. Success metrics (after 2 weeks of data)

| Metric | Target signal |
| ------ | ------------- |
| % of production crashes with a PostHog issue | ≈100% of ErrorBoundary hits |
| Activation funnel completion (OTP → first report) | Baseline first; then improve drop-off steps |
| `report.save_failed` rate | Trend down after fixes |
| `sync.failed` rate when online | Trend down |
| Cost | $0 (limits never raised without PM+CTO approval) |

---

## 12. Out of scope (explicit)

- Replacing admin business KPI dashboards (`adminAnalyticsService`) — those stay in-app.
- Full SIEM / security monitoring — use `audit_log` later for admin actions only.
- Recording report photos or live GPS trails in analytics tools.
- Paid APM (Datadog, New Relic).

---

## 13. Decision log

| Decision | Choice |
| -------- | ------ |
| Primary product + error platform | PostHog Cloud |
| Staging/prod isolation | Two PostHog projects |
| Cost posture | Free tier + $0 billing caps |
| Backend logs | Supabase platform logs |
| Autocapture | Disabled; curated event catalog |
| Privacy toggle | Wire existing UI; honor opt-out |
| Session replay | Not in v1 production |

---

## 14. Related docs

- [`SUPABASE_OPERATIONS.md`](./SUPABASE_OPERATIONS.md) — backend log access  
- [`SYNC_RUNBOOK.md`](./SYNC_RUNBOOK.md) — sync failure playbook (extend with PostHog event names when implemented)  
- [`AUTH_ARCHITECTURE.md`](./AUTH_ARCHITECTURE.md) — planned auth telemetry notes  
- [`MANUAL_TESTING.md`](./MANUAL_TESTING.md) — add checklist items for analytics verification when shipped  

---

*Owner: Engineering. Reviewer: Product. Next step: Phase 0 account setup, then Phase 1 PR.*
