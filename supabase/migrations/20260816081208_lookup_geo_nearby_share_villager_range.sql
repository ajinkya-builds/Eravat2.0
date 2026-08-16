-- Location-based Division/Range/Beat lookup, richer nearby share payload,
-- and range assignment for villagers.

ALTER TABLE public.villagers
  ADD COLUMN IF NOT EXISTS range_id uuid REFERENCES public.geo_ranges (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS villagers_range_id_idx
  ON public.villagers (range_id);

CREATE OR REPLACE FUNCTION public.lookup_geo_from_point(
  p_lng double precision,
  p_lat double precision
)
RETURNS TABLE (
  beat_id uuid,
  beat_name text,
  range_id uuid,
  range_name text,
  division_id uuid,
  division_name text
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
DECLARE
  pt extensions.geography;
BEGIN
  pt := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::extensions.geography;

  RETURN QUERY
  WITH matched AS (
    SELECT b.id
    FROM public.geo_beats b
    WHERE b.boundary IS NOT NULL
      AND ST_Intersects(b.boundary, pt)
    LIMIT 1
  ),
  nearest AS (
    SELECT b.id
    FROM public.geo_beats b
    WHERE b.boundary IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM matched)
    ORDER BY ST_Distance(b.boundary::geometry, pt::geometry) ASC
    LIMIT 1
  ),
  chosen AS (
    SELECT id FROM matched
    UNION ALL
    SELECT id FROM nearest
    LIMIT 1
  )
  SELECT
    b.id,
    b.name,
    r.id,
    r.name,
    d.id,
    d.name
  FROM chosen c
  JOIN public.geo_beats b ON b.id = c.id
  LEFT JOIN public.geo_ranges r ON r.id = b.range_id
  LEFT JOIN public.geo_divisions d ON d.id = r.division_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_geo_from_point(double precision, double precision)
  TO authenticated;

DROP FUNCTION IF EXISTS public.reports_nearby(double precision, double precision, double precision, integer);

CREATE FUNCTION public.reports_nearby(
  p_lng double precision,
  p_lat double precision,
  p_radius_m double precision DEFAULT 50000,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  device_timestamp timestamptz,
  beat_name text,
  range_name text,
  division_name text,
  obs_type text,
  male_count integer,
  female_count integer,
  calf_count integer,
  unknown_count integer,
  compass_bearing numeric,
  indirect_sign_details text[],
  conflict_loss_details text[],
  damage_categories text[],
  damage_description text,
  notes text,
  photo_path text,
  distance_m double precision,
  lng double precision,
  lat double precision
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  SELECT
    r.id,
    r.device_timestamp,
    b.name AS beat_name,
    rg.name AS range_name,
    d.name AS division_name,
    o.type AS obs_type,
    COALESCE(o.male_count, 0) AS male_count,
    COALESCE(o.female_count, 0) AS female_count,
    COALESCE(o.calf_count, 0) AS calf_count,
    COALESCE(o.unknown_count, 0) AS unknown_count,
    o.compass_bearing,
    o.indirect_sign_details,
    o.conflict_loss_details,
    dam.categories AS damage_categories,
    dam.description AS damage_description,
    r.notes,
    media.storage_path AS photo_path,
    ST_Distance(
      r.location,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::extensions.geography
    ) AS distance_m,
    ST_X(r.location::extensions.geometry) AS lng,
    ST_Y(r.location::extensions.geometry) AS lat
  FROM public.reports r
  LEFT JOIN public.geo_beats b ON b.id = r.beat_id
  LEFT JOIN public.geo_ranges rg ON rg.id = b.range_id
  LEFT JOIN public.geo_divisions d ON d.id = rg.division_id
  LEFT JOIN LATERAL (
    SELECT
      obs.type,
      obs.male_count,
      obs.female_count,
      obs.calf_count,
      obs.unknown_count,
      obs.compass_bearing,
      obs.indirect_sign_details,
      obs.conflict_loss_details
    FROM public.observations obs
    WHERE obs.report_id = r.id
    ORDER BY obs.id
    LIMIT 1
  ) o ON true
  LEFT JOIN LATERAL (
    SELECT
      array_agg(cd.category::text) FILTER (WHERE cd.category IS NOT NULL) AS categories,
      string_agg(cd.description, '; ' ORDER BY cd.id) FILTER (WHERE cd.description IS NOT NULL AND cd.description <> '') AS description
    FROM public.conflict_damages cd
    WHERE cd.report_id = r.id
  ) dam ON true
  LEFT JOIN LATERAL (
    SELECT rm.storage_path
    FROM public.report_media rm
    WHERE rm.report_id = r.id
    ORDER BY rm.uploaded_at
    LIMIT 1
  ) media ON true
  WHERE r.location IS NOT NULL
    AND ST_DWithin(
      r.location,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::extensions.geography,
      p_radius_m
    )
  ORDER BY distance_m ASC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
$$;

GRANT EXECUTE ON FUNCTION public.reports_nearby(double precision, double precision, double precision, integer)
  TO authenticated, anon;
