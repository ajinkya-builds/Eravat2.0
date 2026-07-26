-- Security fix: Use exact phone matching instead of LIKE wildcard
-- and remove anon grant to prevent unauthenticated phone enumeration.

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
  -- Strip all non-digit characters
  v_clean_p_phone := regexp_replace(p_phone, '\D', '', 'g');

  -- Use exact match on cleaned phone digits instead of LIKE wildcard
  SELECT u.email INTO v_email
  FROM auth.users u
  INNER JOIN public.profiles p ON p.id = u.id
  WHERE regexp_replace(p.phone, '\D', '', 'g') = v_clean_p_phone
    AND p.is_active = true
  LIMIT 1;

  RETURN v_email;
END;
$$;

-- Revoke anon access to prevent unauthenticated phone enumeration
REVOKE EXECUTE ON FUNCTION public.get_email_by_phone(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_email_by_phone(text) TO authenticated;
