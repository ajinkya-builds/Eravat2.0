-- ==============================================================================
-- ERAVAT 2.0 - Phase 2: Spatial Auto-Association Trigger
-- ==============================================================================
-- Description:
-- Automatically assigns a `beat_id` to a new report if the report's `location`
-- (PostGIS POINT) falls within a `geo_beat`'s `boundary` (PostGIS POLYGON).
--
-- Usage:
-- Paste this entire script into the Supabase SQL Editor and hit "RUN".
-- ==============================================================================

-- 1. Create the Trigger Function
CREATE OR REPLACE FUNCTION public.assign_report_geography()
RETURNS TRIGGER AS $$
DECLARE
  matched_beat_id uuid;
BEGIN
  -- Only attempt assignment if a location exists and a beat hasn't been manually assigned
  IF NEW.location IS NOT NULL AND NEW.beat_id IS NULL THEN
    
    -- Find the first Beat boundary that intersects/contains the report's POINT location
    SELECT id INTO matched_beat_id
    FROM public.geo_beats
    WHERE ST_Intersects(boundary, NEW.location)
    LIMIT 1;
    
    -- If a matching beat is found, assign it to the new report row before insertion
    IF matched_beat_id IS NOT NULL THEN
      NEW.beat_id := matched_beat_id;
    END IF;
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Drop the trigger if it already exists (to allow safe re-running of this script)
DROP TRIGGER IF EXISTS trigger_assign_report_geography ON public.reports;

-- 3. Attach the Trigger to the `reports` table
CREATE TRIGGER trigger_assign_report_geography
BEFORE INSERT ON public.reports
FOR EACH ROW
EXECUTE FUNCTION public.assign_report_geography();

-- ==============================================================================
-- ERAVAT 2.0 - Phase 3: The Notification Engine
-- ==============================================================================
-- Description:
-- Creates a `notifications` table and a trigger that automatically alerts the 
-- corresponding chain of command (Range Officer, DFO) when a report is synced.
--
-- Usage:
-- Paste this entire script into the Supabase SQL Editor and hit "RUN".
-- ==============================================================================

-- 1. Create the Notifications Table
CREATE TABLE IF NOT EXISTS public.notifications (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    report_id uuid REFERENCES public.reports(id) ON DELETE CASCADE,
    title text NOT NULL,
    message text NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- 2. Setup RLS for Notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can Read Their Own Notifications" ON public.notifications
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can Update Their Own Notifications (eg. Mark Read)" ON public.notifications
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can Manage All Notifications" ON public.notifications
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('admin', 'ccf')
        )
    );

-- 3. Create Notification Generation Function
CREATE OR REPLACE FUNCTION public.notify_chain_of_command_on_report()
RETURNS TRIGGER AS $$
DECLARE
    r_id uuid; -- range ID
    d_id uuid; -- division ID
    officer_id uuid;
BEGIN
    -- Only generate notifications if the report has an assigned beat
    IF NEW.beat_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Lookup the exact range and division this beat belongs to
    SELECT r.id, r.division_id INTO r_id, d_id
    FROM public.geo_beats b
    JOIN public.geo_ranges r ON b.range_id = r.id
    WHERE b.id = NEW.beat_id;

    -- Look up the Range Officer for this Range AND the DFO for this Division
    FOR officer_id IN (
        SELECT u.user_id 
        FROM public.user_region_assignments u
        JOIN public.profiles p ON u.user_id = p.id
        WHERE 
            (u.range_id = r_id AND p.role = 'range_officer')
            OR 
            (u.division_id = d_id AND p.role = 'dfo')
    ) LOOP
        -- Insert a notification for each found officer
        INSERT INTO public.notifications (user_id, report_id, title, message)
        VALUES (
            officer_id, 
            NEW.id, 
            'New Field Report', 
            'A field report was synced in your territory.'
        );
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Drop trigger if it already exists (allows script replayability)
DROP TRIGGER IF EXISTS trigger_notify_chain_of_command ON public.reports;

-- 5. Attach Function to `reports`
CREATE TRIGGER trigger_notify_chain_of_command
AFTER INSERT ON public.reports
FOR EACH ROW
EXECUTE FUNCTION public.notify_chain_of_command_on_report();
