-- Collapse duplicate report SELECT policies. Postgres ORs every SELECT policy
-- per row; we had two of each (self/beat/range/division/admin).
-- Wrap get_my_role() in (SELECT ...) so it is an initplan, once per query.

DROP POLICY IF EXISTS "Users can read own reports" ON public.reports;
DROP POLICY IF EXISTS "Beat Guard sees beat reports" ON public.reports;
DROP POLICY IF EXISTS "Range Officer sees range reports" ON public.reports;
DROP POLICY IF EXISTS "DFO sees division reports" ON public.reports;
DROP POLICY IF EXISTS "Admins see all reports" ON public.reports;
DROP POLICY IF EXISTS "Users can insert own reports" ON public.reports;

DROP POLICY IF EXISTS "Beat View Access" ON public.reports;
CREATE POLICY "Beat View Access" ON public.reports
  FOR SELECT
  USING (
    (SELECT public.get_my_role()) = 'beat_guard'
    AND beat_id IN (
      SELECT ura.beat_id
      FROM public.user_region_assignments ura
      WHERE ura.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Range View Access" ON public.reports;
CREATE POLICY "Range View Access" ON public.reports
  FOR SELECT
  USING (
    (SELECT public.get_my_role()) = 'range_officer'
    AND beat_id IN (
      SELECT gb.id
      FROM public.geo_beats gb
      WHERE gb.range_id IN (
        SELECT ura.range_id
        FROM public.user_region_assignments ura
        WHERE ura.user_id = (SELECT auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "Division View Access" ON public.reports;
CREATE POLICY "Division View Access" ON public.reports
  FOR SELECT
  USING (
    (SELECT public.get_my_role()) = ANY (ARRAY['dfo'::text, 'rrt'::text])
    AND beat_id IN (
      SELECT b.id
      FROM public.geo_beats b
      JOIN public.geo_ranges r ON r.id = b.range_id
      WHERE r.division_id IN (
        SELECT ura.division_id
        FROM public.user_region_assignments ura
        WHERE ura.user_id = (SELECT auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "Global View Access" ON public.reports;
CREATE POLICY "Global View Access" ON public.reports
  FOR SELECT
  USING (
    (SELECT public.get_my_role()) = ANY (ARRAY['admin'::text, 'ccf'::text, 'biologist'::text, 'veterinarian'::text])
  );
