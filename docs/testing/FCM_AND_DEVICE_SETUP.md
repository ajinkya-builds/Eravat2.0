# FCM push and real-device testing setup

Push notifications require **three pieces** that cannot be faked without Firebase credentials.

## 1. Firebase `google-services.json`

1. Open [Firebase Console](https://console.firebase.google.com/) → project linked to Eravat Android app.
2. Project settings → Your apps → Android (`com.forestdept.eravat`).
3. Download `google-services.json`.
4. Place at: `eravat-app/android/app/google-services.json` (gitignored).

Rebuild APK:

```bash
cd eravat-app
npm run build:android:staging
cd android && ./gradlew assembleDebug
```

Vite will set `VITE_DISABLE_PUSH_NOTIFICATIONS=false` automatically when the file exists (`vite.config.ts`).

## 2. Supabase Edge Function secrets (staging)

In Supabase Dashboard → Edge Functions → `send-push` → Secrets:

| Secret | Purpose |
|--------|---------|
| `FCM_SERVICE_ACCOUNT_JSON` | Firebase service account JSON (or base64) |
| `FCM_PROJECT_ID` | Optional if embedded in JSON |
| `PUSH_WEBHOOK_SECRET` | Optional webhook auth |

Verify:

```bash
cd eravat-app
# Requires SUPABASE_SERVICE_ROLE_KEY in .env.staging.local
node scripts/staging-push-pipeline-e2e.mjs
```

This confirms the edge function responds; invalid FCM tokens return expected errors, not 500s.

## 3. Emulator / device

```bash
# Boot emulator + Maestro native flows (report, offline, villager)
npm run test:maestro

# CDP WebView tests (alternative)
npm run test:android:certify

# All API levels
npm run test:android-compat
```

### Emulator camera

Android Emulator → **Extended controls → Camera** → upload a JPEG for virtual scene.  
Alternatively use **Use test photo** on staging builds (no camera hardware needed).

### Emulator GPS

```bash
adb emu geo fix 81.038319794626 23.857845625031
```

Or grant location permission when Maestro/CDP prompts.

## What automation covers without FCM file

| Capability | Tool |
|------------|------|
| In-app notification bell | Playwright + Maestro |
| DB chain-of-command | `staging-notification-alerts-e2e.mjs` |
| Dummy SMS queue | Same + Supabase MCP |
| `send-push` HTTP smoke | `staging-push-pipeline-e2e.mjs` |
| Report / offline / villager on APK | Maestro flows |

## What still needs a physical device

- FCM appearing in Android notification shade
- Real camera capture quality
- Cellular OTP (prod Twilio)
- Battery / background sync under real network

Use UAT devices from `Go live Prep - Staging/Eravat 2.0 Testers_List and Details.xlsx` for final sign-off.
