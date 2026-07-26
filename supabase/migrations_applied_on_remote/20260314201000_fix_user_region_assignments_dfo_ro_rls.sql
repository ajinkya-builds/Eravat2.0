-- Fix RLS for direct client upserts to user_region_assignments from AdminDivisions.
-- DFO/Range Officer assignment UI writes through PostgREST and needs scoped write policies.

CREATE OR REPLACE FUNCTION public.get_my_primary_division_id()
RETURNS uuid
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ura.division_id
  FROM public.user_region_assignments ura
  WHERE ura.user_id = auth.uid() AND ura.division_id IS NOT NULL
  ORDER BY ura.is_primary_contact DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_my_primary_range_id()
RETURNS uuid
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ura.range_id
  FROM public.user_region_assignments ura
  WHERE ura.user_id = auth.uid() AND ura.range_id IS NOT NULL
  ORDER BY ura.is_primary_contact DESC
  LIMIT 1;
$$;

DROP POLICY IF EXISTS "Leadership can insert scoped assignments" ON public.user_region_assignments;
DROP POLICY IF EXISTS "Leadership can update scoped assignments" ON public.user_region_assignments;
DROP POLICY IF EXISTS "Leadership can delete scoped assignments" ON public.user_region_assignments;

CREATE POLICY "Leadership can insert scoped assignments"
  ON public.user_region_assignments FOR INSERT
  WITH CHECK (
    public.get_my_role() IN ('admin', 'ccf')
    OR (
      public.get_my_role() = 'dfo'
      AND division_id = public.get_my_primary_division_id()
      AND (
        SELECT p.role::text
        FROM public.profiles p
        WHERE p.id = user_region_assignments.user_id
      ) IN ('range_officer', 'beat_guard')
    )
    OR (
      public.get_my_role() = 'range_officer'
      AND beat_id IS NOT NULL
      AND range_id = public.get_my_primary_range_id()
      AND (
        SELECT p.role::text
        FROM public.profiles p
        WHERE p.id = user_region_assignments.user_id
      ) = 'beat_guard'
    )
  );

CREATE POLICY "Leadership can update scoped assignments"
  ON public.user_region_assignments FOR UPDATE
  USING (
    public.get_my_role() IN ('admin', 'ccf', 'dfo', 'range_officer')
  )
  WITH CHECK (
    public.get_my_role() IN ('admin', 'ccf')
    OR (
      public.get_my_role() = 'dfo'
      AND division_id = public.get_my_primary_division_id()
      AND (
        SELECT p.role::text
        FROM public.profiles p
        WHERE p.id = user_region_assignments.user_id
      ) IN ('range_officer', 'beat_guard')
    )
    OR (
      public.get_my_role() = 'range_officer'
      AND beat_id IS NOT NULL
      AND range_id = public.get_my_primary_range_id()
      AND (
        SELECT p.role::text
        FROM public.profiles p
        WHERE p.id = user_region_assignments.user_id
      ) = 'beat_guard'
    )
  );

CREATE POLICY "Leadership can delete scoped assignments"
  ON public.user_region_assignments FOR DELETE
  USING (
    public.get_my_role() IN ('admin', 'ccf')
    OR (public.get_my_role() = 'dfo' AND division_id = public.get_my_primary_division_id())
    OR (public.get_my_role() = 'range_officer' AND beat_id IS NOT NULL AND range_id = public.get_my_primary_range_id())
  );
