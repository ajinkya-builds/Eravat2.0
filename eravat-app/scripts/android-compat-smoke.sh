#!/usr/bin/env bash
# Smoke-test the staging APK on every Eravat_API* AVD (API 24+).
# Records cold-start timings and writes results.json.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
ADB="$SDK/platform-tools/adb"
EMULATOR="$SDK/emulator/emulator"
AVDMANAGER="$SDK/cmdline-tools/latest/bin/avdmanager"
OUT="${ANDROID_COMPAT_OUT:-$ROOT/../Go live Prep - Staging/generated/android-compat}"
APK="${1:-$ROOT/android/app/build/outputs/apk/debug/app-debug.apk}"
PKG="com.forestdept.eravat"
RESULTS_JSON="$OUT/results.json"
# Faster, cleaner teardown between AVDs (avoids looking like a crash-loop)
export ANDROID_EMULATOR_WAIT_TIME_BEFORE_KILL="${ANDROID_EMULATOR_WAIT_TIME_BEFORE_KILL:-0}"

mkdir -p "$OUT"

if [[ ! -f "$APK" ]]; then
  echo "APK not found: $APK" >&2
  echo "Build first: cd eravat-app && npm run build:android:staging && (cd android && ./gradlew assembleDebug)" >&2
  exit 1
fi

# Results accumulate as JSON lines then assembled at end
RESULTS_TMP="$(mktemp)"
trap 'rm -f "$RESULTS_TMP"' EXIT

list_avds() {
  "$EMULATOR" -list-avds 2>/dev/null | grep -E '^Eravat_API' || true
}

api_from_avd() {
  local name="$1"
  if [[ "$name" =~ API([0-9]+) ]]; then
    echo "${BASH_REMATCH[1]}"
  else
    echo "0"
  fi
}

budget_ms_for_api() {
  local api="$1"
  if (( api >= 36 )); then
    echo 6000
  elif (( api >= 31 )); then
    echo 8000
  else
    echo 12000
  fi
}

kill_emulators() {
  local serial
  for serial in $("$ADB" devices | awk 'NR>1 && /emulator-/{print $1}'); do
    "$ADB" -s "$serial" emu kill >/dev/null 2>&1 || true
  done
  pkill -f 'qemu-system-aarch64' >/dev/null 2>&1 || true
  local i=0
  while (( i < 30 )); do
    if ! "$ADB" devices 2>/dev/null | awk 'NR>1 && /emulator-/{found=1} END{exit found?0:1}'; then
      return 0
    fi
    sleep 1
    i=$((i + 1))
  done
  return 0
}

