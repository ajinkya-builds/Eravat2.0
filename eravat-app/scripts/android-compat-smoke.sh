#!/usr/bin/env bash
# Smoke-test the staging APK on every Eravat_API* AVD (API 24+).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
ADB="$SDK/platform-tools/adb"
EMULATOR="$SDK/emulator/emulator"
AVDMANAGER="$SDK/cmdline-tools/latest/bin/avdmanager"
OUT="${ANDROID_COMPAT_OUT:-$ROOT/../Go live Prep - Staging/generated/android-compat}"
APK="${1:-$ROOT/android/app/build/outputs/apk/debug/app-debug.apk}"
PKG="com.forestdept.eravat"

mkdir -p "$OUT"

if [[ ! -f "$APK" ]]; then
  echo "APK not found: $APK" >&2
  echo "Build first: cd eravat-app && npm run build:android:staging && (cd android && ./gradlew assembleDebug)" >&2
  exit 1
fi

list_avds() {
  "$EMULATOR" -list-avds 2>/dev/null | grep -E '^Eravat_API' || true
}

kill_emulators() {
  local serial
  for serial in $("$ADB" devices | awk 'NR>1 && /emulator-/{print $1}'); do
    "$ADB" -s "$serial" emu kill >/dev/null 2>&1 || true
  done
  local i=0
  while (( i < 20 )); do
    if ! "$ADB" devices | awk 'NR>1 && /emulator-/{found=1} END{exit found?0:1}'; then
      return 0
    fi
    sleep 1
    i=$((i + 1))
  done
}

boot_avd() {
  local name="$1"
  echo "Booting $name..." >&2
  "$EMULATOR" -avd "$name" -no-snapshot-save -no-boot-anim -gpu swiftshader_indirect >/tmp/eravat-emu-"$name".log 2>&1 &
  local i=0
  local serial=""
  local boot=""
  while (( i < 120 )); do
    serial="$("$ADB" devices | awk 'NR>1 && /emulator-/ && $2=="device"{print $1; exit}')"
    if [[ -n "$serial" ]]; then
      boot="$("$ADB" -s "$serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')"
      if [[ "$boot" == "1" ]]; then
        printf '%s' "$serial"
        return 0
      fi
    fi
    sleep 4
    i=$((i + 1))
  done
  return 1
}

app_running() {
  local serial="$1"
  if "$ADB" -s "$serial" shell pidof "$PKG" 2>/dev/null | grep -q '[0-9]'; then
    return 0
  fi
  "$ADB" -s "$serial" shell ps 2>/dev/null | grep -q "$PKG"
}

smoke_one() {
  local name="$1"
  local serial="$2"
  local dir="$OUT/$name"
  mkdir -p "$dir"
  echo "=== $name ($serial) ===" >&2
  "$ADB" -s "$serial" install -r -t "$APK"
  "$ADB" -s "$serial" shell settings put global device_provisioned 1 >/dev/null 2>&1 || true
  "$ADB" -s "$serial" shell settings put secure user_setup_complete 1 >/dev/null 2>&1 || true
  "$ADB" -s "$serial" logcat -c || true
  "$ADB" -s "$serial" shell am force-stop "$PKG" || true
  "$ADB" -s "$serial" shell am start -n "$PKG/.MainActivity"
  sleep 15
  "$ADB" -s "$serial" exec-out screencap -p > "$dir/01-launch.png"
  app_running "$serial" && echo running > "$dir/pid.txt" || true
  "$ADB" -s "$serial" logcat -d -t 500 > "$dir/logcat.txt" || true
  if grep -Eiq 'chromium.*Uncaught|AndroidRuntime.*FATAL EXCEPTION|SyntaxError|Cannot find variable' "$dir/logcat.txt"; then
    echo "FAIL $name: JS/native errors in logcat (see $dir/logcat.txt)" >&2
    return 1
  fi
  if [[ ! -s "$dir/pid.txt" ]]; then
    echo "FAIL $name: process not running" >&2
    return 1
  fi
  echo "PASS $name (process alive, launch screenshot saved)" >&2
}

main() {
  local avds
  avds="$(list_avds)"
  if [[ -z "$avds" ]]; then
    echo "No Eravat_API* AVDs found. Create them with scripts/create-android-compat-avds.sh" >&2
    "$AVDMANAGER" list avd || true
    exit 1
  fi
  kill_emulators
  local failed=0
  local name serial
  while IFS= read -r name; do
    [[ -z "$name" ]] && continue
    if ! serial="$(boot_avd "$name")"; then
      echo "FAIL $name: emulator did not boot" >&2
      failed=1
      kill_emulators
      continue
    fi
    if ! smoke_one "$name" "$serial"; then
      failed=1
    fi
    kill_emulators
  done <<< "$avds"
  exit "$failed"
}

main
