-- 4-hour call cooldown without scanning call history.
-- villagers.last_call_at is set only when a sighting actually queues a dial.
-- The next sighting reads that one column.

ALTER TABLE public.villagers
  ADD COLUMN IF NOT EXISTS last_call_at timestamptz;

COMMENT ON COLUMN public.villagers.last_call_at IS
  'When this villager was last queued for a sighting call. notify_villagers_on_report reads this column only; it does not scan villager_call_events.';

ALTER TABLE public.villager_call_events
  DROP CONSTRAINT IF EXISTS villager_call_events_status_check;

ALTER TABLE public.villager_call_events
  ADD CONSTRAINT villager_call_events_status_check CHECK (
    call_status IN (
      'queued',
      'triggered',
      'ringing',
      'completed',
      'no_answer',
      'busy',
      'cancelled',
      'failed',
      'skipped',
      'recently_alerted'
    )
  );

COMMENT ON COLUMN public.villager_call_events.call_status IS
  'queued|triggered|ringing|completed|no_answer|busy|cancelled|failed|skipped|recently_alerted. recently_alerted = inside 5 km but last_call_at is within 4 hours, so no dial.';

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

  WITH matched AS (
    SELECT
      v.id AS villager_id,
      v.mobile,
      ST_Distance(
        NEW.location,
        ST_SetSRID(ST_MakePoint(v.longitude, v.latitude), 4326)::geography
      ) AS distance_m,
      CASE
        WHEN v.last_call_at IS NOT NULL
         AND v.last_call_at > now() - interval '4 hours'
        THEN 'recently_alerted'
        ELSE 'queued'
      END AS call_status
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
  ),
  inserted AS (
    INSERT INTO public.villager_call_events (
      report_id,
      villager_id,
      distance_m,
      phone_e164,
      call_status
    )
    SELECT NEW.id, m.villager_id, m.distance_m, m.mobile, m.call_status
    FROM matched m
    ON CONFLICT (report_id, villager_id) DO NOTHING
    RETURNING villager_id, call_status
  )
  UPDATE public.villagers v
  SET last_call_at = now()
  FROM inserted i
  WHERE v.id = i.villager_id
    AND i.call_status = 'queued';

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_villagers_on_report() IS
  'On report insert with GPS: SMS-queue every match within 5 km. Queue a call unless villagers.last_call_at is within 4 hours; those rows are recently_alerted and are not dialed.';

-- Seed the pointer from calls already queued, so today's sightings start the 4-hour window.
UPDATE public.villagers v
SET last_call_at = s.last_at
FROM (
  SELECT villager_id, max(created_at) AS last_at
  FROM public.villager_call_events
  WHERE call_status IN ('queued', 'triggered', 'ringing', 'completed', 'no_answer', 'busy')
  GROUP BY villager_id
) s
WHERE v.id = s.villager_id
  AND v.last_call_at IS NULL;
