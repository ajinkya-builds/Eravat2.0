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
