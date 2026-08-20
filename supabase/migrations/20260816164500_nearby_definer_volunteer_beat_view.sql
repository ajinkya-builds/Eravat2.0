-- Nearby sightings must return every report in the radius (not only the
-- caller's territory). SECURITY INVOKER + reports RLS hid other beats, so
-- the nearby slider appeared to work with an empty list.
-- Volunteers (Hathi Mitra) also need beat-scoped map/history reads.

CREATE OR REPLACE FUNCTION public.reports_nearby(
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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  RETURN QUERY
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
END;
$$;

REVOKE ALL ON FUNCTION public.reports_nearby(double precision, double precision, double precision, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reports_nearby(double precision, double precision, double precision, integer)
  TO authenticated;

DROP POLICY IF EXISTS "Volunteer Beat View Access" ON public.reports;
CREATE POLICY "Volunteer Beat View Access" ON public.reports
  FOR SELECT
  USING (
    (SELECT public.get_my_role()) = 'volunteer'
    AND beat_id IN (
      SELECT ura.beat_id
      FROM public.user_region_assignments ura
      WHERE ura.user_id = (SELECT auth.uid())
        AND ura.beat_id IS NOT NULL
    )
  );
