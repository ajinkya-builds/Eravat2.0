-- Security fix: Enable RLS on tables that were missing it.

-- ══════════════════════════════════════════════════════════════════════
-- 1. profiles — users read own, admins read all
-- ══════════════════════════════════════════════════════════════════════
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can read all profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'ccf', 'dfo')
    )
  );

CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'ccf')
    )
  );

CREATE POLICY "Service role can manage all profiles"
  ON public.profiles FOR ALL
  USING (auth.role() = 'service_role');

-- ══════════════════════════════════════════════════════════════════════
-- 2. user_region_assignments — users read own, admins manage all
-- ══════════════════════════════════════════════════════════════════════
ALTER TABLE public.user_region_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own assignments"
  ON public.user_region_assignments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can read all assignments"
  ON public.user_region_assignments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'ccf', 'dfo')
    )
  );

CREATE POLICY "Service role can manage all assignments"
  ON public.user_region_assignments FOR ALL
  USING (auth.role() = 'service_role');

-- ══════════════════════════════════════════════════════════════════════
-- 3. conflict_damages — authenticated users insert own, admins manage
-- ══════════════════════════════════════════════════════════════════════
ALTER TABLE public.conflict_damages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own conflict damages"
  ON public.conflict_damages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.reports r
      WHERE r.id = conflict_damages.report_id AND r.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert conflict damages for own reports"
  ON public.conflict_damages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.reports r
      WHERE r.id = conflict_damages.report_id AND r.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage all conflict damages"
  ON public.conflict_damages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'ccf', 'dfo')
    )
  );

CREATE POLICY "Service role can manage all conflict damages"
  ON public.conflict_damages FOR ALL
  USING (auth.role() = 'service_role');

-- ══════════════════════════════════════════════════════════════════════
-- 4. report_media — users manage own, admins read all
-- ══════════════════════════════════════════════════════════════════════
ALTER TABLE public.report_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own report media"
  ON public.report_media FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.reports r
      WHERE r.id = report_media.report_id AND r.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert media for own reports"
  ON public.report_media FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.reports r
      WHERE r.id = report_media.report_id AND r.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage all report media"
  ON public.report_media FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'ccf', 'dfo')
    )
  );

CREATE POLICY "Service role can manage all report media"
  ON public.report_media FOR ALL
  USING (auth.role() = 'service_role');