boot_avd() {
  local name="$1"
  echo "Booting $name..." >&2
  "$EMULATOR" -avd "$name" -no-snapshot-load -no-snapshot-save -no-boot-anim -gpu auto \
    >/tmp/eravat-emu-"$name".log 2>&1 &
  local i=0
  local serial=""
  local boot=""
  while (( i < 150 )); do
    serial="$("$ADB" devices | awk 'NR>1 && /emulator-/ && $2=="device"{print $1; exit}')"
    if [[ -n "$serial" ]]; then
      boot="$("$ADB" -s "$serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')"
      if [[ "$boot" == "1" ]]; then
        # Activity manager must be up (avoids blank WebView after thrash)
        if "$ADB" -s "$serial" shell service check activity 2>/dev/null | grep -q found; then
          printf '%s' "$serial"
          return 0
        fi
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

ui_dump_text() {
  local serial="$1"
  local xml="$2"
  "$ADB" -s "$serial" shell uiautomator dump /sdcard/eravat-ui.xml >/dev/null 2>&1 </dev/null || true
  "$ADB" -s "$serial" pull /sdcard/eravat-ui.xml "$xml" >/dev/null 2>&1 </dev/null || true
  if [[ -f "$xml" ]]; then
    # Flatten text=/content-desc=
    python3 - "$xml" <<'PY'
import re, sys
raw = open(sys.argv[1], errors='ignore').read()
parts = re.findall(r'(?:text|content-desc)="([^"]*)"', raw)
print(' '.join(p for p in parts if p.strip()))
PY
  fi
}

classify_launch() {
  # stdout: gate | app | unknown
  local serial="$1"
  local dir="$2"
  local text
  text="$(ui_dump_text "$serial" "$dir/ui.xml")"
  echo "$text" > "$dir/ui-text.txt"
  if echo "$text" | grep -Eiq 'Update Android System WebView|Update WebView|System WebView'; then
    echo gate
    return
  fi
  if echo "$text" | grep -Eiq 'Welcome Back|Send OTP|Add Sighting|Nearby Sightings|ERAVAT'; then
    echo app
    return
  fi
  # logcat URL / title hints
  if grep -Eiq 'outdated-webview|Update Android System WebView' "$dir/logcat.txt" 2>/dev/null; then
    echo gate
    return
  fi
  echo unknown
}

append_result() {
  local name="$1" api="$2" ok="$3" cold_ms="$4" budget="$5" detail="$6"
  python3 - "$RESULTS_TMP" "$name" "$api" "$ok" "$cold_ms" "$budget" "$detail" <<'PY'
import json, sys
path, name, api, ok, cold, budget, detail = sys.argv[1:8]
row = {
  "avd": name,
  "api": int(api),
  "ok": ok == "true",
  "coldStartMs": int(cold) if cold.lstrip("-").isdigit() else None,
  "budgetMs": int(budget),
  "detail": detail,
}
with open(path, "a") as f:
  f.write(json.dumps(row) + "\n")
PY
}

smoke_one() {
  local name="$1"
  local serial="$2"
  local api
  api="$(api_from_avd "$name")"
  local budget
  budget="$(budget_ms_for_api "$api")"
  local dir="$OUT/$name"
  mkdir -p "$dir"
  echo "=== $name ($serial) API=$api budget=${budget}ms ===" >&2

  "$ADB" -s "$serial" install -r -t "$APK" </dev/null
  "$ADB" -s "$serial" shell settings put global device_provisioned 1 >/dev/null 2>&1 </dev/null || true
  "$ADB" -s "$serial" shell settings put secure user_setup_complete 1 >/dev/null 2>&1 </dev/null || true
  "$ADB" -s "$serial" shell pm grant "$PKG" android.permission.ACCESS_FINE_LOCATION >/dev/null 2>&1 </dev/null || true
  "$ADB" -s "$serial" shell pm grant "$PKG" android.permission.ACCESS_COARSE_LOCATION >/dev/null 2>&1 </dev/null || true
  "$ADB" -s "$serial" logcat -c </dev/null || true
  "$ADB" -s "$serial" shell am force-stop "$PKG" </dev/null || true
  sleep 1

  local t0
  t0="$(python3 -c 'import time; print(int(time.time()*1000))')"
  "$ADB" -s "$serial" shell am start -n "$PKG/.MainActivity" >/dev/null </dev/null

  local cold_ms=-1
  local kind=unknown
  local deadline=$(( t0 + budget + 5000 ))
  local now
  while true; do
    now="$(python3 -c 'import time; print(int(time.time()*1000))')"
    if (( now > deadline )); then
      break
    fi
    if app_running "$serial"; then
      "$ADB" -s "$serial" exec-out screencap -p > "$dir/01-launch.png" 2>/dev/null </dev/null || true
      "$ADB" -s "$serial" logcat -d -t 800 > "$dir/logcat.txt" </dev/null || true
      kind="$(classify_launch "$serial" "$dir")"
      if [[ "$kind" != "unknown" ]]; then
        cold_ms=$(( now - t0 ))
        break
      fi
    fi
    sleep 0.6
  done

  if [[ "$cold_ms" == "-1" ]]; then
    now="$(python3 -c 'import time; print(int(time.time()*1000))')"
    cold_ms=$(( now - t0 ))
    "$ADB" -s "$serial" exec-out screencap -p > "$dir/01-launch.png" 2>/dev/null </dev/null || true
    "$ADB" -s "$serial" logcat -d -t 800 > "$dir/logcat.txt" </dev/null || true
    kind="$(classify_launch "$serial" "$dir")"
  fi

  app_running "$serial" && echo running > "$dir/pid.txt" || true
  echo "$kind" > "$dir/launch-kind.txt"
  echo "$cold_ms" > "$dir/cold-start-ms.txt"

  local ok=true
  local detail="coldStartMs=${cold_ms}; kind=${kind}"
  local has_js_crash=false
  if grep -Eiq 'chromium.*Uncaught|AndroidRuntime.*FATAL EXCEPTION|SyntaxError|Cannot find variable' "$dir/logcat.txt" 2>/dev/null; then
    has_js_crash=true
  fi

  if [[ ! -s "$dir/pid.txt" ]]; then
    ok=false
    detail="${detail}; process not running"
    echo "FAIL $name: process not running" >&2
  elif [[ "$kind" == "gate" ]]; then
    # Outdated WebView interstitial is the correct outcome on old System WebView.
    detail="${detail}; outdated-webview gate OK"
    echo "PASS $name (outdated-WebView gate, ${cold_ms}ms)" >&2
  elif [[ "$kind" == "app" ]]; then
    if [[ "$has_js_crash" == "true" ]]; then
      ok=false
      detail="${detail}; logcat JS errors with app UI"
      echo "FAIL $name: JS/native errors in logcat (see $dir/logcat.txt)" >&2
    elif (( cold_ms > budget )); then
      ok=false
      detail="${detail}; over budget ${budget}ms"
      echo "FAIL $name: cold-start ${cold_ms}ms > budget ${budget}ms" >&2
    else
      echo "PASS $name (app UI, cold-start ${cold_ms}ms / budget ${budget}ms)" >&2
    fi
  else
    # Unknown UI: fail hard on SyntaxError (broken ESM), else fail as unknown
    if [[ "$has_js_crash" == "true" ]]; then
      ok=false
      detail="${detail}; JS crash without gate/app UI"
      echo "FAIL $name: JS errors and no outdated-WebView gate (see $dir/logcat.txt)" >&2
    else
      ok=false
      detail="${detail}; unknown UI"
      echo "FAIL $name: could not classify launch UI (see $dir/01-launch.png)" >&2
    fi
  fi

  append_result "$name" "$api" "$ok" "$cold_ms" "$budget" "$detail"
  [[ "$ok" == "true" ]]
}

write_summary() {
  python3 - "$RESULTS_TMP" "$RESULTS_JSON" <<'PY'
import json, sys
from datetime import datetime, timezone
src, dest = sys.argv[1:3]
rows = []
try:
  with open(src) as f:
    for line in f:
      line = line.strip()
      if line:
        rows.append(json.loads(line))
except FileNotFoundError:
  pass
summary = {
  "ranAt": datetime.now(timezone.utc).isoformat(),
  "ok": all(r.get("ok") for r in rows) if rows else False,
  "passed": sum(1 for r in rows if r.get("ok")),
  "failed": sum(1 for r in rows if not r.get("ok")),
  "total": len(rows),
  "results": rows,
}
with open(dest, "w") as f:
  json.dump(summary, f, indent=2)
print(f"Wrote {dest} ({summary['passed']}/{summary['total']} passed)")
PY
}

main() {
  local -a avd_list=()
  local line
  while IFS= read -r line; do
    [[ -n "$line" ]] && avd_list+=("$line")
  done < <(list_avds)
  if (( ${#avd_list[@]} == 0 )); then
    echo "No Eravat_API* AVDs found. Create them with scripts/create-android-compat-avds.sh" >&2
    [[ -x "$AVDMANAGER" ]] && "$AVDMANAGER" list avd || true
    exit 1
  fi
  echo "AVDs to test (${#avd_list[@]}):" >&2
  printf '  - %s\n' "${avd_list[@]}" >&2
  : > "$RESULTS_TMP"
  kill_emulators || true
  local failed=0
  local name serial
  # IMPORTANT: do not feed the AVD list via the loop's stdin — adb/install reads stdin and would drink the rest of the names.
  for name in "${avd_list[@]}"; do
    echo "---- starting $name ----" >&2
    if ! serial="$(boot_avd "$name")"; then
      echo "FAIL $name: emulator did not boot" >&2
      append_result "$name" "$(api_from_avd "$name")" "false" "-1" "$(budget_ms_for_api "$(api_from_avd "$name")")" "emulator did not boot"
      failed=1
      kill_emulators || true
      continue
    fi
    if ! smoke_one "$name" "$serial"; then
      failed=1
    fi
    kill_emulators || true
  done
  write_summary
  exit "$failed"
}

main
