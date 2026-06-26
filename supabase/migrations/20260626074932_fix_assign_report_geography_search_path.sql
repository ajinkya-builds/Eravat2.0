-- Fix assign_report_geography() search path to include public and extensions
-- so PostGIS functions and geography types are resolved correctly.
CREATE OR REPLACE FUNCTION public.assign_report_geography()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  matched_beat_id uuid;
  reporter_division_id uuid;
BEGIN
  IF NEW.location IS NOT NULL AND NEW.beat_id IS NULL THEN
    SELECT id INTO matched_beat_id
    FROM public.geo_beats
    WHERE ST_Intersects(boundary, NEW.location)
    LIMIT 1;

    IF matched_beat_id IS NULL THEN
      SELECT ura.division_id
      INTO reporter_division_id
      FROM public.user_region_assignments ura
      WHERE ura.user_id = NEW.user_id
      LIMIT 1;

      SELECT gb.id INTO matched_beat_id
      FROM public.geo_beats gb
      JOIN public.geo_ranges gr ON gr.id = gb.range_id
      WHERE reporter_division_id IS NULL OR gr.division_id = reporter_division_id
      ORDER BY ST_Distance(gb.boundary::geometry, NEW.location::geometry) ASC
      LIMIT 1;
    END IF;

    IF matched_beat_id IS NOT NULL THEN
      NEW.beat_id := matched_beat_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
