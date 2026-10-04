-- Who may add a Hathi Mitra (volunteer login) or a villager (alert recipient).
-- Seed matches the previous hardcoded allow-lists. Only role admin may change rows.
-- Existing volunteer profiles are not backfilled: created_by stays null.

-- ---------------------------------------------------------------------------
-- role_onboarding_config
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.role_onboarding_config (
  role public.user_role PRIMARY KEY,
  can_add_hathi_mitra boolean NOT NULL DEFAULT false,
  can_add_villager boolean NOT NULL DEFAULT false
);

COMMENT ON TABLE public.role_onboarding_config IS
  'Which roles may onboard a Hathi Mitra (profiles.role = volunteer) or a villager. Edited by admin only.';
COMMENT ON COLUMN public.role_onboarding_config.can_add_hathi_mitra IS
  'When true, this role may call create-user for role volunteer.';
COMMENT ON COLUMN public.role_onboarding_config.can_add_villager IS
  'When true, this role may insert villagers. Personal lists still follow created_by after this is turned off.';

INSERT INTO public.role_onboarding_config (role, can_add_hathi_mitra, can_add_villager)
VALUES
  ('admin', true, true),
  ('ccf', true, true),
  ('biologist', false, false),
  ('veterinarian', false, false),
  ('dfo', true, true),
  ('rrt', false, false),
  ('range_officer', true, true),
  ('beat_guard', true, true),
  ('volunteer', false, false)
ON CONFLICT (role) DO NOTHING;

ALTER TABLE public.role_onboarding_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "role_onboarding_config_select" ON public.role_onboarding_config;
CREATE POLICY "role_onboarding_config_select"
  ON public.role_onboarding_config
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "role_onboarding_config_update_admin" ON public.role_onboarding_config;
CREATE POLICY "role_onboarding_config_update_admin"
  ON public.role_onboarding_config
  FOR UPDATE
  TO authenticated
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

GRANT SELECT, UPDATE ON public.role_onboarding_config TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_onboarding_config TO service_role;

-- ---------------------------------------------------------------------------
-- Villager create permission follows the config. Read and lead stay fixed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_manage_villagers()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT c.can_add_villager
      FROM public.role_onboarding_config c
      WHERE c.role::text = public.get_my_role()
    ),
    false
  );
$$;

COMMENT ON FUNCTION public.can_manage_villagers() IS
  'True when the caller role has role_onboarding_config.can_add_villager. Does not control read or leadership edit.';

-- Creators can read villagers they registered even if their role is outside can_read_villagers.
DROP POLICY IF EXISTS "villagers_select_creator" ON public.villagers;
CREATE POLICY "villagers_select_creator"
  ON public.villagers
  FOR SELECT
  TO authenticated
  USING (created_by = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- Who onboarded a login account (Hathi Mitra personal lists).
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.profiles.created_by IS
  'User who onboarded this account. Set by create-user for Hathi Mitra. Null on accounts created before this column. Personal lists use created_by = auth.uid().';

CREATE INDEX IF NOT EXISTS profiles_created_by_idx
  ON public.profiles (created_by);

CREATE OR REPLACE FUNCTION public.protect_profile_created_by()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.created_by IS DISTINCT FROM OLD.created_by
     AND COALESCE(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    NEW.created_by := OLD.created_by;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_created_by ON public.profiles;
CREATE TRIGGER profiles_protect_created_by
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_created_by();

DROP POLICY IF EXISTS "Users can read volunteers they onboarded" ON public.profiles;
CREATE POLICY "Users can read volunteers they onboarded"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    AND role = 'volunteer'::public.user_role
  );
