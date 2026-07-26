-- Align DFO report reads with division assignment (admin dashboards + Territory History).
-- Previously DFO was grouped with admin/ccf and could read every division.

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
        OR public.get_my_role() IN ('admin', 'ccf')
        OR (
          public.get_my_role() = 'dfo'
          AND rep.beat_id IS NOT NULL
          AND ura.division_id IS NOT NULL
          AND gr.division_id = ura.division_id
        )
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
