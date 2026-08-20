-- Field onboarders may update only villagers they registered.
-- Command Center leadership (admin / ccf / dfo) may update any villager.
-- DELETE remains leadership-only (existing villagers_delete_leadership policy).

CREATE OR REPLACE FUNCTION public.can_lead_villagers()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.get_my_role() = ANY (ARRAY['admin'::text, 'ccf'::text, 'dfo'::text]),
    false
  );
$$;

COMMENT ON FUNCTION public.can_lead_villagers() IS
  'True for Command Center leadership who may edit or delete any villager.';

GRANT EXECUTE ON FUNCTION public.can_lead_villagers() TO authenticated;

DROP POLICY IF EXISTS "villagers_update_managers" ON public.villagers;
DROP POLICY IF EXISTS "villagers_update_own_or_leaders" ON public.villagers;

CREATE POLICY "villagers_update_own_or_leaders"
  ON public.villagers
  FOR UPDATE
  TO authenticated
  USING (
    public.can_lead_villagers()
    OR (public.can_manage_villagers() AND created_by = auth.uid())
  )
  WITH CHECK (
    public.can_lead_villagers()
    OR (public.can_manage_villagers() AND created_by = auth.uid())
  );

CREATE INDEX IF NOT EXISTS villagers_created_by_active_idx
  ON public.villagers (created_by, is_active);
