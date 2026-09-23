# Go-Live Certification Suite

Canonical pre-release validation for **Eravat 2.0** on **staging** (web + APK share the same bundle).

| Item | Value |
|------|-------|
| Staging web | https://eravat.netlify.app |
| Staging Supabase | `ttjtyvxfiqhjdngkgdkf` |
| UAT OTP manifest | `Go live Prep - Staging/generated/uat-testers/uat-testers-otp-manifest.json` |
| Certification report | `Go live Prep - Staging/generated/certification/report.json` |

## One command (automation)

```bash
cd eravat-app

# Quick gate (~5 min): auth, notifications, core UI, role matrix
npm run test:certify:quick

# Full web certification (~30 min): + deep journeys, review PDF, perf, load
npm run test:certify

# Full + Android emulator (builds APK, boots Eravat_E2E AVD)
npm run test:certify:emulator

# Individual deep suites
npm run test:staging:deep          # report submit, offline, villager onboard
npm run test:android:certify       # emulator only
```

## Automation suites

| Suite | Script | What it proves |
|-------|--------|----------------|
| UAT OTP auth | `verify-uat-otp-login.mjs` | Core UAT roles can log in with test OTP |
| Notification + SMS/call queue | `staging-notification-alerts-e2e.mjs` | Chain-of-command, 5 km villager `sms_queued` + `villager_call_events` queued, no-GPS skip, RPC |
| Alert radius proximity | `staging-alert-radius-proximity-e2e.mjs` | Admin proximity in/out/boundary, bounds 1–1000 km, geo-role isolation |
| Data pipeline | `prod-readiness-pipeline.mjs` | Volunteer report → DFO/BG notifications |
| Core UI E2E | `staging-e2e-playwright.mjs` | Login, field routes, admin pages (incl. Observations **Calls** modal), session |
| Role matrix | `staging-role-matrix-e2e.mjs` | admin, ccf, dfo, range_officer, beat_guard, volunteer, rrt, biologist, veterinarian × field/admin routes |
| Deep journeys | `staging-deep-journeys-e2e.mjs` | Full report submit, offline queue, damage wizard, villager onboard |
| Android emulator | `emulator-certification.mjs` | APK install, CDP WebView E2E, offline via adb |
| Emulator alert radius | `emulator-alert-radius-e2e.mjs` | WebView bell UI for proximity radius (with `--emulator`) |
| Android offline/GPS | `emulator-offline-location.mjs` | Offline cold start timing, first-try GPS, location-off banner |
| Review feedback | `review-feedback-e2e.mjs` | PDF review checklist items |
| Performance | `staging-perf-full-smoke.mjs` | TTI, page loads (incl. `/admin/observations`, `/admin/support`), API latency |
| Load | `staging-load-50.mjs` | 50 concurrent REST sessions |
| Report trigger stress | `staging-report-trigger-stress.mjs` | Bounded parallel report inserts → trigger fan-out within budget |

Playwright specs (`npm run test:e2e`) run against dev server with password-seeded users — use for PR CI; staging certification uses OTP UAT manifest above.

Extended roles (`ccf`, `rrt`, `biologist`, `veterinarian`) are exercised in the role matrix by temporarily reassigning spare UAT beat_guard phones (OTP already enrolled), then restoring profiles.

### Android emulator stability (required for APK cert)

API 36 + Capacitor WebView + Maestro will thrash a **2 GB** AVD (system_server / Activity Manager dies, blank WebView, CDP empty replies).

| Setting | Minimum |
|---------|---------|
| AVD RAM (`hw.ramSize`) | **4096** |
| VM heap (`vm.heapSize`) | **512** |
| GPU | `-gpu auto` (avoid `swiftshader_indirect` for long suites) |
| Boot | cold boot after RAM changes (`-no-snapshot-load`) |

Fallback AVD name: `Medium_Phone_API_36.0` when `Eravat_E2E` is missing. Do **not** `adb kill-server` mid-suite — it leaves the emulator without an Activity Manager.

