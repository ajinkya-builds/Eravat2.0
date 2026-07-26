-- Fix handle_new_auth_user_profile: always insert profile with lat/lng; block duplicate phones on other users.

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
      split_part(COALESCE(NEW.email, 'user'), '@', 1),
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
