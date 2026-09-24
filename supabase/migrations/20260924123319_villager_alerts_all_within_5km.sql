-- Queue every active, opted-in villager inside 5 km.
-- The previous LIMIT 100 was a fan-out guard from the original 2 km SMS queue.
-- It dropped farther villagers even when they were inside the radius.

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
  ON CONFLICT (report_id, villager_id) DO NOTHING;

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
  ON CONFLICT (report_id, villager_id) DO NOTHING;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_villagers_on_report() IS
  'On report insert with GPS: queue villager_alert_events (sms_queued) and villager_call_events (queued) for every match within 5 km.';
