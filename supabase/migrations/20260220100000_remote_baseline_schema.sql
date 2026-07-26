-- Remote baseline schema dump (refreshed 2026-07-26T12:04Z from mnytrlcmdpkfhrzrtesf)
-- For local bootstrap only. Historical incrementals live in migrations_applied_on_remote/




SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "postgis" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."loss_category" AS ENUM (
    'crop',
    'property',
    'livestock',
    'human_injury',
    'human_death'
);


ALTER TYPE "public"."loss_category" OWNER TO "postgres";


CREATE TYPE "public"."obs_type" AS ENUM (
    'direct_sighting',
    'indirect_sign',
    'conflict_loss'
);


ALTER TYPE "public"."obs_type" OWNER TO "postgres";


CREATE TYPE "public"."sync_status" AS ENUM (
    'pending',
    'synced',
    'flagged'
);


ALTER TYPE "public"."sync_status" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'admin',
    'manager',
    'data_collector',
    'viewer',
    'ccf',
    'dfo',
    'range_officer',
    'beat_guard',
    'rrt',
    'biologist',
    'veterinarian',
    'volunteer'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_report_geography"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE
  matched_beat_id uuid;
  reporter_division_id uuid;
BEGIN
  IF NEW.location IS NOT NULL AND NEW.beat_id IS NULL THEN
    SELECT id INTO matched_beat_id
    FROM public.geo_beats
    WHERE ST_Intersects(boundary, NEW.location)
    LIMIT 1;

    IF matched_beat_id IS NULL THEN
      SELECT ura.division_id
      INTO reporter_division_id
      FROM public.user_region_assignments ura
      WHERE ura.user_id = NEW.user_id
      LIMIT 1;

      SELECT gb.id INTO matched_beat_id
      FROM public.geo_beats gb
      JOIN public.geo_ranges gr ON gr.id = gb.range_id
      WHERE reporter_division_id IS NULL OR gr.division_id = reporter_division_id
      ORDER BY ST_Distance(gb.boundary::geometry, NEW.location::geometry) ASC
      LIMIT 1;
    END IF;

    IF matched_beat_id IS NOT NULL THEN
      NEW.beat_id := matched_beat_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."assign_report_geography"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_read_report"("p_report_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.reports rep
    LEFT JOIN public.geo_beats gb ON gb.id = rep.beat_id
    LEFT JOIN public.geo_ranges gr ON gr.id = gb.range_id
    LEFT JOIN public.user_region_assignments ura ON ura.user_id = auth.uid()
    WHERE rep.id = p_report_id
      AND (
        rep.user_id = auth.uid()
        OR public.get_my_role() IN ('admin', 'ccf')
        OR (
          public.get_my_role() = 'dfo'
          AND rep.beat_id IS NOT NULL
          AND ura.division_id IS NOT NULL
          AND gr.division_id = ura.division_id
        )
        OR (
          public.get_my_role() = 'range_officer'
          AND rep.beat_id IS NOT NULL
          AND ura.range_id IS NOT NULL
          AND gb.range_id = ura.range_id
        )
        OR (
          public.get_my_role() = 'beat_guard'
          AND rep.beat_id IS NOT NULL
          AND ura.beat_id IS NOT NULL
          AND rep.beat_id = ura.beat_id
        )
        OR (
          public.get_my_role() IN ('biologist', 'veterinarian', 'rrt')
          AND rep.beat_id IS NOT NULL
          AND ura.division_id IS NOT NULL
          AND gr.division_id = ura.division_id
        )
      )
  );
$$;


