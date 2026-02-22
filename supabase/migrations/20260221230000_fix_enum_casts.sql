-- Fix for Observation Trigger enum casting error
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

    -- Create rich message (Fix: cast NEW.type to text to avoid enum cast errors, or just match enum values properly)
    -- The enum is 'direct_sighting', 'indirect_sign', 'conflict_loss'
    IF NEW.type::text = 'direct_sighting' THEN
        total_count := COALESCE(NEW.male_count, 0) + COALESCE(NEW.female_count, 0) + COALESCE(NEW.calf_count, 0) + COALESCE(NEW.unknown_count, 0);
        msg_title := 'Direct Sighting Alert';
        msg_body := total_count || ' elephant(s) recorded in ' || b_name || ' Beat (' || r_name || ' Range).';
    ELSIF NEW.type::text = 'indirect_sign' THEN
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
