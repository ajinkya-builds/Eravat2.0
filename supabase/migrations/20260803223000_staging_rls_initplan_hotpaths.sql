-- Staging RLS performance: initplan-safe auth calls + cheaper can_read_report.
-- Staging only (ttjtyvxfiqhjdngkgdkf). Do not apply to prod without explicit ask.

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT role::text FROM public.profiles WHERE id = (SELECT auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.can_read_report(p_report_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH me AS (
    SELECT (SELECT auth.uid()) AS uid, public.get_my_role() AS role
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.reports rep
    CROSS JOIN me
    LEFT JOIN public.geo_beats gb ON gb.id = rep.beat_id
    LEFT JOIN public.geo_ranges gr ON gr.id = gb.range_id
    LEFT JOIN public.user_region_assignments ura ON ura.user_id = me.uid
    WHERE rep.id = p_report_id
      AND (
        rep.user_id = me.uid
        OR me.role IN ('admin', 'ccf')
        OR (
          me.role = 'dfo'
          AND rep.beat_id IS NOT NULL
          AND ura.division_id IS NOT NULL
          AND gr.division_id = ura.division_id
        )
        OR (
          me.role = 'range_officer'
          AND rep.beat_id IS NOT NULL
          AND ura.range_id IS NOT NULL
          AND gb.range_id = ura.range_id
        )
        OR (
          me.role = 'beat_guard'
          AND rep.beat_id IS NOT NULL
          AND ura.beat_id IS NOT NULL
          AND rep.beat_id = ura.beat_id
        )
        OR (
          me.role IN ('biologist', 'veterinarian', 'rrt')
          AND rep.beat_id IS NOT NULL
          AND ura.division_id IS NOT NULL
          AND gr.division_id = ura.division_id
        )
      )
  );
$$;

-- reports policies: wrap auth.uid()/auth.role()
ALTER POLICY "Self View Access" ON public.reports
  USING (user_id = (SELECT auth.uid()));

ALTER POLICY "Users can read own reports" ON public.reports
  USING ((SELECT auth.uid()) = user_id);

ALTER POLICY "Users can create reports" ON public.reports
  WITH CHECK (user_id = (SELECT auth.uid()));

ALTER POLICY "Users can insert own reports" ON public.reports
  WITH CHECK ((SELECT auth.uid()) = user_id);

ALTER POLICY "Users can update own reports" ON public.reports
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

ALTER POLICY "Update Access" ON public.reports
  USING ((user_id = (SELECT auth.uid())) OR (get_my_role() = ANY (ARRAY['admin'::text, 'rrt'::text])));

ALTER POLICY "Service role manages all reports" ON public.reports
  USING ((SELECT auth.role()) = 'service_role'::text);

ALTER POLICY "Beat View Access" ON public.reports
  USING (
    (get_my_role() = 'beat_guard'::text)
    AND (beat_id IN (
      SELECT user_region_assignments.beat_id
      FROM user_region_assignments
      WHERE user_region_assignments.user_id = (SELECT auth.uid())
    ))
  );

ALTER POLICY "Range View Access" ON public.reports
  USING (
    (get_my_role() = 'range_officer'::text)
    AND (beat_id IN (
      SELECT gb.id
      FROM geo_beats gb
      JOIN geo_ranges gr ON gb.range_id = gr.id
      WHERE gr.id IN (
        SELECT user_region_assignments.range_id
        FROM user_region_assignments
        WHERE user_region_assignments.user_id = (SELECT auth.uid())
      )
    ))
  );

ALTER POLICY "Division View Access" ON public.reports
  USING (
    (get_my_role() = ANY (ARRAY['dfo'::text, 'rrt'::text]))
    AND (beat_id IN (
      SELECT b.id
      FROM geo_beats b
      JOIN geo_ranges r ON b.range_id = r.id
      WHERE r.division_id IN (
        SELECT user_region_assignments.division_id
        FROM user_region_assignments
        WHERE user_region_assignments.user_id = (SELECT auth.uid())
      )
    ))
  );

ALTER POLICY "Admins see all reports" ON public.reports
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role = ANY (ARRAY['admin'::user_role, 'ccf'::user_role, 'biologist'::user_role, 'veterinarian'::user_role])
    )
  );

ALTER POLICY "Beat Guard sees beat reports" ON public.reports
  USING (
    EXISTS (
      SELECT 1
      FROM user_region_assignments ura
      JOIN profiles p ON p.id = ura.user_id
      WHERE ura.user_id = (SELECT auth.uid())
        AND p.role = 'beat_guard'::user_role
        AND ura.beat_id = reports.beat_id
    )
  );

