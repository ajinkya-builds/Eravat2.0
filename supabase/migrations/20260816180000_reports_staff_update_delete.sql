-- Staff can update/delete reports from admin UI (Mark flagged, edit, delete).
-- Previously UPDATE allowed only owner + admin/rrt; DELETE had no authenticated policy.

DROP POLICY IF EXISTS "Update Access" ON public.reports;
DROP POLICY IF EXISTS "Users can update own reports" ON public.reports;
DROP POLICY IF EXISTS "reports_update_own_or_staff" ON public.reports;
DROP POLICY IF EXISTS "reports_delete_staff" ON public.reports;

CREATE POLICY "reports_update_own_or_staff"
ON public.reports
FOR UPDATE
TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR (SELECT public.get_my_role()) IN ('admin', 'ccf', 'rrt')
  OR (
    (SELECT public.get_my_role()) = 'dfo'
    AND beat_id IN (
      SELECT b.id
      FROM public.geo_beats b
      JOIN public.geo_ranges r ON r.id = b.range_id
      WHERE r.division_id IN (
        SELECT ura.division_id
        FROM public.user_region_assignments ura
        WHERE ura.user_id = (SELECT auth.uid())
          AND ura.division_id IS NOT NULL
      )
    )
  )
)
WITH CHECK (
  user_id = (SELECT auth.uid())
  OR (SELECT public.get_my_role()) IN ('admin', 'ccf', 'rrt')
  OR (
    (SELECT public.get_my_role()) = 'dfo'
    AND beat_id IN (
      SELECT b.id
      FROM public.geo_beats b
      JOIN public.geo_ranges r ON r.id = b.range_id
      WHERE r.division_id IN (
        SELECT ura.division_id
        FROM public.user_region_assignments ura
        WHERE ura.user_id = (SELECT auth.uid())
          AND ura.division_id IS NOT NULL
      )
    )
  )
);

CREATE POLICY "reports_delete_staff"
ON public.reports
FOR DELETE
TO authenticated
USING (
  (SELECT public.get_my_role()) IN ('admin', 'ccf')
  OR (
    (SELECT public.get_my_role()) = 'dfo'
    AND beat_id IN (
      SELECT b.id
      FROM public.geo_beats b
      JOIN public.geo_ranges r ON r.id = b.range_id
      WHERE r.division_id IN (
        SELECT ura.division_id
        FROM public.user_region_assignments ura
        WHERE ura.user_id = (SELECT auth.uid())
          AND ura.division_id IS NOT NULL
      )
    )
  )
);
