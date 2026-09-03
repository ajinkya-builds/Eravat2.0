#!/usr/bin/env bash
# Upload local Android signing material to GitHub Actions secrets.
# Prereq: gh auth login (repo admin), and eravat-app/android/keystore.properties present.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PROPS="$ROOT/eravat-app/android/keystore.properties"
REPO="${GITHUB_REPOSITORY:-ajinkya-builds/Eravat2.0}"

if ! command -v gh >/dev/null; then
  echo "Install GitHub CLI (gh) first."
  exit 1
fi
if ! gh auth status >/dev/null 2>&1; then
  echo "Run: gh auth login"
  exit 1
fi
if [[ ! -f "$PROPS" ]]; then
  echo "Missing $PROPS"
  exit 1
fi

# shellcheck disable=SC1090
storeFile=$(grep -E '^storeFile=' "$PROPS" | cut -d= -f2-)
storePassword=$(grep -E '^storePassword=' "$PROPS" | cut -d= -f2-)
keyAlias=$(grep -E '^keyAlias=' "$PROPS" | cut -d= -f2-)
keyPassword=$(grep -E '^keyPassword=' "$PROPS" | cut -d= -f2-)

JKS="$ROOT/eravat-app/android/$storeFile"
if [[ ! -f "$JKS" ]]; then
  JKS="$ROOT/backups/android-signing/$storeFile"
fi
if [[ ! -f "$JKS" ]]; then
  echo "Keystore not found for storeFile=$storeFile"
  exit 1
fi

echo "Uploading ANDROID_KEYSTORE_* secrets to $REPO …"
base64 < "$JKS" | gh secret set ANDROID_KEYSTORE_BASE64 --repo "$REPO"
printf '%s' "$storePassword" | gh secret set ANDROID_KEYSTORE_PASSWORD --repo "$REPO"
printf '%s' "$keyAlias" | gh secret set ANDROID_KEY_ALIAS --repo "$REPO"
printf '%s' "$keyPassword" | gh secret set ANDROID_KEY_PASSWORD --repo "$REPO"
echo "Done. Re-run the staging workflow to publish signed APKs from CI."
