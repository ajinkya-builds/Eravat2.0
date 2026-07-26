#!/usr/bin/env bash
# Bootstrap local Supabase for Eravat (Option A: schema + users + reports + geography).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="/Applications/Docker.app/Contents/Resources/bin:${PATH:-}"

cd "$ROOT"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not available. Open Docker Desktop, then rerun this script."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is not running. Open Docker Desktop, wait until it is ready, then rerun."
  exit 1
fi

SEED_FILE="$ROOT/supabase/seeds/02_remote_app_data.sql"
if [[ ! -s "$SEED_FILE" ]]; then
  echo "==> Seed file missing. Dumping production data (auth + public)..."
  supabase db dump --linked --data-only -f "$SEED_FILE" -s public,auth
fi

echo "==> Starting local Supabase and applying baseline schema..."
supabase start --ignore-health-check

echo "==> Resetting database and loading production snapshot..."
supabase db reset --yes
docker exec -i supabase_db_Eravat_2.0 psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$SEED_FILE"

echo "==> Verifying row counts..."
docker exec supabase_db_Eravat_2.0 psql -U postgres -d postgres -c \
  "SELECT 'profiles' AS table_name, count(*)::int AS rows FROM public.profiles
   UNION ALL SELECT 'auth.users', count(*)::int FROM auth.users
   UNION ALL SELECT 'geo_beats', count(*)::int FROM public.geo_beats
   UNION ALL SELECT 'reports', count(*)::int FROM public.reports;"

echo ""
echo "Local Supabase is ready."
echo "  Studio:  http://127.0.0.1:54323"
echo "  API:     http://127.0.0.1:54321"
echo "  App env: eravat-app/.env.local (already points at local)"
echo ""
echo "Start the app: cd eravat-app && npm run dev"
