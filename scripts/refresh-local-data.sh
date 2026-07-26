#!/usr/bin/env bash
# Re-dump production data and reload the local database (keeps schema).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="/Applications/Docker.app/Contents/Resources/bin:${PATH:-}"

cd "$ROOT"

SEED_FILE="$ROOT/supabase/seeds/02_remote_app_data.sql"

echo "==> Dumping latest production data..."
supabase db dump --linked --data-only -f "$SEED_FILE" -s public,auth

echo "==> Resetting local database (schema + reload)..."
supabase db reset --yes

echo "==> Loading fresh snapshot..."
docker exec -i supabase_db_Eravat_2.0 psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$SEED_FILE"

echo "Done. Local DB now matches latest production data snapshot."
