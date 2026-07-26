-- Fix: Add missing total_elephants column and id default to observations table.
-- The total_elephants column is collected in the activity form and sent by
-- syncService but was never added to the remote schema.
-- The id column was missing a default UUID generator, causing inserts without
-- an explicit id to fail with a NOT NULL constraint violation.

ALTER TABLE public.observations
ADD COLUMN IF NOT EXISTS total_elephants integer DEFAULT 0;

ALTER TABLE public.observations
ALTER COLUMN id SET DEFAULT gen_random_uuid();
