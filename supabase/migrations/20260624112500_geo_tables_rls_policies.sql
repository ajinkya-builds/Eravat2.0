-- Enable Row Level Security (RLS) on geography tables and allow public read access.
-- Geography data (divisions, ranges, beats) needs to be readable by all users (authenticated and anonymous)
-- for dropdown menus, map views, and onboarding location resolution.
-- Modifications (INSERT, UPDATE, DELETE) remain blocked except for service_role.

ALTER TABLE public.geo_divisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geo_ranges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geo_beats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access" ON public.geo_divisions;
CREATE POLICY "Allow public read access" ON public.geo_divisions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public read access" ON public.geo_ranges;
CREATE POLICY "Allow public read access" ON public.geo_ranges FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public read access" ON public.geo_beats;
CREATE POLICY "Allow public read access" ON public.geo_beats FOR SELECT USING (true);
