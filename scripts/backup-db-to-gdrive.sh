#!/usr/bin/env bash
# Dump production + staging Postgres and upload gzipped SQL to the dedicated
# Eravat Google Drive via rclone. Nothing is committed or stored as a GitHub
# Actions artifact.
#
# Required env (CI secrets or local rclone remote):
#   SUPABASE_ACCESS_TOKEN
#   SUPABASE_DB_PASSWORD              # production
#   SUPABASE_STAGING_DB_PASSWORD      # staging
#   RCLONE_CONFIG                     # full rclone.conf (Drive OAuth for Eravat account)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
KEEP_DAYS="${ERAVAT_BACKUP_KEEP_DAYS:-30}"
REMOTE="${ERAVAT_GDRIVE_REMOTE:-eravat-gdrive}"
PROD_PATH="${ERAVAT_GDRIVE_PROD_PATH:-production}"
STAGING_PATH="${ERAVAT_GDRIVE_STAGING_PATH:-staging}"

PROD_REF="${ERAVAT_PROD_PROJECT_REF:-mnytrlcmdpkfhrzrtesf}"
STAGING_REF="${ERAVAT_STAGING_PROJECT_REF:-ttjtyvxfiqhjdngkgdkf}"

export PATH="/opt/homebrew/bin:/usr/local/bin:${HOME}/.nvm/versions/node/v22.16.0/bin:${PATH}"

log() { printf '%s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }

need() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    log "ERROR: missing ${name}"
    exit 1
  fi
}

write_rclone_config() {
  if [ -n "${RCLONE_CONFIG:-}" ]; then
    mkdir -p "${HOME}/.config/rclone"
    # secret is the rclone.conf body; never echo it
    printf '%s\n' "$RCLONE_CONFIG" > "${HOME}/.config/rclone/rclone.conf"
    chmod 600 "${HOME}/.config/rclone/rclone.conf"
  fi
}

dump_project() {
  local ref="$1" prefix="$2" password="$3" tmp="$4"
  log "Linking ${prefix} (${ref})..."
  supabase link --yes --workdir "$ROOT" --project-ref "$ref" --password "$password"

  log "Dumping ${prefix} schema/data/auth..."
  supabase db dump --workdir "$ROOT" --linked -f "${tmp}/${prefix}-${STAMP}-schema.sql"
  supabase db dump --workdir "$ROOT" --linked --data-only --use-copy -f "${tmp}/${prefix}-${STAMP}-data.sql"
  supabase db dump --workdir "$ROOT" --linked --data-only --use-copy --schema auth -f "${tmp}/${prefix}-${STAMP}-auth.sql"
  gzip -f "${tmp}/${prefix}-${STAMP}-"*.sql
}

upload_dir() {
  local prefix="$1" dest="$2" tmp="$3"
  log "Uploading ${prefix} to ${REMOTE}:${dest}/"
  rclone copy "${tmp}" "${REMOTE}:${dest}" \
    --include "${prefix}-${STAMP}-*.sql.gz" \
    --drive-chunk-size 64M \
    --retries 5
  rclone delete "${REMOTE}:${dest}" --min-age "${KEEP_DAYS}d" --include "*.sql.gz" || true
}

need SUPABASE_ACCESS_TOKEN
need SUPABASE_DB_PASSWORD
need SUPABASE_STAGING_DB_PASSWORD

if ! command -v supabase >/dev/null 2>&1; then
  log "ERROR: supabase CLI not on PATH"
  exit 1
fi

write_rclone_config

if ! command -v rclone >/dev/null 2>&1; then
  log "ERROR: rclone not on PATH"
  exit 1
fi

if ! rclone listremotes | grep -qx "${REMOTE}:"; then
  log "ERROR: rclone remote '${REMOTE}' not configured"
  log "Run scripts/setup-gdrive-backup-auth.sh while signed into the Eravat Google account."
  exit 1
fi

TMP="$(mktemp -d "${TMPDIR:-/tmp}/eravat-db-backup.XXXXXX")"
cleanup() {
  rm -rf "$TMP"
  rm -f "${HOME}/.config/rclone/rclone.conf.bak"
}
trap cleanup EXIT

dump_project "$PROD_REF" "prod" "$SUPABASE_DB_PASSWORD" "$TMP"
upload_dir "prod" "$PROD_PATH" "$TMP"

dump_project "$STAGING_REF" "staging" "$SUPABASE_STAGING_DB_PASSWORD" "$TMP"
upload_dir "staging" "$STAGING_PATH" "$TMP"

log "Uploaded ${STAMP} to Drive folders ${PROD_PATH}/ and ${STAGING_PATH}/ (kept ${KEEP_DAYS} days)."
