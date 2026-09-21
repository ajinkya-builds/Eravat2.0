# Session: 2026-09-21 — Guided uninstall update (signing reset)

## Product decision

New staging keystore + Settings **guided uninstall** (no WhatsApp APK/link each release once devices are on a build that includes this UI).

## App changes (2.1.7)

- Native: `saveApkToDownloads`, `openUninstall`, `openDownloads`
- Settings: if `latest.json.requiresUninstall`, Download saves to Downloads then shows Uninstall / Open Downloads steps
- `version.json` + publish script emit `requiresUninstall: true`
- GitHub already has `ANDROID_KEYSTORE_*` for CI signed builds

## Important limit

Phones still on **old-signed 2.1.6** do **not** have this UI yet. They only get it after they are on **2.1.7+** (new keystore). The first hop onto 2.1.7 still cannot be a silent overwrite of 2.1.6.
