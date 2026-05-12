-- ============================================================
-- Eravat 2.0 — Create New Admin User
-- ============================================================
-- Run this in the Supabase SQL Editor (with service_role access).
--
-- Tables touched:
--   1. auth.users              — Supabase Auth record
--   2. auth.identities         — Required for login to work (auto-triggered,
--                                but inserted explicitly here for safety)
--   3. public.profiles         — Application profile + role
--
-- NOTE: Admins have GLOBAL scope, so NO user_region_assignments row
--       is needed (that table is only for geographic roles like
--       dfo, range_officer, beat_guard, rrt).
-- ============================================================

DO $$
DECLARE
  -- ── ✏️  CONFIGURE YOUR NEW ADMIN HERE ──────────────────────
  v_email       TEXT    := 'newadmin@example.com';   -- Change this
  v_password    TEXT    := 'StrongPass123!';         -- Change this
  v_first_name  TEXT    := 'John';                   -- Change this
  v_last_name   TEXT    := 'Doe';                    -- Change this
  v_phone       TEXT    := '+919876543210';          -- Change this (E.164 format) or set to NULL
  -- ────────────────────────────────────────────────────────────

  v_user_id     UUID    := gen_random_uuid();
  v_now         TIMESTAMPTZ := now();
BEGIN

  -- ── STEP 1: Validate inputs ──────────────────────────────────────────────
  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'Email cannot be empty.';
  END IF;

  IF v_password IS NULL OR length(v_password) < 8 THEN
    RAISE EXCEPTION 'Password must be at least 8 characters.';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_email) THEN
    RAISE EXCEPTION 'A user with email "%" already exists.', v_email;
  END IF;

  IF v_phone IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles WHERE phone = v_phone
  ) THEN
    RAISE EXCEPTION 'A user with phone "%" already exists.', v_phone;
  END IF;

  RAISE NOTICE '✅ Validation passed. Creating admin user: %', v_email;


  -- ── STEP 2: Insert into auth.users ──────────────────────────────────────
  -- This is the core Supabase Auth record.
  -- encrypted_password uses bcrypt via the extensions schema.
  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,   -- Pre-confirm so no email verification needed
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
    v_email,
    extensions.crypt(v_password, extensions.gen_salt('bf')),
    v_now,               -- pre-confirmed
    jsonb_build_object(
      'first_name', v_first_name,
      'last_name',  v_last_name,
      'role',       'admin'
    ),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
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
  -- Without this, the user cannot log in even if auth.users exists.
  -- The existing DB trigger (from migration 20260315000000) should handle
  -- this automatically, but we insert explicitly here as a safety net.
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
      'email', v_email
    ),
    'email',
    v_user_id::text,   -- provider_id for email provider = user UUID
    v_now,
    v_now,
    v_now
  )
  ON CONFLICT DO NOTHING;  -- Safe to skip if the trigger already created it

  RAISE NOTICE '✅ STEP 3 done — auth.identities row created';


  -- ── STEP 4: Insert into public.profiles ───────────────────────────────────
  -- This is the application-level profile that drives RBAC throughout the app.
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
    v_phone,
    true,
    v_now,
    v_now
  );

  RAISE NOTICE '✅ STEP 4 done — public.profiles row created with role = admin';


  -- ── DONE ─────────────────────────────────────────────────────────────────
  RAISE NOTICE '';
  RAISE NOTICE '🎉 Admin user created successfully!';
  RAISE NOTICE '   ID:    %', v_user_id;
  RAISE NOTICE '   Email: %', v_email;
  RAISE NOTICE '   Name:  % %', v_first_name, v_last_name;
  RAISE NOTICE '   Phone: %', COALESCE(v_phone, '(not set)');
  RAISE NOTICE '   Role:  admin';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  IMPORTANT: Change the password after first login!';

END $$;