ALTER FUNCTION "public"."can_read_report"("p_report_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_phone_registered"("p_phone" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_exists boolean;
  v_clean_p_phone text;
BEGIN
  -- Strip all non-digit characters from input
  v_clean_p_phone := regexp_replace(p_phone, '\D', '', 'g');

  -- Normalize to last 10 digits
  IF length(v_clean_p_phone) > 10 THEN
    v_clean_p_phone := right(v_clean_p_phone, 10);
  END IF;

  -- Match by last 10 digits of stored phone in active profiles
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE right(regexp_replace(COALESCE(p.phone, ''), '\D', '', 'g'), 10) = v_clean_p_phone
      AND p.is_active = true
  ) INTO v_exists;

  RETURN v_exists;
END;
$$;


ALTER FUNCTION "public"."check_phone_registered"("p_phone" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."check_phone_registered"("p_phone" "text") IS 'Checks if a user with the specified phone number exists and is active, returning a boolean. Does not leak email or other profile data.';



CREATE OR REPLACE FUNCTION "public"."ensure_phone_identity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    IF NEW.phone IS NOT NULL THEN
        -- Insert into identities if it doesn't already exist for this exact phone
        -- Supabase requires this row for verifyOtp/signInWithOtp to work for existing users
        INSERT INTO auth.identities (
            id,
            user_id,
            identity_data,
            provider,
            last_sign_in_at,
            created_at,
            updated_at,
            provider_id
        )
        SELECT 
            gen_random_uuid(),
            NEW.id,
            jsonb_build_object(
                'phone', NEW.phone,
                'phone_verified', true,
                'sub', NEW.id::text,
                'email_verified', false
            ),
            'phone',
            now(),
            now(),
            now(),
            NEW.phone
        WHERE NOT EXISTS (
            SELECT 1 FROM auth.identities 
            WHERE user_id = NEW.id AND provider = 'phone'
        );
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."ensure_phone_identity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_geo_centroid_lat_lng"("p_beat_id" "uuid" DEFAULT NULL::"uuid", "p_range_id" "uuid" DEFAULT NULL::"uuid", "p_division_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("latitude" double precision, "longitude" double precision)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
  SELECT ST_Y(c.centroid::geometry)::double precision, ST_X(c.centroid::geometry)::double precision
  FROM (
    SELECT gb.centroid FROM public.geo_beats gb WHERE p_beat_id IS NOT NULL AND gb.id = p_beat_id AND gb.centroid IS NOT NULL
    UNION ALL
    SELECT gr.centroid FROM public.geo_ranges gr WHERE p_beat_id IS NULL AND p_range_id IS NOT NULL AND gr.id = p_range_id AND gr.centroid IS NOT NULL
    UNION ALL
    SELECT gd.centroid FROM public.geo_divisions gd WHERE p_beat_id IS NULL AND p_range_id IS NULL AND p_division_id IS NOT NULL AND gd.id = p_division_id AND gd.centroid IS NOT NULL
  ) c LIMIT 1;
$$;


ALTER FUNCTION "public"."get_geo_centroid_lat_lng"("p_beat_id" "uuid", "p_range_id" "uuid", "p_division_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_division_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT division_id FROM user_region_assignments WHERE user_id = auth.uid() LIMIT 1;
$$;


ALTER FUNCTION "public"."get_my_division_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_primary_division_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT ura.division_id
  FROM public.user_region_assignments ura
  WHERE ura.user_id = auth.uid() AND ura.division_id IS NOT NULL
  ORDER BY ura.is_primary_contact DESC
  LIMIT 1;
$$;


ALTER FUNCTION "public"."get_my_primary_division_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_primary_range_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT ura.range_id
  FROM public.user_region_assignments ura
  WHERE ura.user_id = auth.uid() AND ura.range_id IS NOT NULL
  ORDER BY ura.is_primary_contact DESC
  LIMIT 1;
$$;


ALTER FUNCTION "public"."get_my_primary_range_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_range_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT range_id FROM user_region_assignments WHERE user_id = auth.uid() LIMIT 1;
$$;


ALTER FUNCTION "public"."get_my_range_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ SELECT role::text FROM public.profiles WHERE id = auth.uid(); $$;


ALTER FUNCTION "public"."get_my_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_push_dispatch_auth_token"() RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'vault', 'extensions'
    AS $$
DECLARE
  token text;
BEGIN
  BEGIN
    SELECT decrypted_secret
    INTO token
    FROM vault.decrypted_secrets
    WHERE name = 'push_dispatch_service_role_key'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    token := NULL;
  END;

  RETURN COALESCE(
    token,
    NULLIF(current_setting('app.settings.service_role_key', true), '')
  );
END;
$$;


ALTER FUNCTION "public"."get_push_dispatch_auth_token"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_auth_user_profile"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE
  v_clean_phone text;
  v_lat double precision := 22.9734;
  v_lng double precision := 78.6568;
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;

  IF NEW.phone IS NOT NULL THEN
    v_clean_phone := right(regexp_replace(NEW.phone, '\D', '', 'g'), 10);
    IF EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id <> NEW.id
        AND right(regexp_replace(COALESCE(p.phone, ''), '\D', '', 'g'), 10) = v_clean_phone
    ) THEN
      RAISE EXCEPTION 'Phone number already registered' USING ERRCODE = '23505';
    END IF;
  END IF;

  IF NEW.raw_user_meta_data ? 'latitude' AND NEW.raw_user_meta_data ? 'longitude' THEN
    v_lat := (NEW.raw_user_meta_data->>'latitude')::double precision;
    v_lng := (NEW.raw_user_meta_data->>'longitude')::double precision;
  END IF;

  INSERT INTO public.profiles (id, first_name, last_name, role, is_active, latitude, longitude, location_updated_at)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(trim(both from NEW.raw_user_meta_data->>'first_name'), ''),
      'User'
    ),
    COALESCE(NULLIF(trim(both from NEW.raw_user_meta_data->>'last_name'), ''), ''),
    COALESCE(NULLIF(trim(both from NEW.raw_user_meta_data->>'role'), ''), 'volunteer')::public.user_role,
    true,
    v_lat,
    v_lng,
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_auth_user_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user_phone"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    normalized_phone text;
BEGIN
    -- Only process if phone is provided
    IF NEW.phone IS NOT NULL THEN
        -- Strip all non-numeric characters to get just the digits
        normalized_phone := regexp_replace(NEW.phone, '\D', '', 'g');
        
        -- If it's a 10 digit Indian number, prepend 91 (Supabase stripped format)
        IF length(normalized_phone) = 10 THEN
            normalized_phone := '91' || normalized_phone;
        -- If it's already 12 digits starting with 91, keep it
        ELSIF length(normalized_phone) = 12 AND normalized_phone LIKE '91%' THEN
            -- already in correct format
        -- If it's 11 digits starting with 0, drop the 0 and add 91
        ELSIF length(normalized_phone) = 11 AND normalized_phone LIKE '0%' THEN
            normalized_phone := '91' || substring(normalized_phone from 2);
        END IF;

        -- OVERRIDE the phone number on the actual auth.users record 
        -- so it perfectly matches the `91XXXXXXXXXX` expected by GoTrue.
        NEW.phone := normalized_phone;

        -- AUTO-CONFIRM the phone number
        NEW.phone_confirmed_at := COALESCE(NEW.phone_confirmed_at, now());
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user_phone"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_all_notifications_read"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    updated_count integer;
BEGIN
    UPDATE public.notifications
    SET    is_read = true
    WHERE  user_id = auth.uid()
      AND  is_read = false;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$;


ALTER FUNCTION "public"."mark_all_notifications_read"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_phone_e164"("p_phone" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_digits text;
BEGIN
  -- Strip all non-digit characters
  v_digits := regexp_replace(p_phone, '\D', '', 'g');

  -- Handle different input formats:
  -- 10 digits: 9385379265 -> +919385379265
  -- 11 digits starting with 0: 09385379265 -> +919385379265
  -- 12 digits starting with 91: 919385379265 -> +919385379265
  -- Already formatted: return as-is

  IF length(v_digits) = 10 THEN
    -- Standard 10-digit Indian number
    RETURN '+91' || v_digits;
  ELSIF length(v_digits) = 11 AND left(v_digits, 1) = '0' THEN
    -- Leading 0, strip it and add country code
    RETURN '+91' || right(v_digits, 10);
  ELSIF length(v_digits) = 12 AND left(v_digits, 2) = '91' THEN
    -- Already has 91 country code, just add +
    RETURN '+' || v_digits;
  ELSIF length(v_digits) >= 11 THEN
    -- Assume it's already in E.164 format, just add + if missing
    IF left(p_phone, 1) = '+' THEN
      RETURN p_phone;
    ELSE
      RETURN '+' || v_digits;
    END IF;
  ELSE
    -- Invalid length
    RAISE EXCEPTION 'Invalid phone number format. Expected 10 digits, got %', length(v_digits);
  END IF;
END;
$$;


ALTER FUNCTION "public"."normalize_phone_e164"("p_phone" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."normalize_phone_e164"("p_phone" "text") IS 'Converts Indian phone numbers to E.164 format (+919XXXXXXXXX) for Supabase OTP authentication';



CREATE OR REPLACE FUNCTION "public"."notify_chain_of_command_on_report"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    r_id uuid; -- range ID
    d_id uuid; -- division ID
    officer_id uuid;
BEGIN
    -- Only generate notifications if the report has an assigned beat
    IF NEW.beat_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Lookup the exact range and division this beat belongs to
    SELECT r.id, r.division_id INTO r_id, d_id
    FROM public.geo_beats b
    JOIN public.geo_ranges r ON b.range_id = r.id
    WHERE b.id = NEW.beat_id;

    -- Look up the Range Officer for this Range AND the DFO for this Division
    FOR officer_id IN (
        SELECT u.user_id 
        FROM public.user_region_assignments u
        JOIN public.profiles p ON u.user_id = p.id
        WHERE 
            (u.range_id = r_id AND p.role = 'range_officer')
            OR 
            (u.division_id = d_id AND p.role = 'dfo')
    ) LOOP
        -- Insert a notification for each found officer
        INSERT INTO public.notifications (user_id, report_id, title, message)
        VALUES (
            officer_id, 
            NEW.id, 
            'New Field Report', 
            'A field report was synced in your territory.'
        );
    END LOOP;

    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_chain_of_command_on_report"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_conflict_chain"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  r_id uuid;
  d_id uuid;
  b_name text;
  r_name text;
  officer_id uuid;
  msg_title text;
  msg_body text;
  rep_beat_id uuid;
BEGIN
  SELECT beat_id INTO rep_beat_id FROM public.reports WHERE id = NEW.report_id;
  IF rep_beat_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT b.name, r.name, r.id, r.division_id
  INTO b_name, r_name, r_id, d_id
  FROM public.geo_beats b
  JOIN public.geo_ranges r ON b.range_id = r.id
  WHERE b.id = rep_beat_id;

  msg_title := 'Conflict Damage Alert';
  msg_body := 'Damage reported: ' || COALESCE(NEW.description, 'unspecified')
    || ' in ' || b_name || ' Beat (' || r_name || ' Range).';

  FOR officer_id IN (
    SELECT u.user_id
    FROM public.user_region_assignments u
    JOIN public.profiles p ON u.user_id = p.id
    WHERE p.is_active = true
      AND (
        (u.range_id = r_id AND p.role = 'range_officer')
        OR (u.division_id = d_id AND p.role = 'dfo')
      )
  ) LOOP
    INSERT INTO public.notifications (user_id, report_id, title, message, notification_type)
    VALUES (officer_id, NEW.report_id, msg_title, msg_body, 'chain_of_command')
    ON CONFLICT (user_id, report_id, notification_type) WHERE report_id IS NOT NULL
    DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_conflict_chain"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_observation_chain"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  r_id uuid;
  d_id uuid;
  b_name text;
  r_name text;
  officer_id uuid;
  total_count int;
  msg_title text;
  msg_body text;
  rep_beat_id uuid;
  signs_list text;
BEGIN
  IF NEW.type::text IN ('conflict_loss', 'loss') THEN
    RETURN NEW;
  END IF;

  SELECT beat_id INTO rep_beat_id FROM public.reports WHERE id = NEW.report_id;
  IF rep_beat_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT b.name, r.name, r.id, r.division_id
  INTO b_name, r_name, r_id, d_id
  FROM public.geo_beats b
  JOIN public.geo_ranges r ON b.range_id = r.id
  WHERE b.id = rep_beat_id;

  IF NEW.type::text = 'direct_sighting' THEN
    total_count := COALESCE(NEW.male_count, 0) + COALESCE(NEW.female_count, 0)
      + COALESCE(NEW.calf_count, 0) + COALESCE(NEW.unknown_count, 0);
    msg_title := 'Direct Sighting Alert';
    msg_body := total_count || ' elephant(s) recorded in ' || b_name || ' Beat (' || r_name || ' Range).';
  ELSIF NEW.type::text = 'indirect_sign' THEN
    signs_list := array_to_string(NEW.indirect_sign_details, ', ');
    msg_title := 'Indirect Sign Logged';
    msg_body := 'Signs (' || COALESCE(signs_list, 'unspecified type') || ') found in ' || b_name || ' Beat.';
  ELSE
    msg_title := 'Activity Alert';
    msg_body := 'New activity reported in ' || b_name || ' Beat.';
  END IF;

  FOR officer_id IN (
    SELECT u.user_id
    FROM public.user_region_assignments u
    JOIN public.profiles p ON u.user_id = p.id
    WHERE p.is_active = true
      AND (
        (u.range_id = r_id AND p.role = 'range_officer')
        OR (u.division_id = d_id AND p.role = 'dfo')
      )
  ) LOOP
    INSERT INTO public.notifications (user_id, report_id, title, message, notification_type)
    VALUES (officer_id, NEW.report_id, msg_title, msg_body, 'chain_of_command')
    ON CONFLICT (user_id, report_id, notification_type) WHERE report_id IS NOT NULL
    DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_observation_chain"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_proximity_on_report"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE
  rec RECORD;
  radius_m DOUBLE PRECISION;
  beat_name   text;
  range_name  text;
  div_name    text;
  report_division_id uuid;
  msg_title   text;
  msg_body    text;
BEGIN
  IF NEW.location IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.beat_id IS NOT NULL THEN
    SELECT r.division_id
    INTO report_division_id
    FROM public.geo_beats b
    JOIN public.geo_ranges r ON r.id = b.range_id
    WHERE b.id = NEW.beat_id;
  END IF;

  SELECT
    b.name AS beat_n,
    r.name AS range_n,
    d.name AS div_n
  INTO beat_name, range_name, div_name
  FROM public.reports rp
  LEFT JOIN public.geo_beats b ON b.id = rp.beat_id
  LEFT JOIN public.geo_ranges r ON r.id = b.range_id
  LEFT JOIN public.geo_divisions d ON d.id = r.division_id
  WHERE rp.id = NEW.id;

  msg_title := 'New Activity within your alert radius!';
  msg_body  := CASE
    WHEN beat_name IS NOT NULL
      THEN 'A report was filed near ' || beat_name || ' Beat (' || COALESCE(range_name, '?') || ' Range).'
    WHEN range_name IS NOT NULL
      THEN 'A report was filed near ' || range_name || ' Range.'
    WHEN div_name IS NOT NULL
      THEN 'A report was filed near ' || div_name || ' Division.'
    ELSE
      'A new field report was filed near your assigned area.'
  END;

  FOR rec IN
    SELECT
      ura.user_id,
      p.notification_radius_km,
      COALESCE(gb.centroid, gr.centroid, gd.centroid) AS region_centroid
    FROM public.user_region_assignments ura
    JOIN public.profiles p ON p.id = ura.user_id
    LEFT JOIN public.geo_beats gb ON gb.id = ura.beat_id
    LEFT JOIN public.geo_ranges gr ON gr.id = ura.range_id
    LEFT JOIN public.geo_divisions gd ON gd.id = ura.division_id
    WHERE
      COALESCE(gb.centroid, gr.centroid, gd.centroid) IS NOT NULL
      AND p.is_active = true
      AND ura.user_id IS DISTINCT FROM NEW.user_id
      AND (
        report_division_id IS NULL
        OR ura.division_id = report_division_id
        OR gr.division_id = report_division_id
        OR gb.id IN (
          SELECT gb2.id
          FROM public.geo_beats gb2
          JOIN public.geo_ranges gr2 ON gr2.id = gb2.range_id
          WHERE gr2.division_id = report_division_id
        )
      )
  LOOP
    radius_m := rec.notification_radius_km * 1000.0;

    IF ST_DWithin(
      NEW.location::extensions.geography,
      rec.region_centroid::extensions.geography,
      radius_m
    ) THEN
      INSERT INTO public.notifications (user_id, report_id, title, message, notification_type)
      VALUES (rec.user_id, NEW.id, msg_title, msg_body, 'proximity')
      ON CONFLICT (user_id, report_id, notification_type) WHERE report_id IS NOT NULL
      DO NOTHING;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_proximity_on_report"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."profiles_set_location_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.latitude IS DISTINCT FROM OLD.latitude OR NEW.longitude IS DISTINCT FROM OLD.longitude THEN
    NEW.location_updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."profiles_set_location_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."profiles_set_location_updated_at_on_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL AND NEW.location_updated_at IS NULL THEN NEW.location_updated_at = now(); END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."profiles_set_location_updated_at_on_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_profile_centroid_lat_lng"("p_user_id" "uuid") RETURNS TABLE("latitude" double precision, "longitude" double precision)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
  WITH me AS (SELECT p.id, p.role::text AS role FROM public.profiles p WHERE p.id = p_user_id),
  ura AS (
    SELECT ura.user_id, ura.division_id, ura.range_id, ura.beat_id FROM public.user_region_assignments ura
    WHERE ura.user_id = p_user_id ORDER BY (ura.beat_id IS NOT NULL) DESC, (ura.range_id IS NOT NULL) DESC, (ura.division_id IS NOT NULL) DESC LIMIT 1
  ),
  geo_point AS (
    SELECT CASE
      WHEN m.role IN ('beat_guard', 'volunteer') AND u.beat_id IS NOT NULL THEN gb.centroid
      WHEN m.role IN ('range_officer', 'rrt') AND u.range_id IS NOT NULL THEN gr.centroid
      WHEN m.role = 'dfo' AND u.division_id IS NOT NULL THEN gd.centroid
      WHEN u.beat_id IS NOT NULL THEN gb.centroid
      WHEN u.range_id IS NOT NULL THEN gr.centroid
      WHEN u.division_id IS NOT NULL THEN gd.centroid ELSE NULL END AS centroid
    FROM me m LEFT JOIN ura u ON u.user_id = m.id
    LEFT JOIN public.geo_beats gb ON gb.id = u.beat_id
    LEFT JOIN public.geo_ranges gr ON gr.id = u.range_id
    LEFT JOIN public.geo_divisions gd ON gd.id = u.division_id
  )
  SELECT ST_Y(gp.centroid::geometry)::double precision, ST_X(gp.centroid::geometry)::double precision
  FROM geo_point gp WHERE gp.centroid IS NOT NULL;
$$;


ALTER FUNCTION "public"."resolve_profile_centroid_lat_lng"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_push_on_notification"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE
  push_url text;
  auth_token text;
BEGIN
  SELECT value INTO push_url
  FROM public.push_dispatch_config
  WHERE key = 'send_push_url'
  LIMIT 1;

  auth_token := public.get_push_dispatch_auth_token();

  IF push_url IS NULL OR auth_token IS NULL THEN
    RAISE WARNING 'send_push_on_notification skipped: missing push URL or service role token (configure vault secret push_dispatch_service_role_key)';
    RETURN NEW;
  END IF;

  PERFORM extensions.http_post(
    url := push_url,
    body := jsonb_build_object(
      'notification_id', NEW.id,
      'user_id', NEW.user_id,
      'title', NEW.title,
      'message', NEW.message,
      'report_id', NEW.report_id,
      'notification_type', NEW.notification_type
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || auth_token
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'send_push_on_notification failed: %', SQLERRM;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."send_push_on_notification"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_auth_user_phone"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- When profile phone is updated, log notification
  -- Actual sync to auth.users requires service_role access via Edge Function
  IF NEW.phone IS NOT NULL AND (OLD.phone IS NULL OR NEW.phone != OLD.phone) THEN
    RAISE NOTICE 'Phone updated for user %. Auth sync required via manual UPDATE or Edge Function.', NEW.id;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_auth_user_phone"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."sync_auth_user_phone"() IS 'Trigger to notify when profile phone changes. Actual auth.users sync must happen via Edge Function with service_role.';



CREATE OR REPLACE FUNCTION "public"."validate_phone_for_otp"("p_phone" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_clean_phone text;
  v_user_id uuid;
  v_is_active boolean;
BEGIN
  v_clean_phone := regexp_replace(p_phone, '\D', '', 'g');
  IF length(v_clean_phone) > 10 THEN
    v_clean_phone := right(v_clean_phone, 10);
  END IF;

  SELECT p.id, p.is_active
  INTO v_user_id, v_is_active
  FROM public.profiles p
  WHERE right(regexp_replace(COALESCE(p.phone, ''), '\D', '', 'g'), 10) = v_clean_phone
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'valid', true,
      'message', 'If this phone number is registered, you will receive an OTP'
    );
  ELSIF NOT v_is_active THEN
    RETURN jsonb_build_object(
      'valid', false,
      'message', 'This account has been deactivated. Please contact your administrator.'
    );
  ELSE
    RETURN jsonb_build_object(
      'valid', true,
      'message', 'If this phone number is registered, you will receive an OTP'
    );
  END IF;
END;
$$;


ALTER FUNCTION "public"."validate_phone_for_otp"("p_phone" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."validate_phone_for_otp"("p_phone" "text") IS 'Validates phone number exists and user is active before sending OTP. Does not reveal if phone is unregistered (security).';


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "target_table" "text" NOT NULL,
    "target_id" "text",
    "old_values" "jsonb",
    "new_values" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conflict_damages" (
    "id" "uuid" NOT NULL,
    "report_id" "uuid" NOT NULL,
    "category" "public"."loss_category" NOT NULL,
    "description" "text",
    "estimated_value" numeric
);


ALTER TABLE "public"."conflict_damages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."geo_beats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "range_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "code" "text",
    "boundary" "extensions"."geography"(MultiPolygon,4326),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "centroid" "extensions"."geography"(Point,4326)
);


ALTER TABLE "public"."geo_beats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."geo_divisions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "code" "text",
    "state" "text" DEFAULT 'Madhya Pradesh'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "boundary" "extensions"."geography"(MultiPolygon,4326),
    "centroid" "extensions"."geography"(Point,4326)
);


ALTER TABLE "public"."geo_divisions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."geo_ranges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "division_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "code" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "boundary" "extensions"."geography"(MultiPolygon,4326),
    "centroid" "extensions"."geography"(Point,4326)
);


ALTER TABLE "public"."geo_ranges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "report_id" "uuid",
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "is_read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notification_type" "text" DEFAULT 'general'::"text" NOT NULL,
    CONSTRAINT "notifications_notification_type_check" CHECK (("notification_type" = ANY (ARRAY['general'::"text", 'proximity'::"text", 'chain_of_command'::"text"])))
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."observations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "report_id" "uuid" NOT NULL,
    "type" "public"."obs_type" NOT NULL,
    "male_count" integer DEFAULT 0,
    "female_count" integer DEFAULT 0,
    "calf_count" integer DEFAULT 0,
    "unknown_count" integer DEFAULT 0,
    "compass_bearing" numeric,
    "indirect_sign_details" "text"[],
    "total_elephants" integer DEFAULT 0,
    "conflict_loss_details" "text"[]
);


ALTER TABLE "public"."observations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "role" "public"."user_role" DEFAULT 'viewer'::"public"."user_role",
    "first_name" "text",
    "last_name" "text",
    "phone" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "fcm_token" "text",
    "notification_radius_km" integer DEFAULT 10 NOT NULL,
    "latitude" double precision NOT NULL,
    "longitude" double precision NOT NULL,
    "location_updated_at" timestamp with time zone,
    CONSTRAINT "chk_notification_radius_km" CHECK ((("notification_radius_km" >= 1) AND ("notification_radius_km" <= 500))),
    CONSTRAINT "chk_profiles_latitude" CHECK ((("latitude" IS NULL) OR (("latitude" >= ('-90'::integer)::double precision) AND ("latitude" <= (90)::double precision)))),
    CONSTRAINT "chk_profiles_longitude" CHECK ((("longitude" IS NULL) OR (("longitude" >= ('-180'::integer)::double precision) AND ("longitude" <= (180)::double precision))))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."latitude" IS 'User GPS latitude (WGS84). Mandatory; defaults from assigned region centroid.';



COMMENT ON COLUMN "public"."profiles"."longitude" IS 'User GPS longitude (WGS84). Mandatory; defaults from assigned region centroid.';



COMMENT ON COLUMN "public"."profiles"."location_updated_at" IS 'Last time latitude/longitude were updated.';



CREATE TABLE IF NOT EXISTS "public"."push_dispatch_config" (
    "key" "text" NOT NULL,
    "value" "text" NOT NULL
);


ALTER TABLE "public"."push_dispatch_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "device_info" "text" DEFAULT 'android'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."push_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."report_media" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "report_id" "uuid" NOT NULL,
    "storage_path" "text" NOT NULL,
    "media_type" "text" DEFAULT 'image/jpeg'::"text",
    "uploaded_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."report_media" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reports" (
    "id" "uuid" NOT NULL,
    "user_id" "uuid",
    "device_timestamp" timestamp with time zone NOT NULL,
    "location" "extensions"."geography"(Point,4326) NOT NULL,
    "beat_id" "uuid",
    "status" "public"."sync_status" DEFAULT 'synced'::"public"."sync_status",
    "notes" "text",
    "server_created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_region_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "division_id" "uuid",
    "range_id" "uuid",
    "beat_id" "uuid",
    "assigned_at" timestamp with time zone DEFAULT "now"(),
    "is_primary_contact" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."user_region_assignments" OWNER TO "postgres";


ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conflict_damages"
    ADD CONSTRAINT "conflict_damages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."geo_beats"
    ADD CONSTRAINT "geo_beats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."geo_divisions"
    ADD CONSTRAINT "geo_divisions_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."geo_divisions"
    ADD CONSTRAINT "geo_divisions_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."geo_divisions"
    ADD CONSTRAINT "geo_divisions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."geo_ranges"
    ADD CONSTRAINT "geo_ranges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."observations"
    ADD CONSTRAINT "observations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_dispatch_config"
    ADD CONSTRAINT "push_dispatch_config_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_user_token_unique" UNIQUE ("user_id", "token");



ALTER TABLE ONLY "public"."report_media"
    ADD CONSTRAINT "report_media_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_region_assignments"
    ADD CONSTRAINT "user_region_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_region_assignments"
    ADD CONSTRAINT "user_region_assignments_user_id_key" UNIQUE ("user_id");



CREATE INDEX "idx_audit_log_created_at" ON "public"."audit_log" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_audit_log_target" ON "public"."audit_log" USING "btree" ("target_table", "target_id");



CREATE INDEX "idx_audit_log_user_id" ON "public"."audit_log" USING "btree" ("user_id");



CREATE INDEX "idx_geo_beats_boundary" ON "public"."geo_beats" USING "gist" ("boundary");



CREATE INDEX "idx_geo_beats_centroid" ON "public"."geo_beats" USING "gist" ("centroid");



CREATE INDEX "idx_geo_divisions_centroid" ON "public"."geo_divisions" USING "gist" ("centroid");



CREATE INDEX "idx_geo_ranges_centroid" ON "public"."geo_ranges" USING "gist" ("centroid");



CREATE INDEX "idx_notifications_report_id" ON "public"."notifications" USING "btree" ("report_id") WHERE ("report_id" IS NOT NULL);



CREATE INDEX "idx_notifications_user_created_at" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC);



CREATE UNIQUE INDEX "idx_notifications_user_report_type" ON "public"."notifications" USING "btree" ("user_id", "report_id", "notification_type") WHERE ("report_id" IS NOT NULL);



CREATE UNIQUE INDEX "idx_profiles_phone_unique" ON "public"."profiles" USING "btree" ("regexp_replace"("phone", '\D'::"text", ''::"text", 'g'::"text")) WHERE (("phone" IS NOT NULL) AND ("phone" <> ''::"text"));



CREATE INDEX "idx_push_tokens_user_id" ON "public"."push_tokens" USING "btree" ("user_id");



CREATE INDEX "idx_reports_location" ON "public"."reports" USING "gist" ("location");



CREATE INDEX "idx_user_region_assignments_division" ON "public"."user_region_assignments" USING "btree" ("division_id");



CREATE INDEX "idx_user_region_assignments_primary_contact" ON "public"."user_region_assignments" USING "btree" ("division_id", "range_id", "beat_id", "is_primary_contact") WHERE ("is_primary_contact" = true);



CREATE INDEX "idx_user_region_assignments_range" ON "public"."user_region_assignments" USING "btree" ("range_id");



CREATE OR REPLACE TRIGGER "push_report_on_new_report" AFTER INSERT ON "public"."reports" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://mnytrlcmdpkfhrzrtesf.supabase.co/functions/v1/push-report', 'POST', '{"Content-type":"application/json"}', '{}', '5000');



CREATE OR REPLACE TRIGGER "push_report_webhook" AFTER INSERT ON "public"."reports" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://mnytrlcmdpkfhrzrtesf.supabase.co/functions/v1/push-report', 'POST', '{"Content-type":"application/json"}', '{}', '5000');



CREATE OR REPLACE TRIGGER "trg_profiles_location_insert" BEFORE INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."profiles_set_location_updated_at_on_insert"();



CREATE OR REPLACE TRIGGER "trg_profiles_location_updated_at" BEFORE UPDATE OF "latitude", "longitude" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."profiles_set_location_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_assign_report_geography" BEFORE INSERT ON "public"."reports" FOR EACH ROW EXECUTE FUNCTION "public"."assign_report_geography"();



CREATE OR REPLACE TRIGGER "trigger_notify_conflict_chain" AFTER INSERT ON "public"."conflict_damages" FOR EACH ROW EXECUTE FUNCTION "public"."notify_conflict_chain"();



CREATE OR REPLACE TRIGGER "trigger_notify_new_report" AFTER INSERT ON "public"."reports" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://mnytrlcmdpkfhrzrtesf.supabase.co/functions/v1/create-user', 'POST', '{"Content-type":"application/json"}', '{}', '10000');



CREATE OR REPLACE TRIGGER "trigger_notify_observation_chain" AFTER INSERT ON "public"."observations" FOR EACH ROW EXECUTE FUNCTION "public"."notify_observation_chain"();



CREATE OR REPLACE TRIGGER "trigger_notify_proximity_on_report" AFTER INSERT ON "public"."reports" FOR EACH ROW EXECUTE FUNCTION "public"."notify_proximity_on_report"();



CREATE OR REPLACE TRIGGER "trigger_send_push_on_notification" AFTER INSERT ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "public"."send_push_on_notification"();



CREATE OR REPLACE TRIGGER "trigger_sync_auth_user_phone" AFTER UPDATE OF "phone" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."sync_auth_user_phone"();



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."conflict_damages"
    ADD CONSTRAINT "conflict_damages_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."geo_beats"
    ADD CONSTRAINT "geo_beats_range_id_fkey" FOREIGN KEY ("range_id") REFERENCES "public"."geo_ranges"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."geo_ranges"
    ADD CONSTRAINT "geo_ranges_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "public"."geo_divisions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."observations"
    ADD CONSTRAINT "observations_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."report_media"
    ADD CONSTRAINT "report_media_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_beat_id_fkey" FOREIGN KEY ("beat_id") REFERENCES "public"."geo_beats"("id");



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_region_assignments"
    ADD CONSTRAINT "user_region_assignments_beat_id_fkey" FOREIGN KEY ("beat_id") REFERENCES "public"."geo_beats"("id");



ALTER TABLE ONLY "public"."user_region_assignments"
    ADD CONSTRAINT "user_region_assignments_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "public"."geo_divisions"("id");



ALTER TABLE ONLY "public"."user_region_assignments"
    ADD CONSTRAINT "user_region_assignments_range_id_fkey" FOREIGN KEY ("range_id") REFERENCES "public"."geo_ranges"("id");



ALTER TABLE ONLY "public"."user_region_assignments"
    ADD CONSTRAINT "user_region_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can Manage All Notifications" ON "public"."notifications" USING (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'ccf'::"text"])));



