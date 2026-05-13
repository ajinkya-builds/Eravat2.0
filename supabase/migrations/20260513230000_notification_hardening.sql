-- Notification hardening: notification_type, dedup, indexes, proximity scope,
-- push dispatch config, and updated trigger functions.

-- ── 1. notification_type column ──────────────────────────────────────────────
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS notification_type text NOT NULL DEFAULT 'general';

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_notification_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_notification_type_check
  CHECK (notification_type IN ('general', 'proximity', 'chain_of_command'));

-- Classify legacy rows before deduplication
UPDATE public.notifications
SET notification_type = 'proximity'
WHERE notification_type = 'general'
  AND title ILIKE 'New Activity within your alert radius%';

UPDATE public.notifications
SET notification_type = 'chain_of_command'
WHERE notification_type = 'general'
  AND title IN (
    'Direct Sighting Alert',
    'Indirect Sign Logged',
    'Activity Alert',
    'Conflict Damage Alert'
  );

-- Remove historical duplicates so the unique index can be created
DELETE FROM public.notifications n1
USING public.notifications n2
WHERE n1.id > n2.id
  AND n1.user_id = n2.user_id
  AND n1.report_id IS NOT NULL
  AND n1.report_id = n2.report_id
  AND n1.notification_type = n2.notification_type;

-- Prevent duplicate alerts per user/report/channel
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_user_report_type
  ON public.notifications (user_id, report_id, notification_type)
  WHERE report_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user_created_at
  ON public.notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_report_id
  ON public.notifications (report_id)
  WHERE report_id IS NOT NULL;

-- ── 2. Spatial / query performance indexes ───────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_reports_location
  ON public.reports USING GIST (location);

CREATE INDEX IF NOT EXISTS idx_geo_beats_boundary
  ON public.geo_beats USING GIST (boundary);

CREATE INDEX IF NOT EXISTS idx_user_region_assignments_division
  ON public.user_region_assignments (division_id);

CREATE INDEX IF NOT EXISTS idx_user_region_assignments_range
  ON public.user_region_assignments (range_id);

-- ── 3. Push dispatch config (service_role + SECURITY DEFINER only) ─────────
CREATE TABLE IF NOT EXISTS public.push_dispatch_config (
  key text PRIMARY KEY,
  value text NOT NULL
);

ALTER TABLE public.push_dispatch_config ENABLE ROW LEVEL SECURITY;

-- No authenticated/anon policies: only service_role and SECURITY DEFINER functions.

INSERT INTO public.push_dispatch_config (key, value)
VALUES (
  'send_push_url',
  'https://mnytrlcmdpkfhrzrtesf.supabase.co/functions/v1/send-push'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

CREATE OR REPLACE FUNCTION public.get_push_dispatch_auth_token()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
DECLARE
  token text;
BEGIN
  BEGIN
    SELECT decrypted_secret
    INTO token
    FROM vault.decrypted_secrets
    WHERE name = 'push_dispatch_service_role_key'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    token := NULL;
  END;

  RETURN COALESCE(
    token,
    NULLIF(current_setting('app.settings.service_role_key', true), '')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.send_push_on_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  push_url text;
  auth_token text;
BEGIN
  SELECT value INTO push_url
  FROM public.push_dispatch_config
  WHERE key = 'send_push_url'
  LIMIT 1;

  auth_token := public.get_push_dispatch_auth_token();

  IF push_url IS NULL OR auth_token IS NULL THEN
    RAISE WARNING 'send_push_on_notification skipped: missing push URL or service role token (configure vault secret push_dispatch_service_role_key)';
    RETURN NEW;
  END IF;

  PERFORM extensions.http_post(
    url := push_url,
    body := jsonb_build_object(
      'notification_id', NEW.id,
      'user_id', NEW.user_id,
      'title', NEW.title,
      'message', NEW.message,
      'report_id', NEW.report_id,
      'notification_type', NEW.notification_type
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || auth_token
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'send_push_on_notification failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- ── 4. Proximity notifications (division-scoped + notification_type) ─────────
CREATE OR REPLACE FUNCTION public.notify_proximity_on_report()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  rec RECORD;
  radius_m DOUBLE PRECISION;
  beat_name   text;
  range_name  text;
  div_name    text;
  report_division_id uuid;
  msg_title   text;
  msg_body    text;
BEGIN
  IF NEW.location IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.beat_id IS NOT NULL THEN
    SELECT r.division_id
    INTO report_division_id
    FROM public.geo_beats b
    JOIN public.geo_ranges r ON r.id = b.range_id
    WHERE b.id = NEW.beat_id;
  END IF;

  SELECT
    b.name AS beat_n,
    r.name AS range_n,
    d.name AS div_n
  INTO beat_name, range_name, div_name
  FROM public.reports rp
  LEFT JOIN public.geo_beats b ON b.id = rp.beat_id
  LEFT JOIN public.geo_ranges r ON r.id = b.range_id
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

  FOR rec IN
    SELECT
      ura.user_id,
      p.notification_radius_km,
      COALESCE(gb.centroid, gr.centroid, gd.centroid) AS region_centroid
    FROM public.user_region_assignments ura
    JOIN public.profiles p ON p.id = ura.user_id
    LEFT JOIN public.geo_beats gb ON gb.id = ura.beat_id
    LEFT JOIN public.geo_ranges gr ON gr.id = ura.range_id
    LEFT JOIN public.geo_divisions gd ON gd.id = ura.division_id
    WHERE
      COALESCE(gb.centroid, gr.centroid, gd.centroid) IS NOT NULL
      AND p.is_active = true
      AND ura.user_id IS DISTINCT FROM NEW.user_id
      AND (
        report_division_id IS NULL
        OR ura.division_id = report_division_id
        OR gr.division_id = report_division_id
        OR gb.id IN (
          SELECT gb2.id
          FROM public.geo_beats gb2
          JOIN public.geo_ranges gr2 ON gr2.id = gb2.range_id
          WHERE gr2.division_id = report_division_id
        )
      )
  LOOP
    radius_m := rec.notification_radius_km * 1000.0;

    IF ST_DWithin(
      NEW.location::extensions.geography,
      rec.region_centroid::extensions.geography,
      radius_m
    ) THEN
      INSERT INTO public.notifications (user_id, report_id, title, message, notification_type)
      VALUES (rec.user_id, NEW.id, msg_title, msg_body, 'proximity')
      ON CONFLICT (user_id, report_id, notification_type) WHERE report_id IS NOT NULL
      DO NOTHING;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- ── 5. Chain-of-command notifications (skip conflict_loss on observations) ───
CREATE OR REPLACE FUNCTION public.notify_observation_chain()
RETURNS TRIGGER
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
  signs_list text;
BEGIN
  IF NEW.type::text IN ('conflict_loss', 'loss') THEN
    RETURN NEW;
  END IF;

  SELECT beat_id INTO rep_beat_id FROM public.reports WHERE id = NEW.report_id;
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
      AND (
        (u.range_id = r_id AND p.role = 'range_officer')
        OR (u.division_id = d_id AND p.role = 'dfo')
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
RETURNS TRIGGER
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
BEGIN
  SELECT beat_id INTO rep_beat_id FROM public.reports WHERE id = NEW.report_id;
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
      AND (
        (u.range_id = r_id AND p.role = 'range_officer')
        OR (u.division_id = d_id AND p.role = 'dfo')
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