**Maestro /report notes:** Bottom nav is hidden on `/report` — exit via `Close and go back` then `Discard & Exit`. WebView a11y often concatenates title+description (match `.*Nearby Sightings.*`, `.*Onboard Villager.*`). Do not assert home with bare `Add Sighting` (it also appears as the report header). Role-matrix temp swaps must not leave Jamudi `7415740750` as `ccf`.

### Older API compat + perf (no FunTouch device)

Stock Google AVDs cannot recreate Vivo FunTouch. Until a USB Vivo is available, use the emulator matrix.

**WebView gate:** Capacitor `minWebViewVersion` is **69** (matches Vite modern target). Older AVD System WebViews that cannot run ESM must show `outdated-webview.html` — that is a **PASS** for gate coverage. Full login/report CDP only on APIs whose WebView is new enough (typically **31+** / API 36 baseline).

```bash
cd eravat-app
npm run test:android-compat:avds   # install images + create Eravat_API24/27/28/31/33/35
npm run test:android-compat        # cold-start + WebView gate → generated/android-compat/results.json
# API 36 baseline, then perf on API 31 (+ 35 if present):
node scripts/emulator-perf-smoke.mjs --avd Medium_Phone_API_36.0 --write-baseline
node scripts/emulator-perf-smoke.mjs --avd Eravat_API31
```

| AVD | API | Expected |
|-----|-----|----------|
| Eravat_API24 | 24 | Outdated-WebView gate (or skip if image missing) |
| Eravat_API27 | 27 | Outdated-WebView gate (8.1 / UAT Vivo 1820 proxy) |
| Eravat_API28 | 28 | Gate or full UI if WebView ≥ 69 |
| Eravat_API31 | 31 | Full cold-start + optional CDP perf |
| Eravat_API35 | 35 | Full cold-start |
| Medium_Phone_API_36.0 | 36 | Full Maestro/CDP cert baseline |

Cold-start budgets (`am start` → process + usable screencap): API ≤28 ≤12s, API ≥31 ≤8s, API 36 ≤6s. CDP perf absolute caps: login 25s, report-open 15s; ≤2× API 36 baseline when provided.

**Host RAM note:** Full API 36 CDP (19) + alert-radius + Maestro in one sitting is heavy on ≤16 GB Macs (AVD ~4 GB + WebView). Prefer: (1) compat matrix + API 31/35 CDP perf, (2) Maestro suite alone on API 36, (3) defer full `emulator-e2e-playwright.mjs` when the host is under memory pressure. WebView 69 only changes the outdated gate — modern WebView behavior is covered by API 31/35 perf + Maestro.

### FunTouch / Vivo field checklist (Layer 3 — deferred)

UAT sheet models include Vivo T3 / T4x / Y400 / V70 (FunTouch). **Skipped this round** (no FunTouch/Vivo USB device available). Stock Google AVD PASS does **not** replace a later FunTouch pass when a phone is available.

When a Vivo is available:

- [ ] Install staging APK via USB (`adb install -r`)
- [ ] Cold start to login / restored home feels acceptable (note ms if scrcpy timed)
- [ ] OTP keyboard + Verify on FunTouch IME
- [ ] Location / camera / notification permission prompts (OEM wording)
- [ ] Report camera capture (not “Use test photo”)
- [ ] FCM shade notification when secrets configured
- [ ] Airplane offline queue → online sync
- [ ] System Back / gesture exits report without trapping (Close → Discard if dirty)
- [ ] No blank WebView after overnight background

---

## Manual certification checklist

Use this when automation passes but you need human sign-off (especially APK on device). Mark each item on a release record.

### A. Authentication & session

- [ ] Unenrolled phone shows clear error (no self-signup)
- [ ] OTP send → 6-digit verify → dashboard
- [ ] Resend OTP respects 60s cooldown
- [ ] Session persists after app restart / browser reload
- [ ] Expired session banner → re-login works
- [ ] Logout clears session

### B. Location gate

- [ ] User without GPS forced to `/profile/complete-location`
- [ ] Complete location → returns to intended screen
- [ ] Profile edit updates GPS and territory labels

### C. Home dashboard (by role)

