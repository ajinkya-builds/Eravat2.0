-- ==============================================================================
-- ERAVAT 2.0 — Migration: Fix Notifications & Activity History Scoping
-- Migration: 20260307000000_fix_notifications_and_history.sql
-- ==============================================================================
-- FIXES:
--   1. Add `notification_type` column to `notifications` table
--   2. Add unique constraint to prevent duplicate notifications per user/report/type
--   3. Rewrite `notify_observation_chain` to also alert beat_guard
--   4. Rewrite `notify_conflict_chain` to also alert beat_guard
--   5. Rewrite `notify_proximity_on_report` to use notification_type='proximity'
--      and ON CONFLICT DO NOTHING to avoid duplicates with territory trigger
--   6. Ensure `reports` RLS policies correctly scope activity history by role:
--      beat_guard (beat), range_officer (range), dfo (division), self (own)
-- ==============================================================================

SET search_path TO public, extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: Add notification_type column to notifications
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS notification_type text NOT NULL DEFAULT 'territory'
  CHECK (notification_type IN ('territory', 'proximity'));

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: Add unique constraint to prevent duplicate notifications
-- Deduplicates: if both proximity + territory triggers fire for the same user
-- and the same report, only one row of each type is kept.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS uq_notification_user_report_type;

ALTER TABLE public.notifications
  ADD CONSTRAINT uq_notification_user_report_type
  UNIQUE (user_id, report_id, notification_type);

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: Rewrite notify_observation_chain
-- Now includes beat_guard (beat-scoped) in addition to range_officer + dfo
-- Uses ON CONFLICT DO NOTHING to safely skip duplicates
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_observation_chain()
RETURNS TRIGGER AS $$
DECLARE
    r_id         uuid;
    d_id         uuid;
    b_name       text;
    r_name       text;
    d_name       text;
    officer_id   uuid;
    total_count  int;
    msg_title    text;
    msg_body     text;
    rep_beat_id  uuid;
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
    JOIN public.geo_ranges r    ON b.range_id    = r.id
    JOIN public.geo_divisions d ON r.division_id = d.id
    WHERE b.id = rep_beat_id;

    -- Build rich message based on observation type
    IF NEW.type::text = 'direct_sighting' THEN
        total_count := COALESCE(NEW.male_count, 0)
                     + COALESCE(NEW.female_count, 0)
                     + COALESCE(NEW.calf_count, 0)
                     + COALESCE(NEW.unknown_count, 0);
        msg_title := 'Direct Sighting Alert';
        msg_body  := total_count || ' elephant(s) recorded in ' || b_name
                  || ' Beat (' || r_name || ' Range).';
    ELSIF NEW.type::text = 'indirect_sign' THEN
        msg_title := 'Indirect Sign Logged';
        msg_body  := 'Signs (' || COALESCE(array_to_string(NEW.indirect_sign_details, ', '), 'unspecified type')
                  || ') found in ' || b_name || ' Beat.';
    ELSE
        msg_title := 'Activity Alert';
        msg_body  := 'New activity reported in ' || b_name || ' Beat.';
    END IF;

    -- Notify beat_guard (assigned to this beat), range_officer (this range), dfo (this division)
    FOR officer_id IN (
        SELECT u.user_id
        FROM public.user_region_assignments u
        JOIN public.profiles p ON u.user_id = p.id
        WHERE
            (u.beat_id     = rep_beat_id AND p.role = 'beat_guard')
            OR
            (u.range_id    = r_id        AND p.role = 'range_officer')
            OR
            (u.division_id = d_id        AND p.role IN ('dfo', 'rrt'))
    ) LOOP
        INSERT INTO public.notifications (user_id, report_id, title, message, notification_type)
        VALUES (officer_id, NEW.report_id, msg_title, msg_body, 'territory')
        ON CONFLICT (user_id, report_id, notification_type) DO NOTHING;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- Re-attach trigger (function replaced in-place, trigger stays)
