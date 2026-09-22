-- Configurable alert-radius bounds (default 10–200 km).
-- Change later with:
--   UPDATE public.alert_radius_bounds SET min_km = …, max_km = … WHERE id = 1;
-- App fetches via get_alert_radius_bounds(); profiles are validated by trigger.

CREATE TABLE IF NOT EXISTS public.alert_radius_bounds (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  min_km integer NOT NULL DEFAULT 10,
  max_km integer NOT NULL DEFAULT 200,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT alert_radius_bounds_range_ok CHECK (min_km >= 1 AND max_km > min_km AND max_km <= 1000)
);

COMMENT ON TABLE public.alert_radius_bounds IS
  'Singleton: allowed notification_radius_km range. Update row id=1 to change bounds without redeploy.';

INSERT INTO public.alert_radius_bounds (id, min_km, max_km)
VALUES (1, 10, 200)
ON CONFLICT (id) DO UPDATE
SET min_km = EXCLUDED.min_km,
    max_km = EXCLUDED.max_km,
    updated_at = now();

ALTER TABLE public.alert_radius_bounds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "alert_radius_bounds_select" ON public.alert_radius_bounds;
CREATE POLICY "alert_radius_bounds_select"
  ON public.alert_radius_bounds FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "alert_radius_bounds_update_admin" ON public.alert_radius_bounds;
CREATE POLICY "alert_radius_bounds_update_admin"
  ON public.alert_radius_bounds FOR UPDATE TO authenticated
  USING (public.get_my_role() = ANY (ARRAY['admin'::text, 'ccf'::text]))
  WITH CHECK (public.get_my_role() = ANY (ARRAY['admin'::text, 'ccf'::text]));

GRANT SELECT ON public.alert_radius_bounds TO authenticated;
GRANT SELECT, UPDATE ON public.alert_radius_bounds TO service_role;

-- Clamp existing profile radii into the new window before tightening validation.
UPDATE public.profiles p
SET notification_radius_km = GREATEST(
  (SELECT min_km FROM public.alert_radius_bounds WHERE id = 1),
  LEAST(
    p.notification_radius_km,
    (SELECT max_km FROM public.alert_radius_bounds WHERE id = 1)
  )
);

-- Replace static CHECK with trigger against alert_radius_bounds (flexible).
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS chk_notification_radius_km;

CREATE OR REPLACE FUNCTION public.enforce_notification_radius_bounds()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_min integer;
  v_max integer;
BEGIN
  SELECT min_km, max_km INTO v_min, v_max
  FROM public.alert_radius_bounds
  WHERE id = 1;

  IF v_min IS NULL OR v_max IS NULL THEN
    RAISE EXCEPTION 'alert_radius_bounds row missing';
  END IF;

  IF NEW.notification_radius_km IS NULL
     OR NEW.notification_radius_km < v_min
     OR NEW.notification_radius_km > v_max THEN
    RAISE EXCEPTION 'notification_radius_km must be between % and % km', v_min, v_max
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_notification_radius_bounds ON public.profiles;
CREATE TRIGGER trg_enforce_notification_radius_bounds
  BEFORE INSERT OR UPDATE OF notification_radius_km ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_notification_radius_bounds();

CREATE OR REPLACE FUNCTION public.get_alert_radius_bounds()
RETURNS TABLE (min_km integer, max_km integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.min_km, b.max_km
  FROM public.alert_radius_bounds b
  WHERE b.id = 1;
$$;

COMMENT ON FUNCTION public.get_alert_radius_bounds() IS
  'Returns current min/max km for personal alert radius (slider + validation).';

GRANT EXECUTE ON FUNCTION public.get_alert_radius_bounds() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_alert_radius_bounds() TO service_role;