ALTER POLICY "Range Officer sees range reports" ON public.reports
  USING (
    EXISTS (
      SELECT 1
      FROM user_region_assignments ura
      JOIN profiles p ON p.id = ura.user_id
      JOIN geo_beats b ON b.id = reports.beat_id
      WHERE ura.user_id = (SELECT auth.uid())
        AND p.role = 'range_officer'::user_role
        AND b.range_id = ura.range_id
    )
  );

ALTER POLICY "DFO sees division reports" ON public.reports
  USING (
    EXISTS (
      SELECT 1
      FROM user_region_assignments ura
      JOIN profiles p ON p.id = ura.user_id
      JOIN geo_beats b ON b.id = reports.beat_id
      JOIN geo_ranges r ON r.id = b.range_id
      WHERE ura.user_id = (SELECT auth.uid())
        AND p.role = ANY (ARRAY['dfo'::user_role, 'rrt'::user_role])
        AND r.division_id = ura.division_id
    )
  );

-- notifications
ALTER POLICY "Users can Read Their Own Notifications" ON public.notifications
  USING ((SELECT auth.uid()) = user_id);

ALTER POLICY "Users can Update Their Own Notifications (eg. Mark Read)" ON public.notifications
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

ALTER POLICY "Service role can manage all notifications" ON public.notifications
  USING ((SELECT auth.role()) = 'service_role'::text);

-- observations / conflict / media: own-row auth.uid wraps
ALTER POLICY "Users can read own observations" ON public.observations
  USING (EXISTS (
    SELECT 1 FROM reports r
    WHERE r.id = observations.report_id AND r.user_id = (SELECT auth.uid())
  ));

ALTER POLICY "Users can insert observations for own reports" ON public.observations
  WITH CHECK (EXISTS (
    SELECT 1 FROM reports r
    WHERE r.id = observations.report_id AND r.user_id = (SELECT auth.uid())
  ));

ALTER POLICY "Insert Observations if author of Report" ON public.observations
  WITH CHECK (EXISTS (
    SELECT 1 FROM reports
    WHERE reports.id = observations.report_id AND reports.user_id = (SELECT auth.uid())
  ));

ALTER POLICY "Update Observations if author of Report" ON public.observations
  USING (EXISTS (
    SELECT 1 FROM reports
    WHERE reports.id = observations.report_id AND reports.user_id = (SELECT auth.uid())
  ));

ALTER POLICY "Users can update own observations" ON public.observations
  USING (EXISTS (
    SELECT 1 FROM reports r
    WHERE r.id = observations.report_id AND r.user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM reports r
    WHERE r.id = observations.report_id AND r.user_id = (SELECT auth.uid())
  ));

ALTER POLICY "Users can delete own observations" ON public.observations
  USING (EXISTS (
    SELECT 1 FROM reports r
    WHERE r.id = observations.report_id AND r.user_id = (SELECT auth.uid())
  ));

ALTER POLICY "Service role can manage all observations" ON public.observations
  USING ((SELECT auth.role()) = 'service_role'::text);

ALTER POLICY "Users can insert conflict damages for own reports" ON public.conflict_damages
  WITH CHECK (EXISTS (
    SELECT 1 FROM reports r
    WHERE r.id = conflict_damages.report_id AND r.user_id = (SELECT auth.uid())
  ));

ALTER POLICY "Users can read own conflict damages" ON public.conflict_damages
  USING (EXISTS (
    SELECT 1 FROM reports r
    WHERE r.id = conflict_damages.report_id AND r.user_id = (SELECT auth.uid())
  ));

ALTER POLICY "Service role can manage all conflict damages" ON public.conflict_damages
  USING ((SELECT auth.role()) = 'service_role'::text);

ALTER POLICY "Users can insert media for own reports" ON public.report_media
  WITH CHECK (EXISTS (
    SELECT 1 FROM reports r
    WHERE r.id = report_media.report_id AND r.user_id = (SELECT auth.uid())
  ));

ALTER POLICY "Users can read own report media" ON public.report_media
  USING (EXISTS (
    SELECT 1 FROM reports r
    WHERE r.id = report_media.report_id AND r.user_id = (SELECT auth.uid())
  ));

ALTER POLICY "Service role can manage all report media" ON public.report_media
  USING ((SELECT auth.role()) = 'service_role'::text);
