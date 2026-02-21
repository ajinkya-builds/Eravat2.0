-- ==============================================================================
-- ERAVAT 2.0 - Phase 2: Spatial Auto-Association Trigger
-- ==============================================================================
-- Description:
-- Automatically assigns a `beat_id` to a new report if the report's `location`
-- (PostGIS POINT) falls within a `geo_beat`'s `boundary` (PostGIS POLYGON).
--
-- Usage:
-- Paste this entire script into the Supabase SQL Editor and hit "RUN".
-- ==============================================================================

-- 1. Create the Trigger Function
CREATE OR REPLACE FUNCTION public.assign_report_geography()
RETURNS TRIGGER AS $$
DECLARE
  matched_beat_id uuid;
BEGIN
  -- Only attempt assignment if a location exists and a beat hasn't been manually assigned
  IF NEW.location IS NOT NULL AND NEW.beat_id IS NULL THEN
    
    -- Find the first Beat boundary that intersects/contains the report's POINT location
    SELECT id INTO matched_beat_id
    FROM public.geo_beats
    WHERE ST_Intersects(boundary, NEW.location)
    LIMIT 1;
    
    -- If a matching beat is found, assign it to the new report row before insertion
    IF matched_beat_id IS NOT NULL THEN
      NEW.beat_id := matched_beat_id;
    END IF;
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Drop the trigger if it already exists (to allow safe re-running of this script)
DROP TRIGGER IF EXISTS trigger_assign_report_geography ON public.reports;

-- 3. Attach the Trigger to the `reports` table
CREATE TRIGGER trigger_assign_report_geography
BEFORE INSERT ON public.reports
FOR EACH ROW
EXECUTE FUNCTION public.assign_report_geography();
