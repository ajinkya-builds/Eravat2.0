-- Staging: restore chain-of-command recipients, queue villager geo alerts,
-- point push dispatch at this project (was still production URL).

UPDATE public.push_dispatch_config
SET value = 'https://ttjtyvxfiqhjdngkgdkf.supabase.co/functions/v1/send-push'
WHERE key = 'send_push_url';

CREATE TABLE IF NOT EXISTS public.villager_alert_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.reports (id) ON DELETE CASCADE,
  villager_id uuid NOT NULL REFERENCES public.villagers (id) ON DELETE CASCADE,
  distance_m double precision,
  channel text NOT NULL DEFAULT 'sms_queued',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT villager_alert_events_channel_check
    CHECK (channel IN ('sms_queued', 'sms_sent', 'sms_skipped')),
  CONSTRAINT villager_alert_events_uniq UNIQUE (report_id, villager_id)
);

CREATE INDEX IF NOT EXISTS villager_alert_events_report_idx
  ON public.villager_alert_events (report_id);

COMMENT ON TABLE public.villager_alert_events IS
  'Intended Hathi Mitra alerts for a report. Staging queues only (SMS gateway off).';

ALTER TABLE public.villager_alert_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "villager_alert_events_select_staff" ON public.villager_alert_events;
CREATE POLICY "villager_alert_events_select_staff"
  ON public.villager_alert_events FOR SELECT TO authenticated
  USING (public.can_read_villagers() OR public.can_manage_villagers());

GRANT SELECT ON public.villager_alert_events TO authenticated;
GRANT ALL ON public.villager_alert_events TO service_role;

CREATE OR REPLACE FUNCTION public.notify_observation_chain()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r_id uuid;
  d_id uuid;
  b_name text;
  r_name text;
  officer_id uuid;
  total_count int;
  msg_title text;
  msg_body text;
  rep_beat_id uuid;
  reporter_id uuid;
  signs_list text;
BEGIN
  IF NEW.type::text IN ('conflict_loss', 'loss') THEN
    RETURN NEW;
  END IF;

  SELECT beat_id, user_id INTO rep_beat_id, reporter_id
  FROM public.reports WHERE id = NEW.report_id;
  IF rep_beat_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT b.name, r.name, r.id, r.division_id
  INTO b_name, r_name, r_id, d_id
  FROM public.geo_beats b
  JOIN public.geo_ranges r ON b.range_id = r.id
  WHERE b.id = rep_beat_id;

  IF NEW.type::text = 'direct_sighting' THEN
    total_count := COALESCE(NEW.male_count, 0) + COALESCE(NEW.female_count, 0)
      + COALESCE(NEW.calf_count, 0) + COALESCE(NEW.unknown_count, 0);
    msg_title := 'Direct Sighting Alert';
    msg_body := total_count || ' elephant(s) recorded in ' || b_name || ' Beat (' || r_name || ' Range).';
  ELSIF NEW.type::text = 'indirect_sign' THEN
    signs_list := array_to_string(NEW.indirect_sign_details, ', ');
    msg_title := 'Indirect Sign Logged';
    msg_body := 'Signs (' || COALESCE(signs_list, 'unspecified type') || ') found in ' || b_name || ' Beat.';
  ELSE
    msg_title := 'Activity Alert';
    msg_body := 'New activity reported in ' || b_name || ' Beat.';
  END IF;

  FOR officer_id IN (
    SELECT u.user_id
    FROM public.user_region_assignments u
    JOIN public.profiles p ON u.user_id = p.id
    WHERE p.is_active = true
      AND u.user_id IS DISTINCT FROM reporter_id
      AND (
        (u.beat_id = rep_beat_id AND p.role = 'beat_guard')
        OR (u.range_id = r_id AND p.role = 'range_officer')
        OR (u.division_id = d_id AND p.role IN ('dfo', 'rrt'))
      )
  ) LOOP
    INSERT INTO public.notifications (user_id, report_id, title, message, notification_type)
    VALUES (officer_id, NEW.report_id, msg_title, msg_body, 'chain_of_command')
    ON CONFLICT (user_id, report_id, notification_type) WHERE report_id IS NOT NULL
    DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_conflict_chain()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r_id uuid;
  d_id uuid;
  b_name text;
  r_name text;
  officer_id uuid;
  msg_title text;
  msg_body text;
  rep_beat_id uuid;
  reporter_id uuid;
BEGIN
  SELECT beat_id, user_id INTO rep_beat_id, reporter_id
  FROM public.reports WHERE id = NEW.report_id;
  IF rep_beat_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT b.name, r.name, r.id, r.division_id
  INTO b_name, r_name, r_id, d_id
  FROM public.geo_beats b
  JOIN public.geo_ranges r ON b.range_id = r.id
  WHERE b.id = rep_beat_id;

  msg_title := 'Conflict Damage Alert';
  msg_body := 'Damage reported: ' || COALESCE(NEW.description, 'unspecified')
    || ' in ' || b_name || ' Beat (' || r_name || ' Range).';

  FOR officer_id IN (
    SELECT u.user_id
    FROM public.user_region_assignments u
    JOIN public.profiles p ON u.user_id = p.id
    WHERE p.is_active = true
      AND u.user_id IS DISTINCT FROM reporter_id
      AND (
        (u.beat_id = rep_beat_id AND p.role = 'beat_guard')
        OR (u.range_id = r_id AND p.role = 'range_officer')
        OR (u.division_id = d_id AND p.role IN ('dfo', 'rrt'))
      )
  ) LOOP
    INSERT INTO public.notifications (user_id, report_id, title, message, notification_type)
    VALUES (officer_id, NEW.report_id, msg_title, msg_body, 'chain_of_command')
    ON CONFLICT (user_id, report_id, notification_type) WHERE report_id IS NOT NULL
    DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_villagers_on_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  report_division_id uuid;
  match_radius_m double precision := 2000;
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
  ORDER BY 3
  LIMIT 100
  ON CONFLICT (report_id, villager_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_villagers_on_report ON public.reports;
CREATE TRIGGER trigger_notify_villagers_on_report
AFTER INSERT ON public.reports
FOR EACH ROW
EXECUTE FUNCTION public.notify_villagers_on_report();
