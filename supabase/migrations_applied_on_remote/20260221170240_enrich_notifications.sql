-- ==============================================================================
-- ERAVAT 2.0 - Phase 3.1: Enriched Notifications
-- ==============================================================================
-- Description:
-- Drops the old notification trigger on the `reports` table because it fires
-- before the child tracking tables (observations/conflict_damages) are populated.
-- Replaces it with specific triggers on the child tables to capture rich details.
-- ==============================================================================

-- 1. DROP old trigger
DROP TRIGGER IF EXISTS trigger_notify_chain_of_command ON public.reports;

-- 2. Create Observation Notification Trigger
CREATE OR REPLACE FUNCTION public.notify_observation_chain()
RETURNS TRIGGER AS $$
DECLARE
    r_id uuid;
    d_id uuid;
    b_name text;
    r_name text;
    d_name text;
    officer_id uuid;
    total_count int;
    msg_title text;
    msg_body text;
    rep_beat_id uuid;
BEGIN
    -- Get the report's beat_id
    SELECT beat_id INTO rep_beat_id FROM public.reports WHERE id = NEW.report_id;

    IF rep_beat_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Lookup exact names and IDs
    SELECT b.name, r.name, d.name, r.id, r.division_id 
    INTO b_name, r_name, d_name, r_id, d_id
    FROM public.geo_beats b
    JOIN public.geo_ranges r ON b.range_id = r.id
    JOIN public.geo_divisions d ON r.division_id = d.id
    WHERE b.id = rep_beat_id;

    -- Create rich message
    IF NEW.type IN ('direct', 'direct_sighting') THEN
        total_count := COALESCE(NEW.male_count, 0) + COALESCE(NEW.female_count, 0) + COALESCE(NEW.calf_count, 0) + COALESCE(NEW.unknown_count, 0);
        msg_title := 'Direct Sighting Alert';
        msg_body := total_count || ' elephant(s) recorded in ' || b_name || ' Beat (' || r_name || ' Range).';
    ELSIF NEW.type IN ('indirect', 'indirect_sign') THEN
        msg_title := 'Indirect Sign Logged';
        msg_body := 'Signs (' || COALESCE(NEW.indirect_sign_details, 'unspecified type') || ') found in ' || b_name || ' Beat.';
    ELSE
        msg_title := 'Activity Alert';
        msg_body := 'New activity reported in ' || b_name || ' Beat.';
    END IF;

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
        INSERT INTO public.notifications (user_id, report_id, title, message)
        VALUES (officer_id, NEW.report_id, msg_title, msg_body);
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if it already exists (allows script replayability)
DROP TRIGGER IF EXISTS trigger_notify_observation_chain ON public.observations;

CREATE TRIGGER trigger_notify_observation_chain
AFTER INSERT ON public.observations
FOR EACH ROW
EXECUTE FUNCTION public.notify_observation_chain();

-- 3. Create Conflict Damage Notification Trigger
CREATE OR REPLACE FUNCTION public.notify_conflict_chain()
RETURNS TRIGGER AS $$
DECLARE
    r_id uuid;
    d_id uuid;
    b_name text;
    r_name text;
    officer_id uuid;
    msg_title text;
    msg_body text;
    rep_beat_id uuid;
BEGIN
    SELECT beat_id INTO rep_beat_id FROM public.reports WHERE id = NEW.report_id;

    IF rep_beat_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT b.name, r.name, r.id, r.division_id 
    INTO b_name, r_name, r_id, d_id
    FROM public.geo_beats b
    JOIN public.geo_ranges r ON b.range_id = r.id
    WHERE b.id = rep_beat_id;

    msg_title := 'Conflict Damage Alert';
    msg_body := 'Damage reported: ' || COALESCE(NEW.description, 'unspecified') || ' in ' || b_name || ' Beat (' || r_name || ' Range).';

    FOR officer_id IN (
        SELECT u.user_id 
        FROM public.user_region_assignments u
        JOIN public.profiles p ON u.user_id = p.id
        WHERE 
            (u.range_id = r_id AND p.role = 'range_officer')
            OR 
            (u.division_id = d_id AND p.role = 'dfo')
    ) LOOP
        INSERT INTO public.notifications (user_id, report_id, title, message)
        VALUES (officer_id, NEW.report_id, msg_title, msg_body);
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_conflict_chain ON public.conflict_damages;

CREATE TRIGGER trigger_notify_conflict_chain
AFTER INSERT ON public.conflict_damages
FOR EACH ROW
EXECUTE FUNCTION public.notify_conflict_chain();
