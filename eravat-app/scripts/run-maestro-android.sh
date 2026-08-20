#!/usr/bin/env bash
# Boot an Eravat AVD, install debug APK, run Maestro E2E flows.
# Auth flows use staging pilot beat_guard 8889184712 (OTP 123456) — see Go live Prep - Staging/generated/FIVE_TESTERS.md
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
ADB="$SDK/platform-tools/adb"
EMULATOR="$SDK/emulator/emulator"
MAESTRO="${MAESTRO_BIN:-$HOME/.maestro/bin/maestro}"
APK="${1:-$ROOT/android/app/build/outputs/apk/debug/app-debug.apk}"
AVD="${ERAVAT_MAESTRO_AVD:-Eravat_E2E}"
OUT="${MAESTRO_OUT:-$ROOT/maestro/reports/$(date -u +%Y%m%dT%H%M%SZ)}"
PKG="com.forestdept.eravat"

export PATH="$PATH:$HOME/.maestro/bin"
export MAESTRO_CLI_NO_ANALYTICS="${MAESTRO_CLI_NO_ANALYTICS:-true}"
export MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED="${MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED:-true}"

mkdir -p "$OUT"

if [[ ! -x "$MAESTRO" ]]; then
  echo "Maestro not found. Install: curl -Ls https://get.maestro.mobile.dev | bash" >&2
  exit 1
fi

if [[ ! -f "$APK" ]] || [[ "${ERAVAT_MAESTRO_REBUILD:-1}" == "1" ]]; then
  echo "Building staging debug APK with E2E autofill..." >&2
  (cd "$ROOT" && VITE_E2E_AUTOFILL_PHONE=8889184712 npm run build:android:staging)
  (cd "$ROOT/android" && ./gradlew assembleDebug)
fi

booted_serial=""
cleanup() {
  if [[ -n "${booted_serial:-}" ]]; then
    "$ADB" -s "$booted_serial" emu kill >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

wait_for_device() {
  local serial="$1"
  local i=0
  while (( i < 90 )); do
    local boot
    boot="$("$ADB" -s "$serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
    if [[ "$boot" == "1" ]]; then
      return 0
    fi
    sleep 3
    i=$((i + 1))
  done
  return 1
}

existing="$("$ADB" devices | awk 'NR>1 && /emulator-/{print $1; exit}')"
if [[ -n "$existing" ]]; then
  booted_serial="$existing"
  echo "Using running emulator: $booted_serial" >&2
else
  if ! "$EMULATOR" -list-avds | grep -qx "$AVD"; then
    AVD="$("$EMULATOR" -list-avds | head -1)"
  fi
  if [[ -z "$AVD" ]]; then
    echo "No Android AVD found. Create Eravat_E2E or run scripts/create-android-compat-avds.sh" >&2
    exit 1
  fi
  echo "Booting $AVD..." >&2
  "$EMULATOR" -avd "$AVD" -no-snapshot-save -no-boot-anim -gpu swiftshader_indirect >/tmp/eravat-maestro-emu.log 2>&1 &
  local_i=0
  while (( local_i < 90 )); do
    booted_serial="$("$ADB" devices | awk 'NR>1 && /emulator-/ && $2=="device"{print $1; exit}')"
    if [[ -n "$booted_serial" ]] && wait_for_device "$booted_serial"; then
      break
    fi
    sleep 3
    local_i=$((local_i + 1))
  done
fi

if [[ -z "$booted_serial" ]]; then
  echo "Emulator failed to boot (see /tmp/eravat-maestro-emu.log)" >&2
  exit 1
fi

echo "Installing $APK on $booted_serial..." >&2
"$ADB" -s "$booted_serial" install -r -t "$APK" >/dev/null
"$ADB" -s "$booted_serial" shell settings put global device_provisioned 1 >/dev/null 2>&1 || true
"$ADB" -s "$booted_serial" shell settings put secure user_setup_complete 1 >/dev/null 2>&1 || true

cd "$ROOT"
echo "Running Maestro flows (staging pilot auth: 8889184712 / OTP 123456)..." >&2
FAILED=0
for flow in maestro/flows/*.yaml; do
  echo "--- $flow ---" >&2
  if ! "$MAESTRO" test \
    --format junit \
    --output "$OUT/junit" \
    --debug-output "$OUT/debug" \
    "$flow"; then
    FAILED=1
  fi
  sleep 5
done
echo "Reports: $OUT" >&2
exit "$FAILED"
