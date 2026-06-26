-- ============================================================
-- Eravat 2.0 — Create New Admin User (Phone-Only Auth)
-- ============================================================
-- Run this in the Supabase SQL Editor (with service_role access).
--
-- Tables touched:
--   1. auth.users              — Supabase Auth record
--   2. auth.identities         — Required for login to work
--   3. public.profiles         — Application profile + role
-- ============================================================

DO $$
DECLARE
  -- ── ✏️  CONFIGURE YOUR NEW ADMIN HERE ──────────────────────
  v_phone       TEXT    := '+919988775566';          -- Change this (E.164 format)
  v_first_name  TEXT    := 'E2E';                    -- Change this
  v_last_name   TEXT    := 'Admin';                  -- Change this
  -- ────────────────────────────────────────────────────────────

  v_user_id     UUID    := gen_random_uuid();
  v_now         TIMESTAMPTZ := now();
  v_clean_phone TEXT;
BEGIN

  -- ── STEP 1: Validate inputs ──────────────────────────────────────────────
  IF v_phone IS NULL OR v_phone = '' THEN
    RAISE EXCEPTION 'Phone number cannot be empty.';
  END IF;

  -- Clean phone to extract only digits
  v_clean_phone := regexp_replace(v_phone, '\D', '', 'g');
  
  -- Ensure it's in GoTrue normalized format (e.g. 91XXXXXXXXXX)
  IF length(v_clean_phone) = 10 THEN
    v_clean_phone := '91' || v_clean_phone;
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE phone = v_clean_phone) THEN
    RAISE EXCEPTION 'A user with phone "%" already exists in auth.users.', v_clean_phone;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE right(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), 10) = right(v_clean_phone, 10)
  ) THEN
    RAISE EXCEPTION 'A user with phone "%" already exists in profiles.', v_phone;
  END IF;

  RAISE NOTICE '✅ Validation passed. Creating admin user with phone: %', v_phone;


  -- ── STEP 2: Insert into auth.users ──────────────────────────────────────
  -- Note: No email or password is used. Phone is the provider.
  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    phone,
    phone_confirmed_at,
    raw_user_meta_data,
    raw_app_meta_data,
    is_super_admin,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change
  ) VALUES (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',  -- default instance
    'authenticated',
    'authenticated',
    v_clean_phone,
    v_now,               -- phone confirmed
    jsonb_build_object(
      'first_name', v_first_name,
      'last_name',  v_last_name,
      'role',       'admin'
    ),
    '{"provider": "phone", "providers": ["phone"]}'::jsonb,
    false,
    v_now,
    v_now,
    '',
    '',
    '',
    ''
  );

  RAISE NOTICE '✅ STEP 2 done — auth.users row created (id: %)', v_user_id;


  -- ── STEP 3: Insert into auth.identities ──────────────────────────────────
  -- Supabase GoTrue requires an identity row for every login provider.
  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    v_user_id,
    jsonb_build_object(
      'sub',   v_user_id::text,
      'phone', v_clean_phone
    ),
    'phone',
    v_clean_phone,   -- provider_id for phone provider = normalized phone digits
    v_now,
    v_now,
    v_now
  )
  ON CONFLICT DO NOTHING;

  RAISE NOTICE '✅ STEP 3 done — auth.identities row created';


  -- ── STEP 4: Insert into public.profiles ───────────────────────────────────
  -- role = 'admin' grants full global access.
  INSERT INTO public.profiles (
    id,
    role,
    first_name,
    last_name,
    phone,
    is_active,
    created_at,
    updated_at
  ) VALUES (
    v_user_id,
    'admin',
    trim(v_first_name),
    trim(v_last_name),
    v_phone,           -- E.164 format with '+' prefix
    true,
    v_now,
    v_now
  );

  RAISE NOTICE '✅ STEP 4 done — public.profiles row created with role = admin';


  -- ── DONE ─────────────────────────────────────────────────────────────────
  RAISE NOTICE '';
  RAISE NOTICE '🎉 Admin user created successfully!';
  RAISE NOTICE '   ID:    %', v_user_id;
  RAISE NOTICE '   Phone: %', v_phone;
  RAISE NOTICE '   Name:  % %', v_first_name, v_last_name;
  RAISE NOTICE '   Role:  admin';
  RAISE NOTICE '';

END $$;