- [ ] **Beat guard / RO / DFO:** Report, Map, History, Nearby, Hathi Mitra onboard, Gram Mitra onboard (if allowed)
- [ ] **Volunteer:** Report, Map, History, Nearby — no villager/volunteer onboard
- [ ] **RRT / biologist / vet:** Villager list read-only, no onboard tiles
- [ ] **Admin / CCF / DFO:** Command Center tile visible
- [ ] **Range officer:** Command Center tile **absent**; `/admin` redirects home
- [ ] Pending sync banner when offline queue exists

### D. Report wizard (complete each path once)

**Direct sighting**

- [ ] Photo required (camera/gallery/E2E stub)
- [ ] Direct type + elephant counts
- [ ] Date/time + GPS; reject future timestamp
- [ ] Optional damage toggle → loss categories
- [ ] Review → submit → appears in history after sync

**Indirect sign**

- [ ] At least one sign type selected
- [ ] Submit and verify history entry

**Damage / conflict**

- [ ] Each loss category selectable
- [ ] “Other” requires description
- [ ] Human injury/death requires affected people ≥ 1

**Offline**

- [ ] Airplane mode → complete report → queued
- [ ] Online → auto-sync → history shows synced

### E. Map, nearby, history

- [ ] Map loads pins (direct / indirect / loss colors)
- [ ] Map radius filter 1–500 km (map view only)
- [ ] Terrain / satellite toggle
- [ ] Nearby: GPS, list, share/copy, maps link
- [ ] History: territory vs radius badges, expand, share/download
- [ ] RLS: user only sees permitted territory data

### E2. App Settings – alert radius (region-agnostic)

- [ ] **Admin** sees proximity alert radius slider in App Settings (1–1000 km, from `alert_radius_bounds`)
- [ ] DFO / Range Officer / Beat Guard do **not** see the radius slider
- [ ] Radius saves to own `profiles.notification_radius_km`
- [ ] Copy clarifies distance uses **saved profile GPS**, not live location

### F. Hathi Mitra (villagers)

- [ ] Onboard: name, phone, village autocomplete, GPS, territory
- [ ] Duplicate mobile rejected
- [ ] Home **My Villagers** tile for onboard roles (beat guard / range officer / DFO / CCF / admin)
- [ ] List: own villagers only, search by name/mobile, optional inactive
- [ ] Edit: name, phone, village, GPS, territory, notes, active, alert opt-in
- [ ] Command Center **Villager tracker** (`/admin/villagers`): search, filters, create, edit, deactivate, delete, CSV export

### G. Gram Mitra (volunteers)

- [ ] Onboard by permitted role → new user can OTP login
- [ ] Volunteer cannot onboard others

### H. In-app notifications (staff)

After a **real submitted report** in your beat:

- [ ] **Beat guard** on same beat receives chain notification
- [ ] **DFO / RRT** on division receives chain notification
- [ ] **Proximity (admin):** report within admin’s `notification_radius_km` of their **saved profile GPS** creates a proximity alert
- [ ] Bell drawer: unread count, mark read, tap navigates
- [ ] Push (if FCM configured on device): notification appears

### I. Dummy SMS / voice (Hathi Mitra)

Live SMS/voice is **not** sent on staging. Verify **queue records only**:

- [ ] After report with GPS near opted-in villager (&lt; 5 km, same division): row in `villager_alert_events` with `channel = sms_queued`
- [ ] Same report also creates `villager_call_events` with `call_status = queued` (MSG91 dialing not configured)
- [ ] Admin → Observations → **Calls** shows villager name / village / phone / status for that report
- [ ] Report without GPS: **no** villager queue rows
- [ ] Admin → Notifications log shows activity (compose remains disabled)
- [ ] Voice / SMS credits UI shows locked/deferred state

Run automation: `node scripts/staging-notification-alerts-e2e.mjs`

### J. Command Center (admin / CCF / DFO)

**Dashboards**

- [ ] `/admin` KPIs and charts load
- [ ] Conflict intelligence (`/admin/conflict`) + division filter
- [ ] Live map (`/admin/live`) date window
- [ ] Latest by division (`/admin/latest`)
- [ ] User stats (`/admin/user-stats`)

**Operations**

