-- Remove redundant/expensive per-row can_read_report scans when role policies already cover access.
DROP POLICY IF EXISTS "Territory scoped read reports" ON public.reports;
DROP POLICY IF EXISTS "View Observations if can view Report" ON public.observations;

DROP POLICY IF EXISTS "Territory scoped read observations" ON public.observations;
CREATE POLICY "Territory scoped read observations" ON public.observations
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.reports r
    WHERE r.id = observations.report_id
  )
);

DROP POLICY IF EXISTS "Territory scoped read conflict damages" ON public.conflict_damages;
CREATE POLICY "Territory scoped read conflict damages" ON public.conflict_damages
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.reports r
    WHERE r.id = conflict_damages.report_id
  )
);

DROP POLICY IF EXISTS "Territory scoped read report media" ON public.report_media;
CREATE POLICY "Territory scoped read report media" ON public.report_media
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.reports r
    WHERE r.id = report_media.report_id
  )
);
