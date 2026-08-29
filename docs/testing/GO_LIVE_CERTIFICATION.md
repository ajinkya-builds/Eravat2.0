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
| UAT OTP auth | `verify-uat-otp-login.mjs` | All 5 roles can log in with test OTP |
| Notification + SMS queue | `staging-notification-alerts-e2e.mjs` | Chain-of-command, conflict alerts, `sms_queued` villager events, RLS |
| Data pipeline | `prod-readiness-pipeline.mjs` | Volunteer report → DFO/BG notifications |
| Core UI E2E | `staging-e2e-playwright.mjs` | Login, field routes, admin pages, session |
| Role matrix | `staging-role-matrix-e2e.mjs` | Every role × field/admin route access |
| Deep journeys | `staging-deep-journeys-e2e.mjs` | Full report submit, offline queue, damage wizard, villager onboard |
| Android emulator | `emulator-certification.mjs` | APK install, CDP WebView E2E, offline via adb |
| Review feedback | `review-feedback-e2e.mjs` | PDF review checklist items |
| Performance | `staging-perf-full-smoke.mjs` | TTI, page loads, API latency |
| Load | `staging-load-50.mjs` | 50 concurrent REST sessions |

Playwright specs (`npm run test:e2e`) run against dev server with password-seeded users — use for PR CI; staging certification uses OTP UAT manifest above.

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
- [ ] Radius slider 1–500 km
- [ ] Terrain / satellite toggle
- [ ] Nearby: GPS, list, share/copy, maps link
- [ ] History: territory vs radius badges, expand, share/download
- [ ] RLS: user only sees permitted territory data

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
- [ ] **Proximity:** user within `notification_radius_km` gets proximity alert (unless chain already sent)
- [ ] Bell drawer: unread count, mark read, tap navigates
- [ ] Push (if FCM configured on device): notification appears

### I. Dummy SMS / voice (Hathi Mitra)

Live SMS/voice is **not** sent on staging. Verify **queue records only**:

- [ ] After report with GPS near opted-in villager (&lt; 2 km, same division): row in `villager_alert_events` with `channel = sms_queued`
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
- [ ] Settings: system `notification_radius_km` updates all profiles
- [ ] Deferred nav items show locked (voice, comm hub, KML, credits, etc.)

### K. Settings & profile

- [ ] Theme: light / dark / system
- [ ] Language: EN / HI / MR (spot-check Hindi on report + home)
- [ ] Privacy: analytics opt-in toggle
- [ ] Help: force sync, FAQ, privacy policy links

### L. Performance & stress (staging)

- [ ] `staging-perf-full-smoke.mjs` — all PASS
- [ ] `staging-load-50.mjs` — no error spike
- [ ] APK cold start acceptable on target devices (T3/T4/A15 from UAT sheet)

### M. APK-specific (device)

- [ ] Install latest staging APK
- [ ] OTP login on cellular network
- [ ] Camera capture in report wizard
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