- [ ] Users: search, create, edit role/territory/GPS, delete
- [ ] Villagers: master tracker search/filter, create, edit, deactivate/delete, CSV
- [ ] Divisions: tree, officer assignment
- [ ] Observations: paginate, edit, delete, bulk delete, CSV export
- [ ] Map: admin pins
- [ ] Settings: alert radius policy note (per-user in App Settings; bounds in `alert_radius_bounds`)
- [ ] Deferred nav items show locked (voice, comm hub, KML, credits, etc.)

### K. Settings & profile

- [ ] Theme: light / dark / system
- [ ] Language: EN / HI / MR (spot-check Hindi on report + home)
- [ ] Privacy: analytics opt-in toggle
- [ ] Help: force sync, FAQ, privacy policy links
- [ ] Admin App Settings: alert radius slider 1–1000 km (from `alert_radius_bounds`)

### L. Performance & stress (staging)

- [ ] `staging-perf-full-smoke.mjs` — all PASS
- [ ] `staging-load-50.mjs` — no error spike
- [ ] `staging-report-trigger-stress.mjs` — report insert → trigger fan-out within budget; cleanup OK
- [ ] `staging-alert-radius-proximity-e2e.mjs` — proximity matrix PASS
- [ ] APK cold start acceptable on target devices (T3/T4/A15 from UAT sheet)
- [ ] `npm run test:android-compat` — Eravat_API* cold-start budgets PASS
- [ ] `npm run test:android-perf` — API 27 + 31 login/report timings within caps (and ≤2× API 36 baseline)
- [ ] FunTouch Layer 3 checklist (GO_LIVE § Older API / FunTouch) when a Vivo is USB-available
- [ ] Offline cold start with a saved session reaches home in a few seconds (does not wait on Auth refresh)
- [ ] `node scripts/emulator-offline-location.mjs` — offline open + GPS on emulator

### M. APK-specific (device)

- [ ] Install latest staging APK
- [ ] OTP login on cellular network
- [ ] Camera capture in report wizard
- [ ] App asks to **turn on location** at startup (system dialog), not only on the report form
- [ ] With location already on, GPS fills on the first attempt (no 2–3 refreshes)
- [ ] If location is turned on later, GPS retriees automatically (banner + watch)
- [ ] Offline GPS still returns a fix (or last known) without several refresh taps
- [ ] GPS permission prompt and accuracy
- [ ] Offline queue survives force-stop
- [ ] Back button / gesture does not trap in wizard

---

### N. Review 3 field feedback (27 Aug PDF / 20260819 build)

Automation: `node scripts/review-feedback-e2e.mjs` (includes R3.* checks) + unit tests for share date / geo cache / villager form.

- [ ] **R3.1** Offline reopen with a prior session reaches home (not OTP/PIN spinner forever). First-ever install still needs one online open for PWA/shell.
- [ ] **R3.2** Get Location returns a fresh fix; stale-cache messaging is clear; Nearby falls back sensibly.
- [ ] **R3.3** Editing report lat/lng updates Division/Range/Beat online.
- [ ] **R3.4** Offline report review shows selected DRB names (or “on sync”); share includes DRB when known.
- [ ] **R3.5** Nearby lists sightings near device GPS (also visible on Map).
- [ ] **R3.6** Share text uses DD-MM-YYYY, includes description, and photo when the platform supports file share.
- [ ] **R3.7** Villager / Hathi Mitra onboard DRB comes from GPS (not the guard’s assigned beat).
- [ ] **R3.8** My Villagers shows only people the current user onboarded.
- [ ] **R3.9** Report photo step: **Take Photo Now** primary, **Attach from Gallery** secondary.

---

## Release sign-off template

| Field | Value |
|-------|-------|
| Build / commit | |
| APK artifact | |
| Certification run | `report.json` timestamp |
| Automation | \_\_ / \_\_ suites PASS |
| Manual (A–M) | Tester name + date |
| Blockers | |
| Approved for prod | Yes / No |

---

## Updating this suite

See `.cursor/rules/test-suite-maintenance.mdc` — any feature change must extend automation + this checklist in the same change.
