-- Creates a secure function to look up a user's email by their phone number.
-- This is needed for phone-number-based login (phone + password).
-- The function queries auth.users joined with profiles.

CREATE OR REPLACE FUNCTION public.get_email_by_phone(p_phone text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.email
  FROM auth.users u
  INNER JOIN public.profiles p ON p.id = u.id
  WHERE p.phone = p_phone
    AND p.is_active = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_email_by_phone(text) TO anon, authenticated;
