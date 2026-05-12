-- Keep public.profiles in sync with auth.users: backfill orphans and auto-insert on new auth users.
-- Fixes sessions where GoTrue has a user id but no profiles row (OTP edge cases, legacy data).

INSERT INTO public.profiles (id, first_name, last_name, role, is_active)
SELECT
  u.id,
  COALESCE(
    NULLIF(trim(both from u.raw_user_meta_data->>'first_name'), ''),
    split_part(COALESCE(u.email, 'user'), '@', 1),
    'User'
  ),
  COALESCE(NULLIF(trim(both from u.raw_user_meta_data->>'last_name'), ''), ''),
  'volunteer',
  true
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, role, is_active)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(trim(both from NEW.raw_user_meta_data->>'first_name'), ''),
      split_part(COALESCE(NEW.email, 'user'), '@', 1),
      'User'
    ),
    COALESCE(NULLIF(trim(both from NEW.raw_user_meta_data->>'last_name'), ''), ''),
    'volunteer',
    true
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_sync_profile ON auth.users;
CREATE TRIGGER on_auth_user_sync_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user_profile();
