-- Retire the third-party product name from reports.source.
-- The column stays. Only the allowed value for historical CSV rows changes.
-- Down procedure is commented at the bottom so this migration stays reversible.

UPDATE public.reports
SET source = 'legacy_csv'
WHERE source = 'gajrakshak';

ALTER TABLE public.reports
  DROP CONSTRAINT IF EXISTS reports_source_check;

ALTER TABLE public.reports
  ADD CONSTRAINT reports_source_check CHECK (source IN ('eravat', 'legacy_csv'));

COMMENT ON COLUMN public.reports.source IS
  'eravat = field app; legacy_csv = historical CSV ingest.';

-- Down (manual, reversible):
-- UPDATE public.reports SET source = 'gajrakshak' WHERE source = 'legacy_csv';
-- ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_source_check;
-- ALTER TABLE public.reports
--   ADD CONSTRAINT reports_source_check CHECK (source IN ('eravat', 'gajrakshak'));
-- COMMENT ON COLUMN public.reports.source IS
--   'eravat = field app; gajrakshak = historical CSV ingest.';
