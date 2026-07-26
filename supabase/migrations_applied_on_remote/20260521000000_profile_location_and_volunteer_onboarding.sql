-- Profile GPS location (mandatory) + centroid backfill for existing users
-- Geo centroids on divisions/ranges/beats already exist (20260223090000).

SET search_path TO public, extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add location columns to profiles
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS location_updated_at timestamptz;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS chk_profiles_latitude;

ALTER TABLE public.profiles
  ADD CONSTRAINT chk_profiles_latitude
  CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90));

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS chk_profiles_longitude;

ALTER TABLE public.profiles
  ADD CONSTRAINT chk_profiles_longitude
  CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180));

-- Auto-stamp location_updated_at when coordinates change
CREATE OR REPLACE FUNCTION public.profiles_set_location_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.latitude IS DISTINCT FROM OLD.latitude
     OR NEW.longitude IS DISTINCT FROM OLD.longitude THEN
    NEW.location_updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_location_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_location_updated_at
  BEFORE UPDATE OF latitude, longitude ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_set_location_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Resolve default lat/lng from assigned region centroid (role-aware)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_geo_centroid_lat_lng(
  p_beat_id uuid DEFAULT NULL,
  p_range_id uuid DEFAULT NULL,
  p_division_id uuid DEFAULT NULL
)
RETURNS TABLE(latitude double precision, longitude double precision)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    ST_Y(c.centroid::geometry)::double precision AS latitude,
    ST_X(c.centroid::geometry)::double precision AS longitude
  FROM (
    SELECT gb.centroid
    FROM public.geo_beats gb
    WHERE p_beat_id IS NOT NULL AND gb.id = p_beat_id AND gb.centroid IS NOT NULL
    UNION ALL
    SELECT gr.centroid
    FROM public.geo_ranges gr
    WHERE p_beat_id IS NULL AND p_range_id IS NOT NULL AND gr.id = p_range_id AND gr.centroid IS NOT NULL
    UNION ALL
    SELECT gd.centroid
    FROM public.geo_divisions gd
    WHERE p_beat_id IS NULL AND p_range_id IS NULL AND p_division_id IS NOT NULL AND gd.id = p_division_id AND gd.centroid IS NOT NULL
  ) c
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.resolve_profile_centroid_lat_lng(p_user_id uuid)
RETURNS TABLE(latitude double precision, longitude double precision)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  WITH me AS (
    SELECT p.id, p.role::text AS role
    FROM public.profiles p
    WHERE p.id = p_user_id
  ),
  ura AS (
    SELECT
      ura.user_id,
      ura.division_id,
      ura.range_id,
      ura.beat_id
    FROM public.user_region_assignments ura
    WHERE ura.user_id = p_user_id
    ORDER BY
      (ura.beat_id IS NOT NULL) DESC,
      (ura.range_id IS NOT NULL) DESC,
      (ura.division_id IS NOT NULL) DESC
    LIMIT 1
  ),
  geo_point AS (
    SELECT
      CASE
        WHEN m.role IN ('beat_guard', 'volunteer') AND u.beat_id IS NOT NULL THEN gb.centroid
        WHEN m.role IN ('range_officer', 'rrt') AND u.range_id IS NOT NULL THEN gr.centroid
        WHEN m.role = 'dfo' AND u.division_id IS NOT NULL THEN gd.centroid
        WHEN u.beat_id IS NOT NULL THEN gb.centroid
        WHEN u.range_id IS NOT NULL THEN gr.centroid
        WHEN u.division_id IS NOT NULL THEN gd.centroid
        ELSE NULL
      END AS centroid
    FROM me m
    LEFT JOIN ura u ON u.user_id = m.id
    LEFT JOIN public.geo_beats gb ON gb.id = u.beat_id
    LEFT JOIN public.geo_ranges gr ON gr.id = u.range_id
    LEFT JOIN public.geo_divisions gd ON gd.id = u.division_id
  )
  SELECT
    ST_Y(gp.centroid::geometry)::double precision AS latitude,
    ST_X(gp.centroid::geometry)::double precision AS longitude
  FROM geo_point gp
  WHERE gp.centroid IS NOT NULL;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Backfill missing profile locations from region centroids
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.profiles
SET
  latitude = sub.latitude,
  longitude = sub.longitude,
  location_updated_at = COALESCE(profiles.location_updated_at, now())
FROM (
  SELECT pr.id, c.latitude, c.longitude
  FROM public.profiles pr
  CROSS JOIN LATERAL public.resolve_profile_centroid_lat_lng(pr.id) c
  WHERE (pr.latitude IS NULL OR pr.longitude IS NULL)
    AND c.latitude IS NOT NULL
    AND c.longitude IS NOT NULL
) sub
WHERE profiles.id = sub.id;

-- State-wide roles without territory: India centroid fallback
UPDATE public.profiles p
SET
  latitude = 22.9734,
  longitude = 78.6568,
  location_updated_at = COALESCE(p.location_updated_at, now())
WHERE (p.latitude IS NULL OR p.longitude IS NULL)
  AND p.role IN ('admin', 'ccf', 'biologist', 'veterinarian');

-- Last resort for any remaining rows
UPDATE public.profiles p
SET
  latitude = 22.9734,
  longitude = 78.6568,
  location_updated_at = COALESCE(p.location_updated_at, now())
WHERE p.latitude IS NULL OR p.longitude IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Enforce NOT NULL after backfill
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ALTER COLUMN latitude SET NOT NULL,
  ALTER COLUMN longitude SET NOT NULL;

-- New profiles: default location_updated_at on insert when coords provided
CREATE OR REPLACE FUNCTION public.profiles_set_location_updated_at_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL AND NEW.location_updated_at IS NULL THEN
    NEW.location_updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_location_insert ON public.profiles;
CREATE TRIGGER trg_profiles_location_insert
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_set_location_updated_at_on_insert();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS: users may update own profile (including location); not others'
--    Existing policies already scope UPDATE to auth.uid() = id.
--    Add explicit policy name clarity via comment only (no policy change needed).
-- ─────────────────────────────────────────────────────────────────────────────

COMMENT ON COLUMN public.profiles.latitude IS 'User GPS latitude (WGS84). Mandatory; defaults from assigned region centroid.';
COMMENT ON COLUMN public.profiles.longitude IS 'User GPS longitude (WGS84). Mandatory; defaults from assigned region centroid.';
COMMENT ON COLUMN public.profiles.location_updated_at IS 'Last time latitude/longitude were updated.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Auth bootstrap trigger must satisfy NOT NULL location columns
-- ─────────────────────────────────────────────────────────────────────────────

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
    IF NOT EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = NEW.id
        AND right(regexp_replace(COALESCE(p.phone, ''), '\D', '', 'g'), 10) = v_clean_phone
    ) THEN
      RETURN NEW;
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
    COALESCE(NULLIF(trim(both from NEW.raw_user_meta_data->>'role'), ''), 'volunteer'),
    true,
    v_lat,
    v_lng,
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;
