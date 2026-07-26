-- Fix: Add RLS policies for the observations table.
-- The observations table was missed during the security audit migration,
-- causing observation inserts to silently fail for non-admin users.

-- Enable RLS (idempotent — no-op if already enabled)
ALTER TABLE public.observations ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first to make this migration idempotent
DROP POLICY IF EXISTS "Users can read own observations" ON public.observations;
DROP POLICY IF EXISTS "Users can insert observations for own reports" ON public.observations;
DROP POLICY IF EXISTS "Users can update own observations" ON public.observations;
DROP POLICY IF EXISTS "Users can delete own observations" ON public.observations;
DROP POLICY IF EXISTS "Admins can manage all observations" ON public.observations;
DROP POLICY IF EXISTS "Service role can manage all observations" ON public.observations;

-- Users can read observations for their own reports
CREATE POLICY "Users can read own observations"
  ON public.observations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.reports r
      WHERE r.id = observations.report_id AND r.user_id = auth.uid()
    )
  );

-- Users can insert observations for their own reports
CREATE POLICY "Users can insert observations for own reports"
  ON public.observations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.reports r
      WHERE r.id = observations.report_id AND r.user_id = auth.uid()
    )
  );

-- Users can update observations for their own reports
CREATE POLICY "Users can update own observations"
  ON public.observations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.reports r
      WHERE r.id = observations.report_id AND r.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.reports r
      WHERE r.id = observations.report_id AND r.user_id = auth.uid()
    )
  );

-- Users can delete observations for their own reports (needed for idempotent re-sync)
CREATE POLICY "Users can delete own observations"
  ON public.observations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.reports r
      WHERE r.id = observations.report_id AND r.user_id = auth.uid()
    )
  );

-- Admins can manage all observations
CREATE POLICY "Admins can manage all observations"
  ON public.observations FOR ALL
  USING (public.get_my_role() IN ('admin', 'ccf', 'dfo'));

-- Service role can manage all observations
CREATE POLICY "Service role can manage all observations"
  ON public.observations FOR ALL
  USING (auth.role() = 'service_role');
