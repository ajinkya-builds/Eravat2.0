# Android signing — investigation (2026-09-19)

## Finding

Field APK `app-updates/staging/eravat-staging.apk` (2.1.6) **is signed** with a custom cert:

- DN: `CN=Eravat, OU=Forest Department, O=Eravat, L=Bhopal, ST=Madhya Pradesh, C=IN`
- SHA-256: `f2727361b6d9eefaf33262a6523b84f6c4864b31a9b99fea05bcfdbcd0b44efa`

This is **not** the Android debug keystore and **not** Play App Signing.

## How the pipeline is designed

1. Local (or once): create `release.jks` + `eravat-app/android/keystore.properties`
2. Upload to GitHub via `scripts/set-android-signing-secrets.sh` → secrets `ANDROID_KEYSTORE_*`
3. CI `staging-build.yml` decodes the keystore, `assembleRelease`, publishes via `publish-staging-apk.mjs`

## Current gap

- GitHub **does not** have `ANDROID_KEYSTORE_*` secrets (never listed; CI logs on 2.1.6 show “secrets missing — skipping signed APK build/publish”).
- Therefore the published 2.1.6 APK was almost certainly **built/signed + uploaded from a local machine**, not from that CI run.
- Expected local path (gitignored): `backups/android-signing/` — empty on this Mac.

## Implication for field beta

- Devices on 2.1.6 need updates signed with the **same** Eravat cert above.
- Creating a **new** keystore breaks Settings → Update (“App not installed”) until testers uninstall/reinstall.
- Prefer recovering the original `.jks` + passwords; if lost, create a new stable keystore, upload to GH secrets, and have field devices do a one-time uninstall → install of the new APK.
