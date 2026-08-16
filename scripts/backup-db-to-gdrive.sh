#!/usr/bin/env bash
# Dump production + staging Postgres and copy gzipped SQL onto this Mac's
# Google Drive folder (not GitHub). Requires Docker Desktop (supabase db dump)
# and Google Drive for Desktop signed in.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

GDRIVE_ACCOUNT="${ERAVAT_GDRIVE_ACCOUNT:-connectwithajinkya@gmail.com}"
GDRIVE_ROOT="${ERAVAT_GDRIVE_ROOT:-$HOME/Library/CloudStorage/GoogleDrive-${GDRIVE_ACCOUNT}/My Drive/Eravat DB Backups}"
PROD_DIR="${GDRIVE_ROOT}/production"
STAGING_DIR="${GDRIVE_ROOT}/staging"
KEEP_DAYS="${ERAVAT_BACKUP_KEEP_DAYS:-30}"

PROD_REF="${ERAVAT_PROD_PROJECT_REF:-mnytrlcmdpkfhrzrtesf}"
STAGING_REF="${ERAVAT_STAGING_PROJECT_REF:-ttjtyvxfiqhjdngkgdkf}"

export PATH="/opt/homebrew/bin:/usr/local/bin:${HOME}/.nvm/versions/node/v22.16.0/bin:${PATH}"

log() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" "$*"; }

ensure_docker() {
  if ! docker info >/dev/null 2>&1; then
    log "Starting Docker Desktop..."
    open -a Docker
    for _ in $(seq 1 90); do
      if docker info >/dev/null 2>&1; then
        break
      fi
      sleep 2
    done
  fi
  if ! docker info >/dev/null 2>&1; then
    log "ERROR: Docker is not running (needed for supabase db dump)."
    exit 1
  fi
}

dump_project() {
  local ref="$1" prefix="$2" dest="$3"
  local tmp="$4"
  mkdir -p "$dest" "$tmp"

  log "Linking ${prefix} (${ref})..."
  supabase link --yes --workdir "$ROOT" --project-ref "$ref"

  log "Dumping ${prefix} schema/data/auth..."
  supabase db dump --workdir "$ROOT" --linked -f "${tmp}/${prefix}-${STAMP}-schema.sql"
  supabase db dump --workdir "$ROOT" --linked --data-only --use-copy -f "${tmp}/${prefix}-${STAMP}-data.sql"
  supabase db dump --workdir "$ROOT" --linked --data-only --use-copy --schema auth -f "${tmp}/${prefix}-${STAMP}-auth.sql"
  gzip -f "${tmp}/${prefix}-${STAMP}-"*.sql

  log "Copying ${prefix} dumps to Google Drive..."
  cp -f "${tmp}/${prefix}-${STAMP}-"*.sql.gz "$dest/"
}

prune_old() {
  local dir="$1"
  find "$dir" -maxdepth 1 -type f -name '*.sql.gz' -mtime "+${KEEP_DAYS}" -delete 2>/dev/null || true
}

if [[ ! -d "$(dirname "$GDRIVE_ROOT")" && ! -d "$HOME/Library/CloudStorage/GoogleDrive-${GDRIVE_ACCOUNT}" ]]; then
  log "ERROR: Google Drive folder not found for ${GDRIVE_ACCOUNT}."
  log "Sign in with Google Drive for Desktop, or set ERAVAT_GDRIVE_ROOT."
  exit 1
fi

mkdir -p "$PROD_DIR" "$STAGING_DIR"
ensure_docker

if ! command -v supabase >/dev/null 2>&1; then
  log "ERROR: supabase CLI not on PATH."
  exit 1
fi

TMP="$(mktemp -d "${TMPDIR:-/tmp}/eravat-db-backup.XXXXXX")"
cleanup() {
  rm -rf "$TMP"
}
trap cleanup EXIT

log "Google Drive root: ${GDRIVE_ROOT}"
dump_project "$PROD_REF" "prod" "$PROD_DIR" "$TMP"
dump_project "$STAGING_REF" "staging" "$STAGING_DIR" "$TMP"
prune_old "$PROD_DIR"
prune_old "$STAGING_DIR"

log "Done. Latest files:"
ls -lh "$PROD_DIR"/prod-"${STAMP}"-*.sql.gz "$STAGING_DIR"/staging-"${STAMP}"-*.sql.gz
