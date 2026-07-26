-- Ensure one region assignment per user (required for upsert/update logic)
-- Uses IF NOT EXISTS to avoid errors if constraint already exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_region_assignments_user_id_key'
    AND conrelid = 'public.user_region_assignments'::regclass
  ) THEN
    ALTER TABLE public.user_region_assignments
      ADD CONSTRAINT user_region_assignments_user_id_key UNIQUE (user_id);
  END IF;
END $$;
