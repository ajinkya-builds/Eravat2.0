-- Keep existing behavior: assign containing beat when point lies in a boundary.
-- Fallback: if no containing beat exists, assign the beat with the nearest boundary.
CREATE OR REPLACE FUNCTION public.assign_report_geography()
RETURNS TRIGGER AS $$
DECLARE
  matched_beat_id uuid;
BEGIN
  -- Only attempt assignment if a location exists and a beat hasn't been manually assigned
  IF NEW.location IS NOT NULL AND NEW.beat_id IS NULL THEN
    -- Primary: beat boundary containing/intersecting this point
    SELECT id INTO matched_beat_id
    FROM public.geo_beats
    WHERE ST_Intersects(boundary, NEW.location)
    LIMIT 1;

    -- Fallback: nearest beat boundary by euclidean distance in lon/lat space
    IF matched_beat_id IS NULL THEN
      SELECT id INTO matched_beat_id
      FROM public.geo_beats
      ORDER BY ST_Distance(boundary::geometry, NEW.location::geometry) ASC
      LIMIT 1;
    END IF;

    IF matched_beat_id IS NOT NULL THEN
      NEW.beat_id := matched_beat_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
