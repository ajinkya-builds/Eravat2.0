# Go-live ops checklist (Android pilot)

## Immediate: revoke leaked API keys

A production **legacy JWT `service_role` key** was committed to the public repo
(`ajinkya-builds/Eravat2.0`) in `eravat-app/scripts/check-user-profile.js` and
`debug-sync-error.js`. The key was confirmed live against the Auth Admin API.

**Do this in the Supabase Dashboard (cannot be done from this repo alone):**

1. Open project `mnytrlcmdpkfhrzrtesf` → **Project Settings → API Keys**.
2. **Disable / rotate the legacy JWT `service_role` and `anon` keys** (the long
   `eyJ...` tokens). The app already uses modern `sb_publishable_...` /
   `sb_secret_...` keys from env.
3. Confirm GitHub Actions secrets still use publishable keys (not the revoked JWT).
4. Optionally make the GitHub repo **private**. Free GitHub Pages will stop serving;
   Android sideload does not need Pages. Staging web already uses Netlify.
5. **Auth → Attack Protection:** enable **Leaked password protection** (Have I Been Pwned).

Tracked scripts no longer embed secrets — they read `SUPABASE_SERVICE_ROLE_KEY`
(and related) from the environment.

## Repo visibility decision

**Recommendation for this pilot:** keep using modern keys + revoke legacy JWTs;
make the repo private when ready and rely on Netlify for any web preview.

## Production wipe status (2026-07-26)

- Pre-wipe dumps in local `backups/prod-prewipe-*` (gitignored).
- Geography retained: 11 divisions / 80 ranges / 1,222 beats.
- Users + activity truncated to zero, then go-live accounts re-seeded.
- `report_media` Storage emptied; bucket set **private**.
- Geo table RLS enabled (public SELECT only).

## Pilot accounts (Test OTP = `123456`)

Configure / confirm in Dashboard → Auth → Phone → Test OTP (also pushed via `supabase config push`):

| Role | Phone (app) | Test OTP key |
|------|-------------|--------------|
| admin | 9988775566 | 919988775566 |
| beat_guard | 8899776655 | 918899776655 |
| range_officer | 9876500001 | 919876500001 |
| beat_guard | 9876500002 | 919876500002 |
| beat_guard | 9876500003 | 919876500003 |
| volunteer | 9876500004 | 919876500004 |

Territory for field pilots: Anuppur → Ahirgawa range/beat (replace with real assignments as needed).

## Android release signing

Local keystore lives under `backups/android-signing/` (gitignored). For CI, set secrets:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

For nightly DB backups, set GitHub Actions secrets:

- `SUPABASE_ACCESS_TOKEN` (Supabase account token; used for both projects)
- `SUPABASE_DB_PASSWORD` (production database password, project `mnytrlcmdpkfhrzrtesf`)
- `SUPABASE_STAGING_DB_PASSWORD` (staging database password, project `ttjtyvxfiqhjdngkgdkf`)

Dumps are **not** committed to git. They are uploaded as workflow artifacts
(`eravat-prod-backup-<run_id>` / `eravat-staging-backup-<run_id>`) and kept for
**30 days**. Download from Actions → Nightly database backup → the run → Artifacts.
Schedule: 18:30 UTC (00:00 IST) on `main`.

## Phone auth note (Test OTP pilot)

`supabase config push` disabled the Twilio SMS provider on production (intentional for
this pilot — no DLT/SMS gateway yet). Requesting an OTP returns
`phone_provider_disabled`, but **verify with the fixed Test OTP still works**.

The app treats provider-disabled as success after `check_phone_registered` so pilots
can enter the fixed code `123456`. Re-enable a real SMS provider before expanding
beyond Test OTP numbers.


1. Uninstall any previous **debug** APK (signature change).
2. Install signed release APK (`versionName 2.0.0` / `versionCode 2`).
3. Login with pilot phone + OTP `123456` → set 4-digit PIN.
4. Airplane mode: create report + optional photo → reconnect → Dashboard sync → confirm rows in `reports` / Storage.
5. Deny location permission → enter lat/lng manually → submit.
6. Cold start after unlock session → PIN unlock still works.
7. Known gaps to brief pilots: biometrics stub, no push, Hindi/Marathi incomplete, photo compression setting display-only.