CREATE POLICY "Admins can manage all assignments" ON "public"."user_region_assignments" TO "authenticated" USING (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'ccf'::"text"]))) WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'ccf'::"text"])));



CREATE POLICY "Admins can manage all conflict damages" ON "public"."conflict_damages" USING (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'ccf'::"text", 'dfo'::"text"])));



CREATE POLICY "Admins can manage all observations" ON "public"."observations" USING (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'ccf'::"text", 'dfo'::"text"])));



CREATE POLICY "Admins can manage all report media" ON "public"."report_media" USING (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'ccf'::"text", 'dfo'::"text"])));



CREATE POLICY "Admins can read all assignments" ON "public"."user_region_assignments" FOR SELECT USING (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'ccf'::"text", 'dfo'::"text"])));



CREATE POLICY "Admins can read all profiles" ON "public"."profiles" FOR SELECT USING (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'ccf'::"text", 'dfo'::"text"])));



CREATE POLICY "Admins can read audit logs" ON "public"."audit_log" FOR SELECT USING (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'ccf'::"text"])));



CREATE POLICY "Admins can update all profiles" ON "public"."profiles" FOR UPDATE USING (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'ccf'::"text"])));



CREATE POLICY "Allow public read access" ON "public"."geo_beats" FOR SELECT USING (true);



