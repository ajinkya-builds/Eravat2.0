-- Staging performance: hot-path indexes + nearby RPC for map/nearby flows.
-- Safe to apply on staging; do not push to prod without explicit ask.

-- FK / join indexes used by nested report selects and geo cascades
CREATE INDEX IF NOT EXISTS idx_observations_report_id
  ON public.observations (report_id);

CREATE INDEX IF NOT EXISTS idx_conflict_damages_report_id
  ON public.conflict_damages (report_id);

CREATE INDEX IF NOT EXISTS idx_report_media_report_id
  ON public.report_media (report_id);

CREATE INDEX IF NOT EXISTS idx_geo_beats_range_id
  ON public.geo_beats (range_id);

CREATE INDEX IF NOT EXISTS idx_geo_ranges_division_id
  ON public.geo_ranges (division_id);

-- Time-ordered list / map pin queries
CREATE INDEX IF NOT EXISTS idx_reports_device_timestamp
  ON public.reports (device_timestamp DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_reports_beat_device_timestamp
  ON public.reports (beat_id, device_timestamp DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_reports_server_created_at
  ON public.reports (server_created_at DESC NULLS LAST);

-- Villager list search within a division (Hathi Mitra)
CREATE INDEX IF NOT EXISTS idx_villagers_division_name_lower
  ON public.villagers (division_id, lower(name));

-- Server-side nearby filter (PostGIS). Types live in extensions schema.
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
  obs_type text,
  male_count integer,
  female_count integer,
  calf_count integer,
  unknown_count integer,
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
    o.type AS obs_type,
    COALESCE(o.male_count, 0) AS male_count,
    COALESCE(o.female_count, 0) AS female_count,
    COALESCE(o.calf_count, 0) AS calf_count,
    COALESCE(o.unknown_count, 0) AS unknown_count,
    ST_Distance(
      r.location,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::extensions.geography
    ) AS distance_m,
    ST_X(r.location::extensions.geometry) AS lng,
    ST_Y(r.location::extensions.geometry) AS lat
  FROM public.reports r
  LEFT JOIN public.geo_beats b ON b.id = r.beat_id
  LEFT JOIN LATERAL (
    SELECT obs.type, obs.male_count, obs.female_count, obs.calf_count, obs.unknown_count
    FROM public.observations obs
    WHERE obs.report_id = r.id
    ORDER BY obs.id
    LIMIT 1
  ) o ON true
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
