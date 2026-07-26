-- Add conflict-loss detail array to observations
-- Mirrors indirect_sign_details so conflict-loss selections are preserved
-- on the observations row itself.

ALTER TABLE public.observations
ADD COLUMN IF NOT EXISTS conflict_loss_details text[];

-- Backfill from normalized conflict_damages rows for existing records.
UPDATE public.observations o
SET conflict_loss_details = src.details
FROM (
  SELECT
    cd.report_id,
    ARRAY_AGG(cd.description ORDER BY cd.description) FILTER (
      WHERE cd.description IS NOT NULL AND BTRIM(cd.description) <> ''
    ) AS details
  FROM public.conflict_damages cd
  GROUP BY cd.report_id
) AS src
WHERE o.report_id = src.report_id
  AND o.type = 'conflict_loss'
  AND (
    o.conflict_loss_details IS NULL
    OR CARDINALITY(o.conflict_loss_details) = 0
  );
