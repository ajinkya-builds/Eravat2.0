#!/usr/bin/env bash
# Install (or refresh) the daily Google Drive DB backup LaunchAgent.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${ROOT}/scripts/macos/com.eravat.db-backup-gdrive.plist"
DEST="${HOME}/Library/LaunchAgents/com.eravat.db-backup-gdrive.plist"
LABEL="com.eravat.db-backup-gdrive"

mkdir -p "${HOME}/Library/LaunchAgents"
cp "$SRC" "$DEST"
chmod +x "${ROOT}/scripts/backup-db-to-gdrive.sh"

launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$DEST"
launchctl enable "gui/$(id -u)/${LABEL}"

echo "Installed ${LABEL}"
echo "Schedule: 00:05 IST daily (Mac must be awake, Drive + Docker available)."
echo "Log: ${HOME}/Library/Logs/eravat-db-backup.log"
echo "Run once now: ${ROOT}/scripts/backup-db-to-gdrive.sh"
echo "Unload: launchctl bootout gui/$(id -u)/${LABEL}"
