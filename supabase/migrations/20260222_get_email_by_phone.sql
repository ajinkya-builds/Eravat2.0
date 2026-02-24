-- Creates a secure function to look up a user's email by their phone number.
-- This is needed for phone-number-based login (phone + password).
-- The function queries auth.users joined with profiles.

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
  -- Extract only digits from input
  v_clean_p_phone := regexp_replace(p_phone, '\D', '', 'g');
  
  -- Match by last 10 digits
  SELECT u.email INTO v_email
  FROM auth.users u
  INNER JOIN public.profiles p ON p.id = u.id
  WHERE regexp_replace(p.phone, '\D', '', 'g') LIKE '%' || RIGHT(v_clean_p_phone, 10)
    AND p.is_active = true
  LIMIT 1;

  RETURN v_email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_email_by_phone(text) TO anon, authenticated;
