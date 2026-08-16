#!/usr/bin/env bash
# One-time: authorize rclone against the dedicated Eravat Google account and
# store the token as GitHub Actions secret RCLONE_CONFIG (not in git).
set -euo pipefail

REPO="${ERAVAT_GITHUB_REPO:-ajinkya-builds/Eravat2.0}"
REMOTE="${ERAVAT_GDRIVE_REMOTE:-eravat-gdrive}"

export PATH="/opt/homebrew/bin:/usr/local/bin:${PATH}"

if ! command -v rclone >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    brew install rclone
  else
    echo "Install rclone first: https://rclone.org/install/"
    exit 1
  fi
fi

echo "A browser window will open. Sign in as the dedicated Eravat Google account"
echo "(not a personal Gmail), then allow Drive access."
echo

# Recreate remote so we do not reuse connectwithajinkya / this-Mac Drive Desktop.
rclone config delete "$REMOTE" 2>/dev/null || true
rclone config create "$REMOTE" drive scope drive config_is_local false

rclone mkdir "${REMOTE}:production" 2>/dev/null || true
rclone mkdir "${REMOTE}:staging" 2>/dev/null || true
echo "Drive folders:"
rclone lsd "${REMOTE}:"

CONF="${HOME}/.config/rclone/rclone.conf"
if [ ! -f "$CONF" ]; then
  echo "ERROR: ${CONF} was not created"
  exit 1
fi

if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  gh secret set RCLONE_CONFIG --repo "$REPO" < "$CONF"
  echo "Stored RCLONE_CONFIG on GitHub (${REPO})."
else
  python3 - "$REPO" "$CONF" <<'PY'
import json, pathlib, subprocess, sys, urllib.request
repo, conf_path = sys.argv[1], pathlib.Path(sys.argv[2])
fill = subprocess.check_output(
    ["git", "credential", "fill"],
    input=b"protocol=https\nhost=github.com\n\n",
    timeout=10,
)
creds = {}
for line in fill.decode().splitlines():
    if "=" in line:
        k, v = line.split("=", 1)
        creds[k] = v
token = creds.get("password")
if not token:
    sys.exit("Could not find a GitHub credential to store RCLONE_CONFIG. Run: gh auth login")
# Need public key + nacl to encrypt. Fall back to printing next steps.
print("gh is not logged in. Add repo secret RCLONE_CONFIG manually:")
print(f"  https://github.com/{repo}/settings/secrets/actions")
print(f"  paste contents of {conf_path} (never commit this file)")
PY
fi

echo
echo "Also set GitHub Actions secrets (same page):"
echo "  SUPABASE_ACCESS_TOKEN"
echo "  SUPABASE_DB_PASSWORD"
echo "  SUPABASE_STAGING_DB_PASSWORD"
echo
echo "Then: Actions → Nightly database backup to Google Drive → Run workflow"