DROP TRIGGER IF EXISTS trigger_notify_observation_chain ON public.observations;
CREATE TRIGGER trigger_notify_observation_chain
AFTER INSERT ON public.observations
FOR EACH ROW
EXECUTE FUNCTION public.notify_observation_chain();


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4: Rewrite notify_conflict_chain
-- Now includes beat_guard + rrt, uses ON CONFLICT DO NOTHING
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_conflict_chain()
RETURNS TRIGGER AS $$
DECLARE
    r_id        uuid;
    d_id        uuid;
    b_name      text;
    r_name      text;
    officer_id  uuid;
    msg_title   text;
    msg_body    text;
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
    msg_body  := 'Damage reported: ' || COALESCE(NEW.description, 'unspecified')
              || ' in ' || b_name || ' Beat (' || r_name || ' Range).';

    -- Notify beat_guard (assigned to this beat), range_officer (this range), dfo + rrt (this division)
    FOR officer_id IN (
        SELECT u.user_id
        FROM public.user_region_assignments u
        JOIN public.profiles p ON u.user_id = p.id
        WHERE
            (u.beat_id     = rep_beat_id AND p.role = 'beat_guard')
            OR
            (u.range_id    = r_id        AND p.role = 'range_officer')
            OR
            (u.division_id = d_id        AND p.role IN ('dfo', 'rrt'))
    ) LOOP
        INSERT INTO public.notifications (user_id, report_id, title, message, notification_type)
        VALUES (officer_id, NEW.report_id, msg_title, msg_body, 'territory')
        ON CONFLICT (user_id, report_id, notification_type) DO NOTHING;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

DROP TRIGGER IF EXISTS trigger_notify_conflict_chain ON public.conflict_damages;
CREATE TRIGGER trigger_notify_conflict_chain
AFTER INSERT ON public.conflict_damages
FOR EACH ROW
EXECUTE FUNCTION public.notify_conflict_chain();


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 5: Rewrite notify_proximity_on_report
-- Use notification_type = 'proximity' and ON CONFLICT DO NOTHING
-- This way, if a user is both in-territory AND within radius, they get ONE
-- 'territory' notification (from step 3/4) and at most ONE 'proximity' notification.
-- The territory notification is more informative so it takes priority via uniqueness.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_proximity_on_report()
RETURNS TRIGGER AS $$
DECLARE
    rec            RECORD;
    region_centroid extensions.geography;
    radius_m       DOUBLE PRECISION;
    beat_name      text;
    range_name     text;
    div_name       text;
    msg_title      text;
    msg_body       text;
BEGIN
    IF NEW.location IS NULL THEN
        RETURN NEW;
    END IF;

    -- Build a friendly place name for the notification message
    SELECT b.name, r.name, d.name
    INTO beat_name, range_name, div_name
    FROM public.reports rp
    LEFT JOIN public.geo_beats     b ON b.id = rp.beat_id
    LEFT JOIN public.geo_ranges    r ON r.id = b.range_id
    LEFT JOIN public.geo_divisions d ON d.id = r.division_id
    WHERE rp.id = NEW.id;

    msg_title := 'New Activity within your alert radius!';
    msg_body  := CASE
        WHEN beat_name  IS NOT NULL
            THEN 'A report was filed near ' || beat_name || ' Beat (' || COALESCE(range_name, '?') || ' Range).'
        WHEN range_name IS NOT NULL
            THEN 'A report was filed near ' || range_name || ' Range.'
        WHEN div_name   IS NOT NULL
            THEN 'A report was filed near ' || div_name || ' Division.'
        ELSE
            'A new field report was filed near your assigned area.'
    END;

    -- Iterate every user who has a region assignment with a valid centroid
    FOR rec IN
        SELECT
            ura.user_id,
            p.notification_radius_km,
            COALESCE(gb.centroid, gr.centroid, gd.centroid) AS region_centroid
        FROM public.user_region_assignments ura
        JOIN public.profiles p
          ON p.id = ura.user_id
        LEFT JOIN public.geo_beats     gb ON gb.id = ura.beat_id
        LEFT JOIN public.geo_ranges    gr ON gr.id = ura.range_id
        LEFT JOIN public.geo_divisions gd ON gd.id = ura.division_id
        WHERE
            COALESCE(gb.centroid, gr.centroid, gd.centroid) IS NOT NULL
    LOOP
        radius_m := rec.notification_radius_km * 1000.0;

        IF ST_DWithin(
               NEW.location::extensions.geography,
               rec.region_centroid::extensions.geography,
               radius_m
           )
        THEN
            -- Insert a proximity notification; skip if a territory notification already exists
            -- (the unique constraint ensures at most one proximity row per user/report)
            INSERT INTO public.notifications (user_id, report_id, title, message, notification_type)
            VALUES (rec.user_id, NEW.id, msg_title, msg_body, 'proximity')
            ON CONFLICT (user_id, report_id, notification_type) DO NOTHING;
        END IF;

    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

