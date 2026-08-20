-- ED-parity reporting (staging): additive only.
-- Rollback: backups/staging-pre-ed-parity-20260816T093500Z/RESTORE.md

-- People count for a damage row. Default 1 matches ED when a flag is set with no breakdown.
ALTER TABLE public.conflict_damages
  ADD COLUMN IF NOT EXISTS affected_people integer NOT NULL DEFAULT 1;

ALTER TABLE public.conflict_damages
  DROP CONSTRAINT IF EXISTS conflict_damages_affected_people_nonneg;
ALTER TABLE public.conflict_damages
  ADD CONSTRAINT conflict_damages_affected_people_nonneg CHECK (affected_people >= 0);

COMMENT ON COLUMN public.conflict_damages.affected_people IS
  'People affected for human_injury/human_death; 1 for property/crop events.';

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'eravat';

ALTER TABLE public.reports
  DROP CONSTRAINT IF EXISTS reports_source_check;
ALTER TABLE public.reports
  ADD CONSTRAINT reports_source_check CHECK (source IN ('eravat', 'gajrakshak'));

COMMENT ON COLUMN public.reports.source IS
  'eravat = field app; gajrakshak = historical CSV ingest.';

CREATE TABLE IF NOT EXISTS public.village_centroids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_normalized text GENERATED ALWAYS AS (lower(trim(name))) STORED,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  location geography(Point, 4326) NOT NULL,
  CONSTRAINT village_centroids_lat CHECK (latitude >= -90 AND latitude <= 90),
  CONSTRAINT village_centroids_lng CHECK (longitude >= -180 AND longitude <= 180)
);

CREATE INDEX IF NOT EXISTS village_centroids_name_idx
  ON public.village_centroids (name_normalized);
CREATE INDEX IF NOT EXISTS village_centroids_location_gix
  ON public.village_centroids USING gist (location);

COMMENT ON TABLE public.village_centroids IS
  'Census/landscape village points for ED-style risk and coverage. Separate from villages (Hathi Mitra names).';

ALTER TABLE public.village_centroids ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "village_centroids_select_authenticated" ON public.village_centroids;
CREATE POLICY "village_centroids_select_authenticated"
  ON public.village_centroids FOR SELECT TO authenticated
  USING (true);

GRANT SELECT ON public.village_centroids TO authenticated;
GRANT ALL ON public.village_centroids TO service_role;
