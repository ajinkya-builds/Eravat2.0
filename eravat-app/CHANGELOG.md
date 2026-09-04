# Eravat app changelog

All notable staging/production app releases are tracked here.
Version source of truth: [`version.json`](./version.json).

Format: **versionName** (`MAJOR.MINOR.PATCH`) + Android **versionCode** (always increases).

---

## [2.1.6] — 2026-09-04 (versionCode 20106)

- Open app offline offline after JWT expiry (cold start)
- Hydrate session from local storage when Auth refresh fails
- PostHog: auth.offline_session_hydrated / init_timeout events

---
## [2.1.5] — 2026-09-03 (versionCode 20105)

- Fix Capacitor CORS for Hathi Mitra onboarding Edge Functions
- Remove Sign out from all devices stub on Privacy & Security

---
## [2.1.4] — 2026-09-03 (versionCode 20104)

- Sign staging APKs with a stable keystore so in-app updates can install
- If Android says App not installed, uninstall Eravat once then install this build

---
## [2.1.3] — 2026-09-03 (versionCode 20103)

- Pause notification realtime socket while backgrounded; FCM covers push, resume refetches
- Unify reconnect sync debounce across Capacitor and native online events
- Exponential backoff after failed automatic offline sync batches

---
## [2.1.1] — 2026-09-02 (versionCode 20101)

- Fix reinstall restoring PIN-era UI via Android Auto Backup / Service Worker
- Disable Service Worker on Capacitor APK builds
- Block Android backup restore of WebView data
- Clear stale SW caches on version change without wiping offline data

---
## [2.1.0] — 2026-09-03 (versionCode 20100)

First tracked release with in-app update support. Share this shell APK once; later builds install from **Settings → Update**.

### Added
- Settings → Check for update / Download & install (full APK)
- Staging publish of APK + `latest.json` to Supabase `app-updates` bucket
- Version registry (`version.json`) and this changelog

### Fixed
- Unexpected logout / OTP prompts after idle or offline use
- Offline cold start asking to log in again
- Offline sightings syncing wrong Division/Range/Beat
- Hathi Mitra / villager onboarding failing offline (Edge Function / network)
- Android hardware back closing the app immediately

### Changed
- Offline queues for villager + volunteer registration; sync on reconnect/resume
- Stale web caches cleared on update; login + Dexie offline data preserved

---

## [2.0.0] — 2026-08 (versionCode 2)

Pre-tracking baseline (field review APKs through Aug–Sep 2026).

### Included (historical)
- Cross-app layout / scroll / map hardening
- Review 3 offline/GPS/DRB and E2E hardening
- In-app support notes + Command Center inbox
- Hathi Mitra villager registry and field edit flows
