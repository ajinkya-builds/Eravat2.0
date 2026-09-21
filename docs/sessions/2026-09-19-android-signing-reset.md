# Session: 2026-09-19 — Staging signing reset (lost keystore)

## Constraint

Original release private key is gone. You **cannot** publish Settings → Update APKs that install over field **2.1.6** without that key. Public cert is in the APK; private key is not recoverable.

## Solution (one-time signature reset)

1. Generated a **new** stable staging keystore (same DN label, **new** SHA-256).
2. Stored locally (gitignored):
   - `backups/android-signing/release.jks` + `README.txt`
   - `eravat-app/android/release.jks`
   - `eravat-app/android/keystore.properties`
3. Uploaded GitHub secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
4. Fixed `scripts/set-android-signing-secrets.sh` repo-root path (`..` not `../..`).

## Field procedure (required once)

For every device still on the old 2.1.6 signature:

1. Uninstall Eravat.
2. Install the **first** APK published after this reset (or the CI artifact / Storage `eravat-staging.apk` once republished).
3. After that, Settings → Update works again for future CI ships.

## Next step (needs product confirm)

Bump staging (e.g. **2.1.7**) with a clear note like “Signing reset — uninstall once if update fails”, push `staging`, let CI publish. Do **not** bump until Ajinkya confirms field messaging.
