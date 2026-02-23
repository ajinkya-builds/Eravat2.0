-- ==============================================================================
-- ERAVAT 2.0 — Proximity-Based Notifications
-- Migration: 20260223090000_proximity_notifications.sql
-- ==============================================================================
-- PHASE 1: Schema Updates
--   1a. Add `centroid` column to geo_divisions, geo_ranges, geo_beats
--   1b. Backfill centroids from existing `boundary` polygons
--   1c. Add `notification_radius_km` to profiles (default 10 km)
--
-- PHASE 2: Proximity Trigger
--   2a. PostgreSQL function that fires AFTER INSERT on `reports`
--   2b. Scans all active users → finds their assigned region centroid
--   2c. Uses ST_DWithin to check distance ≤ notification_radius_km * 1000 m
--   2d. Inserts a notification row for every user within the radius
-- ==============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 1A: Add centroid columns
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.geo_divisions
  ADD COLUMN IF NOT EXISTS centroid GEOGRAPHY(POINT, 4326);

ALTER TABLE public.geo_ranges
  ADD COLUMN IF NOT EXISTS centroid GEOGRAPHY(POINT, 4326);

ALTER TABLE public.geo_beats
  ADD COLUMN IF NOT EXISTS centroid GEOGRAPHY(POINT, 4326);


-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 1B: Backfill centroids from existing boundary polygons
-- ─────────────────────────────────────────────────────────────────────────────
-- ST_Centroid requires a geometry; we cast boundary (geography→geometry),
-- compute the centroid, then cast back to geography for storage.

UPDATE public.geo_divisions
SET centroid = ST_Centroid(boundary::geometry)::geography
WHERE boundary IS NOT NULL;

UPDATE public.geo_ranges
SET centroid = ST_Centroid(boundary::geometry)::geography
WHERE boundary IS NOT NULL;

UPDATE public.geo_beats
SET centroid = ST_Centroid(boundary::geometry)::geography
WHERE boundary IS NOT NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 1C: Add notification_radius_km to profiles
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_radius_km integer NOT NULL DEFAULT 10;

-- Enforce sensible bounds (1–500 km)
ALTER TABLE public.profiles
  ADD CONSTRAINT chk_notification_radius_km
  CHECK (notification_radius_km BETWEEN 1 AND 500);


-- ─────────────────────────────────────────────────────────────────────────────
-- Optional: indexes for centroid proximity queries
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_geo_divisions_centroid ON public.geo_divisions USING GIST (centroid);
CREATE INDEX IF NOT EXISTS idx_geo_ranges_centroid    ON public.geo_ranges    USING GIST (centroid);
CREATE INDEX IF NOT EXISTS idx_geo_beats_centroid     ON public.geo_beats     USING GIST (centroid);


-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 2: Proximity Notification Trigger
-- ─────────────────────────────────────────────────────────────────────────────
-- This trigger fires AFTER INSERT on `reports`.
-- It iterates every user who has an active region assignment and checks whether
-- the new report's location is within that user's configured alert radius
-- (measured from the centroid of their assigned region).
--
-- Priority order for region centroid lookup:
--   Beat (most specific) → Range → Division (most general)
-- If a user is assigned to multiple levels (beat + range + division), the
-- most specific level (beat centroid) is used for the proximity check.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_proximity_on_report()
RETURNS TRIGGER AS $$
DECLARE
  rec RECORD;
  region_centroid GEOGRAPHY;
  radius_m DOUBLE PRECISION;
  beat_name   text;
  range_name  text;
  div_name    text;
  msg_title   text;
  msg_body    text;
BEGIN
  -- Nothing to do if the new report has no location
  IF NEW.location IS NULL THEN
    RETURN NEW;
  END IF;

  -- ── Build a friendly place name for the notification message ──────────────
  -- These may remain NULL if the report hasn't been geo-assigned yet; that's OK.
  SELECT
    b.name  AS beat_n,
    r.name  AS range_n,
    d.name  AS div_n
  INTO beat_name, range_name, div_name
  FROM public.reports rp
  LEFT JOIN public.geo_beats     b ON b.id = rp.beat_id
  LEFT JOIN public.geo_ranges    r ON r.id = b.range_id
  LEFT JOIN public.geo_divisions d ON d.id = r.division_id
  WHERE rp.id = NEW.id;

  msg_title := 'New Activity within your alert radius!';
  msg_body  := CASE
    WHEN beat_name IS NOT NULL
      THEN 'A report was filed near ' || beat_name || ' Beat (' || COALESCE(range_name, '?') || ' Range).'
    WHEN range_name IS NOT NULL
      THEN 'A report was filed near ' || range_name || ' Range.'
    WHEN div_name IS NOT NULL
      THEN 'A report was filed near ' || div_name || ' Division.'
    ELSE
      'A new field report was filed near your assigned area.'
  END;

  -- ── Iterate over every user who has a region assignment ──────────────────
  FOR rec IN
    SELECT
      ura.user_id,
      p.notification_radius_km,
      -- Pick the most specific available centroid: beat > range > division
      COALESCE(
        gb.centroid,
        gr.centroid,
        gd.centroid
      ) AS region_centroid
    FROM public.user_region_assignments ura
    JOIN public.profiles p
      ON p.id = ura.user_id
    LEFT JOIN public.geo_beats     gb ON gb.id  = ura.beat_id
    LEFT JOIN public.geo_ranges    gr ON gr.id  = ura.range_id
    LEFT JOIN public.geo_divisions gd ON gd.id  = ura.division_id
    WHERE
      -- Only consider users who actually have a centroid to compare against
      COALESCE(gb.centroid, gr.centroid, gd.centroid) IS NOT NULL
  LOOP
    radius_m := rec.notification_radius_km * 1000.0;

    -- ST_DWithin on geography columns uses metres as the distance unit
    IF ST_DWithin(
         NEW.location::geography,
         rec.region_centroid::geography,
         radius_m
      )
    THEN
      INSERT INTO public.notifications (user_id, report_id, title, message)
      VALUES (rec.user_id, NEW.id, msg_title, msg_body);
    END IF;

  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Drop old trigger if re-running this migration
DROP TRIGGER IF EXISTS trigger_notify_proximity_on_report ON public.reports;

-- Attach: fires AFTER INSERT so we can reference the fully-committed row
CREATE TRIGGER trigger_notify_proximity_on_report
AFTER INSERT ON public.reports
FOR EACH ROW
EXECUTE FUNCTION public.notify_proximity_on_report();