CREATE POLICY "Allow public read access" ON "public"."geo_divisions" FOR SELECT USING (true);



CREATE POLICY "Allow public read access" ON "public"."geo_ranges" FOR SELECT USING (true);



CREATE POLICY "Authenticated users can insert audit entries" ON "public"."audit_log" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Beat View Access" ON "public"."reports" FOR SELECT USING ((("public"."get_my_role"() = 'beat_guard'::"text") AND ("beat_id" IN ( SELECT "user_region_assignments"."beat_id"
   FROM "public"."user_region_assignments"
  WHERE ("user_region_assignments"."user_id" = "auth"."uid"())))));



CREATE POLICY "DFOs can manage their division subordinates" ON "public"."user_region_assignments" TO "authenticated" USING ((("public"."get_my_role"() = 'dfo'::"text") AND (( SELECT ("profiles"."role")::"text" AS "role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "user_region_assignments"."user_id")) = ANY (ARRAY['range_officer'::"text", 'beat_guard'::"text"])) AND ("division_id" = "public"."get_my_division_id"()))) WITH CHECK ((("public"."get_my_role"() = 'dfo'::"text") AND (( SELECT ("profiles"."role")::"text" AS "role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "user_region_assignments"."user_id")) = ANY (ARRAY['range_officer'::"text", 'beat_guard'::"text"])) AND ("division_id" = "public"."get_my_division_id"())));



