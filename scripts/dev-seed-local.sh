#!/usr/bin/env bash
# ============================================================
# Eravat 2.0 — Seed a LOCAL Supabase stack for development.
#
# Loads Madhya Pradesh geography and creates one local admin
# user you can log in with (phone OTP), WITHOUT needing a
# production data dump or a `supabase login` token.
#
# Prerequisites: local Supabase must already be running
#   (dockerd up + `supabase start`).
#
# Idempotent-ish: safe to re-run after `supabase db reset`.
# Re-running on an already-seeded DB will report that the
# admin phone already exists (harmless).
# ============================================================
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB_CONTAINER="${SUPABASE_DB_CONTAINER:-supabase_db_Eravat_2.0}"
ADMIN_PHONE_10="9988775566"   # maps to test OTP 123456 in supabase/config.toml

if ! docker inspect "$DB_CONTAINER" >/dev/null 2>&1; then
  echo "ERROR: DB container '$DB_CONTAINER' not found. Run 'supabase start' first." >&2
  exit 1
fi

psql() { docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres "$@"; }

echo "==> Loading MP geography seed (duplicate-code rows are skipped by design)..."
# NOTE: this seed intentionally runs WITHOUT ON_ERROR_STOP. The committed seed
# contains a few divisions whose 'code' collides with the UNIQUE(code)
# constraint, plus dependent ranges/beats; those rows are skipped. A partial
# load (~8 divisions / ~59 ranges / ~870 beats) is expected and sufficient.
psql < "$ROOT/supabase/seeds/01_mp_geography.sql" >/dev/null 2>&1 || true

psql -c "SELECT
  (SELECT count(*) FROM geo_divisions) AS divisions,
  (SELECT count(*) FROM geo_ranges)    AS ranges,
  (SELECT count(*) FROM geo_beats)     AS beats;"

echo "==> Creating local admin user (phone +91${ADMIN_PHONE_10})..."
# The committed scripts/create_admin_user.sql omits the NOT NULL
# profiles.latitude / profiles.longitude columns, so we seed inline here and
# also attach a territory assignment so reporting flows have a beat.
psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
DECLARE
  v_phone TEXT := '91${ADMIN_PHONE_10}';       -- GoTrue-normalized (country code + 10 digits)
  v_e164  TEXT := '+91${ADMIN_PHONE_10}';       -- E.164 form stored on profiles
  v_user_id UUID := gen_random_uuid();
  v_now TIMESTAMPTZ := now();
  v_div UUID; v_range UUID; v_beat UUID;
  v_lat DOUBLE PRECISION; v_lon DOUBLE PRECISION;
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE phone = v_phone)
     OR EXISTS (
       SELECT 1 FROM public.profiles
       WHERE right(regexp_replace(COALESCE(phone,''), '\D', '', 'g'), 10) = '${ADMIN_PHONE_10}'
     ) THEN
    RAISE NOTICE 'Admin phone % already exists — skipping.', v_phone;
    RETURN;
  END IF;

  SELECT b.id, r.id, d.id INTO v_beat, v_range, v_div
  FROM geo_beats b
  JOIN geo_ranges r ON r.id = b.range_id
  JOIN geo_divisions d ON d.id = r.division_id
  LIMIT 1;

  SELECT ST_Y(ST_Centroid(b.boundary::geometry)), ST_X(ST_Centroid(b.boundary::geometry))
    INTO v_lat, v_lon
  FROM geo_beats b WHERE b.id = v_beat;

  INSERT INTO auth.users (id, instance_id, aud, role, phone, phone_confirmed_at,
    raw_user_meta_data, raw_app_meta_data, is_super_admin, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
  VALUES (v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    v_phone, v_now,
    jsonb_build_object('first_name','E2E','last_name','Admin','role','admin'),
    '{"provider":"phone","providers":["phone"]}'::jsonb, false, v_now, v_now, '', '', '', '');

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'phone', v_phone),
    'phone', v_phone, v_now, v_now, v_now);

  INSERT INTO public.profiles (id, role, first_name, last_name, phone, is_active,
    notification_radius_km, latitude, longitude, created_at, updated_at)
  VALUES (v_user_id, 'admin', 'E2E', 'Admin', v_e164, true, 10,
    COALESCE(v_lat, 23.2), COALESCE(v_lon, 80.8), v_now, v_now);

  IF v_beat IS NOT NULL THEN
    INSERT INTO public.user_region_assignments (id, user_id, division_id, range_id, beat_id, is_primary_contact, assigned_at)
    VALUES (gen_random_uuid(), v_user_id, v_div, v_range, v_beat, true, v_now);
  END IF;

  RAISE NOTICE 'Admin created: % (login: phone %, OTP 123456)', v_user_id, v_phone;
END \$\$;
SQL

echo ""
echo "Local seed complete."
echo "  Log in at the dev server with phone: ${ADMIN_PHONE_10}, OTP: 123456, then set any 4-digit PIN."
