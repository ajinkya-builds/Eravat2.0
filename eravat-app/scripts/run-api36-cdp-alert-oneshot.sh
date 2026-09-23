#!/usr/bin/env bash
# Keep emulator alive for the whole CDP + alert re-cert (same process group).
set -uo pipefail

SDK="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
ADB="$SDK/platform-tools/adb"
EM="$SDK/emulator/emulator"
APK="/Volumes/Eravat/Eravat2.0/eravat-app/android/app/build/outputs/apk/debug/app-debug.apk"
PKG=com.forestdept.eravat
ROOT="/Volumes/Eravat/Eravat2.0/eravat-app"
LOG=/tmp/android-cdp-alert-oneshot.log

cd "$ROOT"
: > "$LOG"

pkill -f 'qemu-system-aarch64' 2>/dev/null || true
sleep 2
"$ADB" start-server >/dev/null

"$EM" -avd Medium_Phone_API_36.0 -no-snapshot-load -no-snapshot-save -no-boot-anim -gpu auto \
  >/tmp/avd36-oneshot.log 2>&1 &
EMU_PID=$!
echo "emu_pid=$EMU_PID" | tee -a "$LOG"

cleanup() {
  echo "cleanup emu_pid=$EMU_PID" | tee -a "$LOG"
  kill "$EMU_PID" 2>/dev/null || true
  "$ADB" -s emulator-5554 emu kill 2>/dev/null || true
}
trap cleanup EXIT

booted=0
for i in $(seq 1 75); do
  if ! kill -0 "$EMU_PID" 2>/dev/null; then
    echo "EMU_DIED early" | tee -a "$LOG"
    tail -50 /tmp/avd36-oneshot.log | tee -a "$LOG"
    exit 1
  fi
  boot=$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)
  act=$("$ADB" shell service check activity 2>/dev/null | tr -d '\r' || true)
  if [ "$boot" = "1" ] && echo "$act" | grep -q found; then
    echo "BOOT_OK t=$i" | tee -a "$LOG"
    booted=1
    break
  fi
  echo "t=$i boot=$boot" | tee -a "$LOG"
  sleep 4
done

if [ "$booted" != "1" ]; then
  echo BOOT_FAIL | tee -a "$LOG"
  exit 1
fi

"$ADB" devices | tee -a "$LOG"
"$ADB" shell cmd connectivity airplane-mode disable 2>/dev/null || true
"$ADB" shell svc wifi enable || true
"$ADB" shell svc data enable || true
"$ADB" install -r -t "$APK"
for p in ACCESS_FINE_LOCATION ACCESS_COARSE_LOCATION POST_NOTIFICATIONS CAMERA; do
  "$ADB" shell pm grant "$PKG" android.permission.$p 2>/dev/null || true
done
"$ADB" shell am start -n "$PKG/.MainActivity"
sleep 10
PID=$("$ADB" shell pidof "$PKG" | tr -d '\r' || true)
echo "app_pid=$PID" | tee -a "$LOG"
"$ADB" forward --remove-all 2>/dev/null || true
if [ -n "$PID" ]; then
  "$ADB" forward tcp:9222 localabstract:webview_devtools_remote_$PID || true
  curl -sS --max-time 8 http://127.0.0.1:9222/json/version 2>/dev/null | head -c 120 | tee -a "$LOG" || true
  echo | tee -a "$LOG"
fi

echo '=== CDP E2E ===' | tee -a "$LOG"
node scripts/emulator-e2e-playwright.mjs 2>&1 | tee -a "$LOG"
CDP_EC=${PIPESTATUS[0]:-1}
echo "CDP_EXIT:$CDP_EC" | tee -a "$LOG"

if ! "$ADB" devices | grep -q emulator; then
  echo NO_EMU_AFTER_CDP | tee -a "$LOG"
  exit 1
fi

echo '=== ALERT RADIUS ===' | tee -a "$LOG"
node scripts/emulator-alert-radius-e2e.mjs 2>&1 | tee -a "$LOG"
ALERT_EC=${PIPESTATUS[0]:-1}
echo "ALERT_EXIT:$ALERT_EC" | tee -a "$LOG"

echo "ONESHOT_DONE cdp=$CDP_EC alert=$ALERT_EC" | tee -a "$LOG"
if [ "$CDP_EC" != "0" ] || [ "$ALERT_EC" != "0" ]; then
  exit 1
fi
exit 0
