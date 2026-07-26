-- Territory-scoped report reads, auth hardening, division-scoped beat fallback.

-- ══════════════════════════════════════════════════════════════════════
-- 1. Shared report visibility helper
-- ══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.can_read_report(p_report_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.reports rep
    LEFT JOIN public.geo_beats gb ON gb.id = rep.beat_id
    LEFT JOIN public.geo_ranges gr ON gr.id = gb.range_id
    LEFT JOIN public.user_region_assignments ura ON ura.user_id = auth.uid()
    WHERE rep.id = p_report_id
      AND (
        rep.user_id = auth.uid()
        OR public.get_my_role() IN ('admin', 'ccf', 'dfo')
        OR (
          public.get_my_role() = 'range_officer'
          AND rep.beat_id IS NOT NULL
          AND ura.range_id IS NOT NULL
          AND gb.range_id = ura.range_id
        )
        OR (
          public.get_my_role() = 'beat_guard'
          AND rep.beat_id IS NOT NULL
          AND ura.beat_id IS NOT NULL
          AND rep.beat_id = ura.beat_id
        )
        OR (
          public.get_my_role() IN ('biologist', 'veterinarian', 'rrt')
          AND rep.beat_id IS NOT NULL
          AND ura.division_id IS NOT NULL
          AND gr.division_id = ura.division_id
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_read_report(uuid) TO authenticated;

-- Reports: territory leadership can read scoped activity
DROP POLICY IF EXISTS "Territory scoped read reports" ON public.reports;
CREATE POLICY "Territory scoped read reports"
  ON public.reports FOR SELECT
  USING (public.can_read_report(id));

-- Observations
DROP POLICY IF EXISTS "Territory scoped read observations" ON public.observations;
CREATE POLICY "Territory scoped read observations"
  ON public.observations FOR SELECT
  USING (public.can_read_report(report_id));

-- Conflict damages
DROP POLICY IF EXISTS "Territory scoped read conflict damages" ON public.conflict_damages;
CREATE POLICY "Territory scoped read conflict damages"
  ON public.conflict_damages FOR SELECT
  USING (public.can_read_report(report_id));

-- Report media
DROP POLICY IF EXISTS "Territory scoped read report media" ON public.report_media;
CREATE POLICY "Territory scoped read report media"
  ON public.report_media FOR SELECT
  USING (public.can_read_report(report_id));

-- ══════════════════════════════════════════════════════════════════════
-- 2. OTP / ghost-user hardening
-- ══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.validate_phone_for_otp(p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_phone text;
  v_user_id uuid;
  v_is_active boolean;
BEGIN
  v_clean_phone := regexp_replace(p_phone, '\D', '', 'g');
  IF length(v_clean_phone) > 10 THEN
    v_clean_phone := right(v_clean_phone, 10);
  END IF;

  SELECT p.id, p.is_active
  INTO v_user_id, v_is_active
  FROM public.profiles p
  WHERE right(regexp_replace(COALESCE(p.phone, ''), '\D', '', 'g'), 10) = v_clean_phone
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'valid', true,
      'message', 'If this phone number is registered, you will receive an OTP'
    );
  ELSIF NOT v_is_active THEN
    RETURN jsonb_build_object(
      'valid', false,
      'message', 'This account has been deactivated. Please contact your administrator.'
    );
  ELSE
    RETURN jsonb_build_object(
      'valid', true,
      'message', 'If this phone number is registered, you will receive an OTP'
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_phone text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Phone OTP signups must match an admin-provisioned profile phone on the same auth user id.
  IF NEW.phone IS NOT NULL THEN
    v_clean_phone := right(regexp_replace(NEW.phone, '\D', '', 'g'), 10);
    IF NOT EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = NEW.id
        AND right(regexp_replace(COALESCE(p.phone, ''), '\D', '', 'g'), 10) = v_clean_phone
    ) THEN
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.profiles (id, first_name, last_name, role, is_active)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(trim(both from NEW.raw_user_meta_data->>'first_name'), ''),
      split_part(COALESCE(NEW.email, 'user'), '@', 1),
      'User'
    ),
    COALESCE(NULLIF(trim(both from NEW.raw_user_meta_data->>'last_name'), ''), ''),
    COALESCE(NULLIF(trim(both from NEW.raw_user_meta_data->>'role'), ''), 'volunteer'),
    true
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 3. Division-scoped nearest-beat fallback
-- ══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.assign_report_geography()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  matched_beat_id uuid;
  reporter_division_id uuid;
BEGIN
  IF NEW.location IS NOT NULL AND NEW.beat_id IS NULL THEN
    SELECT id INTO matched_beat_id
    FROM public.geo_beats
    WHERE ST_Intersects(boundary, NEW.location)
    LIMIT 1;

    IF matched_beat_id IS NULL THEN
      SELECT ura.division_id
      INTO reporter_division_id
      FROM public.user_region_assignments ura
      WHERE ura.user_id = NEW.user_id
      LIMIT 1;

      SELECT gb.id INTO matched_beat_id
      FROM public.geo_beats gb
      JOIN public.geo_ranges gr ON gr.id = gb.range_id
      WHERE reporter_division_id IS NULL OR gr.division_id = reporter_division_id
      ORDER BY ST_Distance(gb.boundary::geometry, NEW.location::geometry) ASC
      LIMIT 1;
    END IF;

    IF matched_beat_id IS NOT NULL THEN
      NEW.beat_id := matched_beat_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
