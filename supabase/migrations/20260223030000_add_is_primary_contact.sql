-- Migration: Add is_primary_contact to user_region_assignments
-- This marks which user is the "primary contact" for a given geographic territory level.
-- A Division can have one DFO as primary, a Range one Range Officer, and a Beat one Beat Guard.

ALTER TABLE public.user_region_assignments
  ADD COLUMN IF NOT EXISTS is_primary_contact boolean NOT NULL DEFAULT false;

-- Index for fast lookups of primary contacts
CREATE INDEX IF NOT EXISTS idx_user_region_assignments_primary_contact
  ON public.user_region_assignments (division_id, range_id, beat_id, is_primary_contact)
  WHERE is_primary_contact = true;