CREATE POLICY "Division View Access" ON "public"."reports" FOR SELECT USING ((("public"."get_my_role"() = ANY (ARRAY['dfo'::"text", 'rrt'::"text"])) AND ("beat_id" IN ( SELECT "b"."id"
   FROM ("public"."geo_beats" "b"
     JOIN "public"."geo_ranges" "r" ON (("b"."range_id" = "r"."id")))
  WHERE ("r"."division_id" IN ( SELECT "user_region_assignments"."division_id"
           FROM "public"."user_region_assignments"
          WHERE ("user_region_assignments"."user_id" = "auth"."uid"())))))));



CREATE POLICY "Global View Access" ON "public"."reports" FOR SELECT USING (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'ccf'::"text", 'biologist'::"text", 'veterinarian'::"text"])));



CREATE POLICY "Insert Observations if author of Report" ON "public"."observations" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."reports"
  WHERE (("reports"."id" = "observations"."report_id") AND ("reports"."user_id" = "auth"."uid"())))));



CREATE POLICY "Leadership can delete scoped assignments" ON "public"."user_region_assignments" FOR DELETE USING ((("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'ccf'::"text"])) OR (("public"."get_my_role"() = 'dfo'::"text") AND ("division_id" = "public"."get_my_primary_division_id"())) OR (("public"."get_my_role"() = 'range_officer'::"text") AND ("beat_id" IS NOT NULL) AND ("range_id" = "public"."get_my_primary_range_id"()))));



CREATE POLICY "Leadership can insert scoped assignments" ON "public"."user_region_assignments" FOR INSERT WITH CHECK ((("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'ccf'::"text"])) OR (("public"."get_my_role"() = 'dfo'::"text") AND ("division_id" = "public"."get_my_primary_division_id"()) AND (( SELECT ("p"."role")::"text" AS "role"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "user_region_assignments"."user_id")) = ANY (ARRAY['range_officer'::"text", 'beat_guard'::"text"]))) OR (("public"."get_my_role"() = 'range_officer'::"text") AND ("beat_id" IS NOT NULL) AND ("range_id" = "public"."get_my_primary_range_id"()) AND (( SELECT ("p"."role")::"text" AS "role"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "user_region_assignments"."user_id")) = 'beat_guard'::"text"))));



CREATE POLICY "Leadership can update scoped assignments" ON "public"."user_region_assignments" FOR UPDATE USING (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'ccf'::"text", 'dfo'::"text", 'range_officer'::"text"]))) WITH CHECK ((("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'ccf'::"text"])) OR (("public"."get_my_role"() = 'dfo'::"text") AND ("division_id" = "public"."get_my_primary_division_id"()) AND (( SELECT ("p"."role")::"text" AS "role"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "user_region_assignments"."user_id")) = ANY (ARRAY['range_officer'::"text", 'beat_guard'::"text"]))) OR (("public"."get_my_role"() = 'range_officer'::"text") AND ("beat_id" IS NOT NULL) AND ("range_id" = "public"."get_my_primary_range_id"()) AND (( SELECT ("p"."role")::"text" AS "role"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "user_region_assignments"."user_id")) = 'beat_guard'::"text"))));



CREATE POLICY "ROs can manage their range subordinates" ON "public"."user_region_assignments" TO "authenticated" USING ((("public"."get_my_role"() = 'range_officer'::"text") AND (( SELECT ("profiles"."role")::"text" AS "role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "user_region_assignments"."user_id")) = 'beat_guard'::"text") AND ("range_id" = "public"."get_my_range_id"()))) WITH CHECK ((("public"."get_my_role"() = 'range_officer'::"text") AND (( SELECT ("profiles"."role")::"text" AS "role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "user_region_assignments"."user_id")) = 'beat_guard'::"text") AND ("range_id" = "public"."get_my_range_id"())));



CREATE POLICY "Range View Access" ON "public"."reports" FOR SELECT USING ((("public"."get_my_role"() = 'range_officer'::"text") AND ("beat_id" IN ( SELECT "gb"."id"
   FROM ("public"."geo_beats" "gb"
     JOIN "public"."geo_ranges" "gr" ON (("gb"."range_id" = "gr"."id")))
  WHERE ("gr"."id" IN ( SELECT "user_region_assignments"."range_id"
           FROM "public"."user_region_assignments"
          WHERE ("user_region_assignments"."user_id" = "auth"."uid"())))))));



CREATE POLICY "Self View Access" ON "public"."reports" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Service role can manage all assignments" ON "public"."user_region_assignments" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage all conflict damages" ON "public"."conflict_damages" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage all notifications" ON "public"."notifications" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage all observations" ON "public"."observations" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage all profiles" ON "public"."profiles" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage all push tokens" ON "public"."push_tokens" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage all report media" ON "public"."report_media" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage audit logs" ON "public"."audit_log" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Territory scoped read conflict damages" ON "public"."conflict_damages" FOR SELECT USING ("public"."can_read_report"("report_id"));



CREATE POLICY "Territory scoped read observations" ON "public"."observations" FOR SELECT USING ("public"."can_read_report"("report_id"));



CREATE POLICY "Territory scoped read report media" ON "public"."report_media" FOR SELECT USING ("public"."can_read_report"("report_id"));



CREATE POLICY "Territory scoped read reports" ON "public"."reports" FOR SELECT USING ("public"."can_read_report"("id"));



CREATE POLICY "Update Access" ON "public"."reports" FOR UPDATE USING ((("user_id" = "auth"."uid"()) OR ("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'rrt'::"text"]))));



CREATE POLICY "Update Observations if author of Report" ON "public"."observations" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."reports"
  WHERE (("reports"."id" = "observations"."report_id") AND ("reports"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can Read Their Own Notifications" ON "public"."notifications" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can Update Their Own Notifications (eg. Mark Read)" ON "public"."notifications" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create reports" ON "public"."reports" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can delete own observations" ON "public"."observations" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."reports" "r"
  WHERE (("r"."id" = "observations"."report_id") AND ("r"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can delete own push tokens" ON "public"."push_tokens" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert conflict damages for own reports" ON "public"."conflict_damages" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."reports" "r"
  WHERE (("r"."id" = "conflict_damages"."report_id") AND ("r"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can insert media for own reports" ON "public"."report_media" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."reports" "r"
  WHERE (("r"."id" = "report_media"."report_id") AND ("r"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can insert observations for own reports" ON "public"."observations" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."reports" "r"
  WHERE (("r"."id" = "observations"."report_id") AND ("r"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can insert own push tokens" ON "public"."push_tokens" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own assignments" ON "public"."user_region_assignments" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own conflict damages" ON "public"."conflict_damages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."reports" "r"
  WHERE (("r"."id" = "conflict_damages"."report_id") AND ("r"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can read own observations" ON "public"."observations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."reports" "r"
  WHERE (("r"."id" = "observations"."report_id") AND ("r"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can read own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can read own push tokens" ON "public"."push_tokens" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own report media" ON "public"."report_media" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."reports" "r"
  WHERE (("r"."id" = "report_media"."report_id") AND ("r"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can update own observations" ON "public"."observations" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."reports" "r"
  WHERE (("r"."id" = "observations"."report_id") AND ("r"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."reports" "r"
  WHERE (("r"."id" = "observations"."report_id") AND ("r"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own push tokens" ON "public"."push_tokens" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage their own push tokens" ON "public"."push_tokens" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "View Observations if can view Report" ON "public"."observations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."reports"
  WHERE ("reports"."id" = "observations"."report_id"))));



ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conflict_damages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."geo_beats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."geo_divisions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."geo_ranges" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."observations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_dispatch_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."report_media" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_region_assignments" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";









GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


















































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































GRANT ALL ON FUNCTION "public"."assign_report_geography"() TO "anon";
GRANT ALL ON FUNCTION "public"."assign_report_geography"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_report_geography"() TO "service_role";



GRANT ALL ON FUNCTION "public"."can_read_report"("p_report_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_read_report"("p_report_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_read_report"("p_report_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_phone_registered"("p_phone" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."check_phone_registered"("p_phone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_phone_registered"("p_phone" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_phone_identity"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_phone_identity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_phone_identity"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_geo_centroid_lat_lng"("p_beat_id" "uuid", "p_range_id" "uuid", "p_division_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_geo_centroid_lat_lng"("p_beat_id" "uuid", "p_range_id" "uuid", "p_division_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_geo_centroid_lat_lng"("p_beat_id" "uuid", "p_range_id" "uuid", "p_division_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_division_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_division_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_division_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_primary_division_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_primary_division_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_primary_division_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_primary_range_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_primary_range_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_primary_range_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_range_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_range_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_range_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_push_dispatch_auth_token"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_push_dispatch_auth_token"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_push_dispatch_auth_token"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_auth_user_profile"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_auth_user_profile"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_auth_user_profile"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user_phone"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user_phone"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user_phone"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_all_notifications_read"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_all_notifications_read"() TO "anon";
GRANT ALL ON FUNCTION "public"."mark_all_notifications_read"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_all_notifications_read"() TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_phone_e164"("p_phone" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_phone_e164"("p_phone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_phone_e164"("p_phone" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_chain_of_command_on_report"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_chain_of_command_on_report"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_chain_of_command_on_report"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_conflict_chain"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_conflict_chain"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_conflict_chain"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_observation_chain"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_observation_chain"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_observation_chain"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_proximity_on_report"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_proximity_on_report"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_proximity_on_report"() TO "service_role";



GRANT ALL ON FUNCTION "public"."profiles_set_location_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."profiles_set_location_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."profiles_set_location_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."profiles_set_location_updated_at_on_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."profiles_set_location_updated_at_on_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."profiles_set_location_updated_at_on_insert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_profile_centroid_lat_lng"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_profile_centroid_lat_lng"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_profile_centroid_lat_lng"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."send_push_on_notification"() TO "anon";
GRANT ALL ON FUNCTION "public"."send_push_on_notification"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_push_on_notification"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_auth_user_phone"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_auth_user_phone"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_auth_user_phone"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_phone_for_otp"("p_phone" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_phone_for_otp"("p_phone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_phone_for_otp"("p_phone" "text") TO "service_role";

















































































GRANT ALL ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."conflict_damages" TO "anon";
GRANT ALL ON TABLE "public"."conflict_damages" TO "authenticated";
GRANT ALL ON TABLE "public"."conflict_damages" TO "service_role";



GRANT ALL ON TABLE "public"."geo_beats" TO "anon";
GRANT ALL ON TABLE "public"."geo_beats" TO "authenticated";
GRANT ALL ON TABLE "public"."geo_beats" TO "service_role";



GRANT ALL ON TABLE "public"."geo_divisions" TO "anon";
GRANT ALL ON TABLE "public"."geo_divisions" TO "authenticated";
GRANT ALL ON TABLE "public"."geo_divisions" TO "service_role";



GRANT ALL ON TABLE "public"."geo_ranges" TO "anon";
GRANT ALL ON TABLE "public"."geo_ranges" TO "authenticated";
GRANT ALL ON TABLE "public"."geo_ranges" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."observations" TO "anon";
GRANT ALL ON TABLE "public"."observations" TO "authenticated";
GRANT ALL ON TABLE "public"."observations" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."push_dispatch_config" TO "anon";
GRANT ALL ON TABLE "public"."push_dispatch_config" TO "authenticated";
GRANT ALL ON TABLE "public"."push_dispatch_config" TO "service_role";



GRANT ALL ON TABLE "public"."push_tokens" TO "anon";
GRANT ALL ON TABLE "public"."push_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."push_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."report_media" TO "anon";
GRANT ALL ON TABLE "public"."report_media" TO "authenticated";
GRANT ALL ON TABLE "public"."report_media" TO "service_role";



GRANT ALL ON TABLE "public"."reports" TO "anon";
GRANT ALL ON TABLE "public"."reports" TO "authenticated";
GRANT ALL ON TABLE "public"."reports" TO "service_role";



GRANT ALL ON TABLE "public"."user_region_assignments" TO "anon";
GRANT ALL ON TABLE "public"."user_region_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."user_region_assignments" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