DROP TRIGGER IF EXISTS trigger_notify_proximity_on_report ON public.reports;
CREATE TRIGGER trigger_notify_proximity_on_report
AFTER INSERT ON public.reports
FOR EACH ROW
EXECUTE FUNCTION public.notify_proximity_on_report();


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 6: Fix / ensure RLS policies on `reports` for territorial history scoping
--
-- The README states: beat_guard=beat-scoped, range_officer=range-scoped, 
-- dfo/rrt=division-scoped, others=own reports only.
-- We drop and recreate these policies idempotently.
-- ─────────────────────────────────────────────────────────────────────────────

-- Make sure RLS is enabled on reports
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Drop existing policies (in case they exist from a previous session or seed)
DROP POLICY IF EXISTS "Users can read own reports"            ON public.reports;
DROP POLICY IF EXISTS "Users can insert own reports"          ON public.reports;
DROP POLICY IF EXISTS "Users can update own reports"          ON public.reports;
DROP POLICY IF EXISTS "Beat Guard sees beat reports"          ON public.reports;
DROP POLICY IF EXISTS "Range Officer sees range reports"      ON public.reports;
DROP POLICY IF EXISTS "DFO sees division reports"             ON public.reports;
DROP POLICY IF EXISTS "Admins see all reports"                ON public.reports;
DROP POLICY IF EXISTS "Service role manages all reports"      ON public.reports;
-- Legacy policy names from early migrations:
DROP POLICY IF EXISTS "Enable read access for all users"      ON public.reports;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.reports;

-- 6a. Any authenticated user can insert their own reports
CREATE POLICY "Users can insert own reports"
  ON public.reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 6b. Users can update their own pending reports
CREATE POLICY "Users can update own reports"
  ON public.reports FOR UPDATE
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 6c. Users can always read their OWN reports (own reports history)
CREATE POLICY "Users can read own reports"
  ON public.reports FOR SELECT
  USING (auth.uid() = user_id);

-- 6d. Beat Guard: reads reports assigned to their beat(s)
CREATE POLICY "Beat Guard sees beat reports"
  ON public.reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_region_assignments ura
      JOIN public.profiles p ON p.id = ura.user_id
      WHERE ura.user_id = auth.uid()
        AND p.role = 'beat_guard'
        AND ura.beat_id = reports.beat_id
    )
  );

-- 6e. Range Officer: reads all reports in their assigned range
CREATE POLICY "Range Officer sees range reports"
  ON public.reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_region_assignments ura
      JOIN public.profiles p  ON p.id  = ura.user_id
      JOIN public.geo_beats b ON b.id  = reports.beat_id
      WHERE ura.user_id  = auth.uid()
        AND p.role       = 'range_officer'
        AND b.range_id   = ura.range_id
    )
  );

-- 6f. DFO / RRT: reads all reports in their assigned division
CREATE POLICY "DFO sees division reports"
  ON public.reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_region_assignments ura
      JOIN public.profiles p  ON p.id  = ura.user_id
      JOIN public.geo_beats b ON b.id  = reports.beat_id
      JOIN public.geo_ranges r ON r.id = b.range_id
      WHERE ura.user_id    = auth.uid()
        AND p.role         IN ('dfo', 'rrt')
        AND r.division_id  = ura.division_id
    )
  );

-- 6g. Admin / CCF / Biologist / Vet: full read access
CREATE POLICY "Admins see all reports"
  ON public.reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'ccf', 'biologist', 'veterinarian')
    )
  );

-- 6h. Service role bypass
CREATE POLICY "Service role manages all reports"
  ON public.reports FOR ALL
  USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────────────────────────────────────────
-- Index to speed up beat_id lookups in the new policies
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_reports_beat_id    ON public.reports (beat_id);
CREATE INDEX IF NOT EXISTS idx_reports_user_id    ON public.reports (user_id);
CREATE INDEX IF NOT EXISTS idx_ura_beat_id        ON public.user_region_assignments (beat_id);
CREATE INDEX IF NOT EXISTS idx_ura_range_id       ON public.user_region_assignments (range_id);
CREATE INDEX IF NOT EXISTS idx_ura_division_id    ON public.user_region_assignments (division_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications (notification_type);
