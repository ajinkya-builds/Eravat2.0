# Session: 2026-03-28 — Android APK Build

## Summary

Built a working Android debug APK from the existing Capacitor + Vite setup.

## What Was Done

1. **Web Build** (`npm run build`) — Compiled 3600 modules with Vite in 4.13s. PWA service worker generated with 14 precached entries.
2. **Capacitor Sync** (`npx cap sync android`) — Copied web assets into `android/app/src/main/assets/public/`. Synced 4 native plugins: Camera, Geolocation, Network, Push Notifications.
3. **Gradle Build** (`./gradlew assembleDebug`) — First attempt failed due to a stale/corrupted build cache with space-named resource intermediates (e.g., `ic_launcher_background 2.xml`). Fixed by running `./gradlew clean` first. Clean build succeeded in 21s.

## APK Output

```
eravat-app/android/app/build/outputs/apk/debug/app-debug.apk
Size: 9.1 MB
App ID: com.forestdept.eravat
Version: 1.0 (versionCode 1)
```

## Issues Encountered & Resolved

| Issue | Root Cause | Fix |
|---|---|---|
| `mergeDebugResources` hung for 5+ min | Stale `build/` intermediates with space in filename from prior session | `./gradlew clean` |
| `ResourceDirectoryParseException: 'ic_launcher_background 2.xml'` | Corrupted build cache, not source file | Gradle clean cleared it |

## Notes

- JDK 25 was installed (docs say JDK 21 required) — build succeeded anyway with JDK 25. No Gradle compatibility errors.
- The `flatDir` warnings during configure phase are benign Gradle style warnings, not errors.
- APK is a **debug** build — unsigned for production release. For Play Store deployment, a signed release build would be needed.

## Next Steps (Optional)

- Install on emulator: `adb install android/app/build/outputs/apk/debug/app-debug.apk` (AVD: `Medium_Phone_API_36.1`)
- Install on physical device: Connect via USB, enable USB Debugging, run same `adb install` command
- Sign a release APK for distribution if needed
