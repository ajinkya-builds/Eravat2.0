#!/usr/bin/env bash
# Install system images and create Eravat_API* AVDs for compat/perf matrix.
# APIs: 24, 27 (Android 8.1), 28, 31, 33, 35 — matches minSdk 24 and UAT Vivo 1820.
set -euo pipefail

SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
EMULATOR="$SDK/emulator/emulator"
CMDLINE_ROOT="$SDK/cmdline-tools"
# Prefer latest/ if present; else any versioned dir
if [[ -x "$CMDLINE_ROOT/latest/bin/sdkmanager" ]]; then
  SDKMANAGER="$CMDLINE_ROOT/latest/bin/sdkmanager"
  AVDMANAGER="$CMDLINE_ROOT/latest/bin/avdmanager"
elif [[ -x "$CMDLINE_ROOT/bin/sdkmanager" ]]; then
  SDKMANAGER="$CMDLINE_ROOT/bin/sdkmanager"
  AVDMANAGER="$CMDLINE_ROOT/bin/avdmanager"
else
  SDKMANAGER=""
  AVDMANAGER=""
fi

ensure_cmdline_tools() {
  if [[ -n "$SDKMANAGER" && -x "$SDKMANAGER" ]]; then
    return 0
  fi
  echo "Installing Android cmdline-tools into $CMDLINE_ROOT/latest …"
  mkdir -p "$CMDLINE_ROOT"
  local zip="/tmp/commandlinetools-mac.zip"
  local url="https://dl.google.com/android/repository/commandlinetools-mac-13114758_latest.zip"
  curl -fL --retry 3 --retry-delay 2 -o "$zip" "$url"
  unzip -t "$zip" >/dev/null
  rm -rf /tmp/cmdline-tools-extract
  mkdir -p /tmp/cmdline-tools-extract
  unzip -q "$zip" -d /tmp/cmdline-tools-extract
  rm -rf "$CMDLINE_ROOT/latest"
  mkdir -p "$CMDLINE_ROOT/latest"
  # zip contains cmdline-tools/{bin,lib,…}
  mv /tmp/cmdline-tools-extract/cmdline-tools/* "$CMDLINE_ROOT/latest/"
  SDKMANAGER="$CMDLINE_ROOT/latest/bin/sdkmanager"
  AVDMANAGER="$CMDLINE_ROOT/latest/bin/avdmanager"
  yes | "$SDKMANAGER" --licenses >/tmp/eravat-sdk-licenses.txt 2>&1 || true
}

# Prefer google_apis arm64; fall back to playstore variant (matches API 36 host image).
resolve_pkg() {
  local api="$1"
  local candidates=(
    "system-images;android-${api};google_apis;arm64-v8a"
    "system-images;android-${api};google_apis_playstore;arm64-v8a"
  )
  local pkg
  for pkg in "${candidates[@]}"; do
    if "$SDKMANAGER" --list_installed 2>/dev/null | grep -qF "$pkg"; then
      printf '%s' "$pkg"
      return 0
    fi
  done
  # Not installed yet — return preferred install target
  printf '%s' "${candidates[0]}"
}

set_avd_ram() {
  local avd="$1"
  local api="$2"
  local ini="$HOME/.android/avd/${avd}.avd/config.ini"
  [[ -f "$ini" ]] || return 0
  local ram=2048
  if (( api >= 31 )); then
    ram=4096
  fi
  if grep -q '^hw.ramSize=' "$ini"; then
    sed -i.bak "s/^hw.ramSize=.*/hw.ramSize=${ram}/" "$ini"
  else
    echo "hw.ramSize=${ram}" >> "$ini"
  fi
  if grep -q '^vm.heapSize=' "$ini"; then
    sed -i.bak 's/^vm.heapSize=.*/vm.heapSize=512/' "$ini"
  else
    echo "vm.heapSize=512" >> "$ini"
  fi
  rm -f "${ini}.bak"
  echo "  RAM ${ram} MB for $avd"
}

create_one() {
  local api="$1"
  local avd="$2"
  local pkg
  pkg="$(resolve_pkg "$api")"

  if ! "$SDKMANAGER" --list_installed 2>/dev/null | grep -qF "$pkg"; then
    echo "INSTALL $pkg"
    # Try preferred, then playstore fallback
    if ! yes | "$SDKMANAGER" "$pkg" 2>&1 | tee "/tmp/eravat-sdk-install-${api}.log" | tail -5; then
      true
    fi
    if ! "$SDKMANAGER" --list_installed 2>/dev/null | grep -qF "$pkg"; then
      local alt="system-images;android-${api};google_apis_playstore;arm64-v8a"
      if [[ "$pkg" != "$alt" ]]; then
        echo "RETRY $alt"
        yes | "$SDKMANAGER" "$alt" 2>&1 | tee -a "/tmp/eravat-sdk-install-${api}.log" | tail -5 || true
        pkg="$alt"
      fi
    fi
  fi

  if ! "$SDKMANAGER" --list_installed 2>/dev/null | grep -qF "$pkg"; then
    # Final check: any installed image for this API
    local found
    found="$("$SDKMANAGER" --list_installed 2>/dev/null | grep -F "system-images;android-${api};" | head -1 | awk '{print $1}' || true)"
    if [[ -z "$found" ]]; then
      echo "SKIP $avd — no arm64 system image available for API $api (see /tmp/eravat-sdk-install-${api}.log)"
      return 0
    fi
    pkg="$found"
  fi

  if "$EMULATOR" -list-avds 2>/dev/null | grep -qx "$avd"; then
    echo "EXISTS $avd — refreshing RAM"
    set_avd_ram "$avd" "$api"
    return 0
  fi

  echo "CREATE $avd from $pkg"
  echo no | "$AVDMANAGER" create avd -n "$avd" -k "$pkg" -d pixel_3a --force
  set_avd_ram "$avd" "$api"
}

ensure_cmdline_tools

# Platform packages help some images resolve
yes | "$SDKMANAGER" \
  "platforms;android-24" \
  "platforms;android-27" \
  "platforms;android-28" \
  "platforms;android-31" \
  "platforms;android-33" \
  "platforms;android-35" \
  2>&1 | tee /tmp/eravat-sdk-platforms.log | tail -8 || true

create_one 24 Eravat_API24
create_one 27 Eravat_API27
create_one 28 Eravat_API28
create_one 31 Eravat_API31
create_one 33 Eravat_API33
create_one 35 Eravat_API35

echo "Done. Existing AVDs:"
"$EMULATOR" -list-avds
