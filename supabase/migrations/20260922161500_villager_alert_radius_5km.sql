-- Widen Hathi Mitra villager geo-match from 2 km → 5 km.
-- Additive function replace only; safe for 2.1.8 clients.

CREATE OR REPLACE FUNCTION public.notify_villagers_on_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  report_division_id uuid;
  match_radius_m double precision := 5000;
BEGIN
  IF NEW.location IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.beat_id IS NOT NULL THEN
    SELECT r.division_id INTO report_division_id
    FROM public.geo_beats b
    JOIN public.geo_ranges r ON r.id = b.range_id
    WHERE b.id = NEW.beat_id;
  END IF;

  -- Dummy SMS queue (unchanged channel for 2.1.8 / certification)
  INSERT INTO public.villager_alert_events (report_id, villager_id, distance_m, channel)
  SELECT NEW.id,
         v.id,
         ST_Distance(
           NEW.location,
           ST_SetSRID(ST_MakePoint(v.longitude, v.latitude), 4326)::geography
         ),
         'sms_queued'
  FROM public.villagers v
  WHERE v.is_active
    AND v.alert_opt_in
    AND v.latitude IS NOT NULL
    AND v.longitude IS NOT NULL
    AND (
      report_division_id IS NULL
      OR v.division_id IS NULL
      OR v.division_id = report_division_id
    )
    AND ST_DWithin(
      NEW.location,
      ST_SetSRID(ST_MakePoint(v.longitude, v.latitude), 4326)::geography,
      match_radius_m
    )
  ORDER BY 3
  LIMIT 100
  ON CONFLICT (report_id, villager_id) DO NOTHING;

  -- Voice call queue (MSG91 dispatch later)
  INSERT INTO public.villager_call_events (
    report_id,
    villager_id,
    distance_m,
    phone_e164,
    call_status
  )
  SELECT NEW.id,
         v.id,
         ST_Distance(
           NEW.location,
           ST_SetSRID(ST_MakePoint(v.longitude, v.latitude), 4326)::geography
         ),
         v.mobile,
         'queued'
  FROM public.villagers v
  WHERE v.is_active
    AND v.alert_opt_in
    AND v.latitude IS NOT NULL
    AND v.longitude IS NOT NULL
    AND v.mobile IS NOT NULL
    AND (
      report_division_id IS NULL
      OR v.division_id IS NULL
      OR v.division_id = report_division_id
    )
    AND ST_DWithin(
      NEW.location,
      ST_SetSRID(ST_MakePoint(v.longitude, v.latitude), 4326)::geography,
      match_radius_m
    )
  ORDER BY 3
  LIMIT 100
  ON CONFLICT (report_id, villager_id) DO NOTHING;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_villagers_on_report() IS
  'On report insert with GPS: queue villager_alert_events (sms_queued) and villager_call_events (queued) within 5 km.';
