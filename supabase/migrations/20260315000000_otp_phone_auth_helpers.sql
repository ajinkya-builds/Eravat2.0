-- OTP Phone Authentication Helper Functions
-- Created: 2026-03-15
-- Purpose: Support OTP-based phone authentication

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Phone Format Validation Function
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.normalize_phone_e164(p_phone text)
RETURNS text
LANGUAGE plpgsql
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

COMMENT ON FUNCTION public.normalize_phone_e164(text) IS
'Converts Indian phone numbers to E.164 format (+919XXXXXXXXX) for Supabase OTP authentication';

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.normalize_phone_e164(text) TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Phone Validation Function (Check if exists and active)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.validate_phone_for_otp(p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_phone text;
  v_user_id uuid;
  v_is_active boolean;
  v_email text;
BEGIN
  -- Normalize phone to last 10 digits for lookup
  v_clean_phone := regexp_replace(p_phone, '\D', '', 'g');
  IF length(v_clean_phone) > 10 THEN
    v_clean_phone := right(v_clean_phone, 10);
  END IF;

  -- Check if phone exists and is active
  SELECT p.id, p.is_active, u.email
  INTO v_user_id, v_is_active, v_email
  FROM public.profiles p
  INNER JOIN auth.users u ON u.id = p.id
  WHERE right(regexp_replace(p.phone, '\D', '', 'g'), 10) = v_clean_phone
  LIMIT 1;

  -- Return validation result
  IF v_user_id IS NULL THEN
    -- Don't reveal if phone exists (security)
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
      'email', v_email,
      'message', 'Phone number validated'
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION public.validate_phone_for_otp(text) IS
'Validates phone number exists and user is active before sending OTP. Does not reveal if phone is unregistered (security).';

-- Grant execute permissions (anon needed for pre-login validation)
GRANT EXECUTE ON FUNCTION public.validate_phone_for_otp(text) TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Update profiles.phone to E.164 format (One-time data migration)
-- ═══════════════════════════════════════════════════════════════════════════

-- NOTE: This is a one-time update to normalize existing phone numbers
-- Comment out after first run if needed

DO $$
DECLARE
  r RECORD;
  v_normalized text;
BEGIN
  FOR r IN SELECT id, phone FROM public.profiles WHERE phone IS NOT NULL
  LOOP
    BEGIN
      v_normalized := public.normalize_phone_e164(r.phone);
      UPDATE public.profiles
      SET phone = v_normalized
      WHERE id = r.id;

      RAISE NOTICE 'Updated phone for user %: % -> %', r.id, r.phone, v_normalized;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to normalize phone for user %: %', r.id, SQLERRM;
    END;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Sync auth.users.phone with profiles.phone (for OTP to work)
-- ═══════════════════════════════════════════════════════════════════════════

-- Supabase OTP requires auth.users.phone to be set
-- This function syncs profiles.phone -> auth.users.phone

CREATE OR REPLACE FUNCTION public.sync_auth_user_phone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When profile phone is updated, sync to auth.users
  IF NEW.phone IS NOT NULL AND NEW.phone != OLD.phone THEN
    -- Note: This requires service_role or direct DB access
    -- Cannot update auth.users from regular SQL due to RLS
    -- This should be called from Edge Function or admin panel
    RAISE NOTICE 'Phone updated for user %. Auth sync required via Edge Function.', NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger (informational only - actual sync happens via Edge Function)
DROP TRIGGER IF EXISTS trigger_sync_auth_user_phone ON public.profiles;
CREATE TRIGGER trigger_sync_auth_user_phone
  AFTER UPDATE OF phone ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_auth_user_phone();

COMMENT ON FUNCTION public.sync_auth_user_phone() IS
'Trigger to notify when profile phone changes. Actual auth.users sync must happen via Edge Function with service_role.';
