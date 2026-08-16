#!/usr/bin/env bash
# Create API 24 / 28 / 31 / 35 AVDs when the matching system image is installed.
set -euo pipefail

SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
AVDMANAGER="$SDK/cmdline-tools/latest/bin/avdmanager"
SDKMANAGER="$SDK/cmdline-tools/latest/bin/sdkmanager"

create_if_image() {
  local api="$1"
  local avd="$2"
  local pkg="system-images;android-${api};google_apis;arm64-v8a"
  if ! "$SDKMANAGER" --list_installed 2>/dev/null | grep -q "system-images;android-${api};google_apis;arm64-v8a"; then
    echo "SKIP $avd — image not installed: $pkg"
    return 0
  fi
  if "$SDK/emulator/emulator" -list-avds 2>/dev/null | grep -qx "$avd"; then
    echo "EXISTS $avd"
    return 0
  fi
  echo "CREATE $avd"
  echo no | "$AVDMANAGER" create avd -n "$avd" -k "$pkg" -d pixel_3a --force
}

create_if_image 24 Eravat_API24
create_if_image 28 Eravat_API28
create_if_image 31 Eravat_API31
create_if_image 33 Eravat_API33
create_if_image 35 Eravat_API35
echo "Done. Existing AVDs:"
"$SDK/emulator/emulator" -list-avds
