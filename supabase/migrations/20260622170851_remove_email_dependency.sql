-- Migration: remove_email_dependency
-- Description: Drops get_email_by_phone RPC, adds check_phone_registered RPC,
--              and updates handle_new_auth_user_profile trigger to fallback to 'User'
--              instead of parsing email prefix when first name metadata is empty.

-- 1. Drop the legacy get_email_by_phone function
DROP FUNCTION IF EXISTS public.get_email_by_phone(text);

-- 2. Create the new secure check_phone_registered RPC
CREATE OR REPLACE FUNCTION public.check_phone_registered(p_phone text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

COMMENT ON FUNCTION public.check_phone_registered(text) IS
'Checks if a user with the specified phone number exists and is active, returning a boolean. Does not leak email or other profile data.';

-- Grant execute permissions (anon role needs access to run this pre-authentication)
GRANT EXECUTE ON FUNCTION public.check_phone_registered(text) TO anon, authenticated;

-- 3. Redefine handle_new_auth_user_profile to remove email parsing fallback
CREATE OR REPLACE FUNCTION public.handle_new_auth_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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
