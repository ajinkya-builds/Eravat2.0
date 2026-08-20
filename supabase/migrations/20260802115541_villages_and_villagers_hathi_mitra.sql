-- Hathi Mitra (villagers) registry — alert recipients only (no auth.users link).
-- Staging-first: apply on ttjtyvxfiqhjdngkgdkf; do not promote to prod until sign-off.

-- ---------------------------------------------------------------------------
-- villages metadata (autocomplete + user-created names)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.villages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_normalized text GENERATED ALWAYS AS (lower(trim(name))) STORED,
  division_id uuid REFERENCES public.geo_divisions (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT villages_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS villages_name_division_uniq
  ON public.villages (name_normalized, division_id) NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS villages_name_normalized_idx
  ON public.villages (name_normalized);

CREATE INDEX IF NOT EXISTS villages_division_id_idx
  ON public.villages (division_id);

COMMENT ON TABLE public.villages IS
  'Village metadata for Hathi Mitra onboarding autocomplete; new names are upserted here.';

-- ---------------------------------------------------------------------------
-- villagers (Hathi Mitra) — no auth profile
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.villagers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  mobile text NOT NULL,
  latitude double precision,
  longitude double precision,
  village_id uuid NOT NULL REFERENCES public.villages (id) ON DELETE RESTRICT,
  division_id uuid REFERENCES public.geo_divisions (id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  alert_opt_in boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT villagers_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT villagers_mobile_e164 CHECK (mobile ~ '^\+[1-9][0-9]{7,14}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS villagers_mobile_uniq
  ON public.villagers (mobile);

CREATE INDEX IF NOT EXISTS villagers_village_id_idx
  ON public.villagers (village_id);

CREATE INDEX IF NOT EXISTS villagers_division_id_idx
  ON public.villagers (division_id);

CREATE INDEX IF NOT EXISTS villagers_created_by_idx
  ON public.villagers (created_by);

CREATE INDEX IF NOT EXISTS villagers_name_lower_idx
  ON public.villagers (lower(name));

COMMENT ON TABLE public.villagers IS
  'Hathi Mitra / villager alert recipients. Not auth users; cannot log in.';
COMMENT ON COLUMN public.villagers.alert_opt_in IS
  'Future SMS/voice alert matrix; default opted-in for proximity recipients.';
COMMENT ON COLUMN public.villagers.created_by IS
  'Optional profile id of the field user who onboarded this villager.';

-- ---------------------------------------------------------------------------
-- updated_at trigger (reuse pattern from other tables if present)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS villages_set_updated_at ON public.villages;
CREATE TRIGGER villages_set_updated_at
  BEFORE UPDATE ON public.villages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS villagers_set_updated_at ON public.villagers;
CREATE TRIGGER villagers_set_updated_at
  BEFORE UPDATE ON public.villagers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Role helpers (SECURITY INVOKER — uses caller's JWT via get_my_role)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_manage_villagers()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.get_my_role() = ANY (
      ARRAY['admin'::text, 'ccf'::text, 'dfo'::text, 'range_officer'::text, 'beat_guard'::text]
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.can_read_villagers()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.get_my_role() = ANY (
      ARRAY[
        'admin'::text, 'ccf'::text, 'dfo'::text, 'range_officer'::text,
        'beat_guard'::text, 'rrt'::text, 'biologist'::text, 'veterinarian'::text
      ]
    ),
    false
  );
$$;

-- Upsert village by name (+ optional division). Callable by onboard roles.
CREATE OR REPLACE FUNCTION public.ensure_village(
  p_name text,
  p_division_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_trim text := trim(p_name);
  v_norm text := lower(trim(p_name));
  v_id uuid;
BEGIN
  IF NOT public.can_manage_villagers() THEN
    RAISE EXCEPTION 'not authorized to manage villages'
      USING ERRCODE = '42501';
  END IF;

  IF v_trim IS NULL OR v_trim = '' THEN
    RAISE EXCEPTION 'village name is required';
  END IF;

  SELECT v.id INTO v_id
  FROM public.villages v
  WHERE v.name_normalized = v_norm
    AND v.division_id IS NOT DISTINCT FROM p_division_id
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  BEGIN
    INSERT INTO public.villages (name, division_id)
    VALUES (v_trim, p_division_id)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT v.id INTO v_id
    FROM public.villages v
    WHERE v.name_normalized = v_norm
      AND v.division_id IS NOT DISTINCT FROM p_division_id
    LIMIT 1;
  END;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.ensure_village(text, uuid) IS
  'Find or create a villages row for Hathi Mitra onboarding autocomplete.';

GRANT EXECUTE ON FUNCTION public.can_manage_villagers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_villagers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_village(text, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.villages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.villagers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "villages_select_staff" ON public.villages;
CREATE POLICY "villages_select_staff"
  ON public.villages FOR SELECT TO authenticated
  USING (public.can_read_villagers() OR public.can_manage_villagers());

DROP POLICY IF EXISTS "villages_insert_managers" ON public.villages;
CREATE POLICY "villages_insert_managers"
  ON public.villages FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_villagers());

DROP POLICY IF EXISTS "villages_update_managers" ON public.villages;
CREATE POLICY "villages_update_managers"
  ON public.villages FOR UPDATE TO authenticated
  USING (public.can_manage_villagers())
  WITH CHECK (public.can_manage_villagers());

DROP POLICY IF EXISTS "villages_delete_leadership" ON public.villages;
CREATE POLICY "villages_delete_leadership"
  ON public.villages FOR DELETE TO authenticated
  USING (public.get_my_role() = ANY (ARRAY['admin'::text, 'ccf'::text, 'dfo'::text]));

DROP POLICY IF EXISTS "villagers_select_staff" ON public.villagers;
CREATE POLICY "villagers_select_staff"
  ON public.villagers FOR SELECT TO authenticated
  USING (public.can_read_villagers());

DROP POLICY IF EXISTS "villagers_insert_managers" ON public.villagers;
CREATE POLICY "villagers_insert_managers"
  ON public.villagers FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_villagers());

DROP POLICY IF EXISTS "villagers_update_managers" ON public.villagers;
CREATE POLICY "villagers_update_managers"
  ON public.villagers FOR UPDATE TO authenticated
  USING (public.can_manage_villagers())
  WITH CHECK (public.can_manage_villagers());

DROP POLICY IF EXISTS "villagers_delete_leadership" ON public.villagers;
CREATE POLICY "villagers_delete_leadership"
  ON public.villagers FOR DELETE TO authenticated
  USING (public.get_my_role() = ANY (ARRAY['admin'::text, 'ccf'::text, 'dfo'::text]));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.villages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.villagers TO authenticated;
GRANT ALL ON public.villages TO service_role;
GRANT ALL ON public.villagers TO service_role;
