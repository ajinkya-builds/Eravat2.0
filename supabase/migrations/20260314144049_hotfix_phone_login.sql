-- HOTFIX: Fix get_email_by_phone to handle country codes (+91) stored in DB.
-- Previously, phones stored as "+91-9385379265" strip to "919385379265" (12 digits),
-- which fails to match a 10-digit input "9385379265".
-- New logic: compare the LAST 10 digits of both stored phone and input.

CREATE OR REPLACE FUNCTION public.get_email_by_phone(p_phone text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_clean_p_phone text;
BEGIN
  -- Strip all non-digit characters from input
  v_clean_p_phone := regexp_replace(p_phone, '\D', '', 'g');

  -- Normalize to last 10 digits to handle country code prefixes (e.g. 91XXXXXXXXXX to XXXXXXXXXX)
  IF length(v_clean_p_phone) > 10 THEN
    v_clean_p_phone := right(v_clean_p_phone, 10);
  END IF;

  -- Match by last 10 digits of stored phone (handles +91-, 0091, etc.)
  SELECT u.email INTO v_email
  FROM auth.users u
  INNER JOIN public.profiles p ON p.id = u.id
  WHERE right(regexp_replace(p.phone, '\D', '', 'g'), 10) = v_clean_p_phone
    AND p.is_active = true
  LIMIT 1;

  RETURN v_email;
END;
$$;

-- Restore anon grant: login flow is unauthenticated, anon role must be able to call this.
GRANT EXECUTE ON FUNCTION public.get_email_by_phone(text) TO anon, authenticated;
