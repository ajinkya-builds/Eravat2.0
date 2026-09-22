-- Role-gated proximity alert radius (profile GPS, not live location).
-- Geo staff (beat_guard / range_officer / dfo / rrt) keep chain-of-command
-- territory alerts. Region-agnostic roles use ST_DWithin vs profiles lat/lng
-- when receives_radius_alerts is enabled. Seed: admin only.

-- ---------------------------------------------------------------------------
-- role_alert_radius_config
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.role_alert_radius_config (
  role public.user_role PRIMARY KEY,
  can_configure_radius boolean NOT NULL DEFAULT false,
  receives_radius_alerts boolean NOT NULL DEFAULT false
);

COMMENT ON TABLE public.role_alert_radius_config IS
  'Which roles may set notification_radius_km in App Settings and receive profile-GPS proximity alerts.';
COMMENT ON COLUMN public.role_alert_radius_config.can_configure_radius IS
  'When true, App Settings shows the personal alert-radius control.';
COMMENT ON COLUMN public.role_alert_radius_config.receives_radius_alerts IS
  'When true, notify_proximity_on_report matches reports to profiles.latitude/longitude.';

INSERT INTO public.role_alert_radius_config (role, can_configure_radius, receives_radius_alerts)
VALUES
  ('admin', true, true),
  ('ccf', false, false),
  ('biologist', false, false),
  ('veterinarian', false, false),
  ('dfo', false, false),
  ('rrt', false, false),
  ('range_officer', false, false),
  ('beat_guard', false, false),
  ('volunteer', false, false)
ON CONFLICT (role) DO UPDATE
SET
  can_configure_radius = EXCLUDED.can_configure_radius,
  receives_radius_alerts = EXCLUDED.receives_radius_alerts;

ALTER TABLE public.role_alert_radius_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "role_alert_radius_config_select" ON public.role_alert_radius_config;
CREATE POLICY "role_alert_radius_config_select"
  ON public.role_alert_radius_config FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "role_alert_radius_config_update_admin" ON public.role_alert_radius_config;
CREATE POLICY "role_alert_radius_config_update_admin"
  ON public.role_alert_radius_config FOR UPDATE TO authenticated
  USING (public.get_my_role() = ANY (ARRAY['admin'::text, 'ccf'::text]))
  WITH CHECK (public.get_my_role() = ANY (ARRAY['admin'::text, 'ccf'::text]));

GRANT SELECT ON public.role_alert_radius_config TO authenticated;
GRANT SELECT, UPDATE ON public.role_alert_radius_config TO service_role;

-- ---------------------------------------------------------------------------
-- RPC: can current user configure alert radius?
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_configure_alert_radius()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT c.can_configure_radius
      FROM public.profiles p
      JOIN public.role_alert_radius_config c ON c.role = p.role
      WHERE p.id = auth.uid()
    ),
    false
  );
$$;

COMMENT ON FUNCTION public.can_configure_alert_radius() IS
  'True when the authenticated user''s role may edit notification_radius_km in App Settings.';

GRANT EXECUTE ON FUNCTION public.can_configure_alert_radius() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_configure_alert_radius() TO service_role;

-- ---------------------------------------------------------------------------
-- Proximity: profile GPS + role_alert_radius_config (not region centroids)
-- ---------------------------------------------------------------------------
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
  msg_title   text;
  msg_body    text;
BEGIN
  IF NEW.location IS NULL THEN
    RETURN NEW;
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
      'A new field report was filed near your saved location.'
  END;

  FOR rec IN
    SELECT
      p.id AS user_id,
      p.notification_radius_km,
      p.latitude,
      p.longitude
    FROM public.profiles p
    JOIN public.role_alert_radius_config c ON c.role = p.role
    WHERE
      c.receives_radius_alerts = true
      AND p.is_active = true
      AND p.latitude IS NOT NULL
      AND p.longitude IS NOT NULL
      AND p.id IS DISTINCT FROM NEW.user_id
  LOOP
    radius_m := rec.notification_radius_km * 1000.0;

    IF ST_DWithin(
      NEW.location::extensions.geography,
      ST_SetSRID(ST_MakePoint(rec.longitude, rec.latitude), 4326)::extensions.geography,
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

COMMENT ON FUNCTION public.notify_proximity_on_report() IS
  'Proximity alerts for roles with receives_radius_alerts, measured from profiles.latitude/longitude.';
