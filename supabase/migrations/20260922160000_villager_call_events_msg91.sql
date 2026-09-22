-- Hathi Mitra voice-call alert infra (MSG91-ready). Additive / 2.1.8-safe:
-- - Does not alter villager_alert_events channel values or default (sms_queued stays).
-- - New table + dual-write from notify_villagers_on_report; existing SMS queue e2e unchanged.
-- - Live MSG91 dialing is NOT enabled; rows start as call_status = 'queued'.

-- ---------------------------------------------------------------------------
-- villager_call_events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.villager_call_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.reports (id) ON DELETE CASCADE,
  villager_id uuid NOT NULL REFERENCES public.villagers (id) ON DELETE CASCADE,
  distance_m double precision,
  phone_e164 text NOT NULL,
  -- Lifecycle aligned to MSG91 Voice Call Logs + our pre-dispatch states:
  --   queued      = geo-matched; waiting for MSG91 dispatch (current default)
  --   triggered   = MSG91 API accepted (their "Queued")
  --   ringing     = MSG91 "Ringing"
  --   completed   = answered / received (MSG91 "Completed")
  --   no_answer   = rang, not picked up (MSG91 "No-Answer")
  --   busy        = MSG91 "Busy"
  --   cancelled   = MSG91 "Cancelled"
  --   failed      = MSG91 "Failed" / "Balance" / unreachable / etc.
  --   skipped     = not dialed (missing phone, opt-out at dispatch, etc.)
  call_status text NOT NULL DEFAULT 'queued',
  msg91_uuid text,
  msg91_crqid text,
  provider_status_raw text,
  failure_reason text,
  duration_seconds integer,
  charged numeric(12, 6),
  requested_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  last_webhook_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT villager_call_events_status_check CHECK (
    call_status IN (
      'queued',
      'triggered',
      'ringing',
      'completed',
      'no_answer',
      'busy',
      'cancelled',
      'failed',
      'skipped'
    )
  ),
  CONSTRAINT villager_call_events_phone_e164_check
    CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  CONSTRAINT villager_call_events_uniq UNIQUE (report_id, villager_id)
);

CREATE INDEX IF NOT EXISTS villager_call_events_report_idx
  ON public.villager_call_events (report_id);

CREATE INDEX IF NOT EXISTS villager_call_events_status_idx
  ON public.villager_call_events (call_status);

CREATE INDEX IF NOT EXISTS villager_call_events_msg91_uuid_idx
  ON public.villager_call_events (msg91_uuid)
  WHERE msg91_uuid IS NOT NULL;

COMMENT ON TABLE public.villager_call_events IS
  'Per-report Hathi Mitra voice alert attempts. Queued by geo match; MSG91 dispatch + webhook update statuses later.';
COMMENT ON COLUMN public.villager_call_events.call_status IS
  'queued|triggered|ringing|completed|no_answer|busy|cancelled|failed|skipped — see MSG91 Voice Call Logs.';
COMMENT ON COLUMN public.villager_call_events.phone_e164 IS
  'Snapshot of villager mobile at queue time (audit-stable if registry phone changes).';

DROP TRIGGER IF EXISTS villager_call_events_set_updated_at ON public.villager_call_events;
CREATE TRIGGER villager_call_events_set_updated_at
  BEFORE UPDATE ON public.villager_call_events
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.villager_call_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "villager_call_events_select_staff" ON public.villager_call_events;
CREATE POLICY "villager_call_events_select_staff"
  ON public.villager_call_events FOR SELECT TO authenticated
  USING (public.can_read_villagers() OR public.can_manage_villagers());

GRANT SELECT ON public.villager_call_events TO authenticated;
GRANT ALL ON public.villager_call_events TO service_role;

-- ---------------------------------------------------------------------------
-- Map MSG91 webhook / log status strings → our call_status
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.map_msg91_voice_status(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(trim(COALESCE(raw, '')))
    WHEN 'queued' THEN 'triggered'          -- API accepted; in MSG91 queue
    WHEN 'ringing' THEN 'ringing'
    WHEN 'completed' THEN 'completed'
    WHEN 'delivered' THEN 'completed'       -- webhook sample sometimes uses delivered
    WHEN 'answered' THEN 'completed'        -- Voice SMS legacy wording
    WHEN 'no-answer' THEN 'no_answer'
    WHEN 'no_answer' THEN 'no_answer'
    WHEN 'no answer' THEN 'no_answer'
    WHEN 'ringing time out' THEN 'no_answer'
    WHEN 'busy' THEN 'busy'
    WHEN 'cancelled' THEN 'cancelled'
    WHEN 'canceled' THEN 'cancelled'
    WHEN 'failed' THEN 'failed'
    WHEN 'balance' THEN 'failed'
    WHEN 'congestion' THEN 'failed'
    WHEN 'hang-up' THEN 'failed'
    WHEN 'hangup' THEN 'failed'
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION public.map_msg91_voice_status(text) IS
  'Normalize MSG91 voice status strings to villager_call_events.call_status. NULL = unknown.';

GRANT EXECUTE ON FUNCTION public.map_msg91_voice_status(text) TO service_role;

-- ---------------------------------------------------------------------------
-- Admin: list calls for a report (name, village, phone, status)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_report_villager_calls(p_report_id uuid)
RETURNS TABLE (
  id uuid,
  villager_id uuid,
  villager_name text,
  village_name text,
  phone_e164 text,
  distance_m double precision,
  call_status text,
  failure_reason text,
  provider_status_raw text,
  msg91_uuid text,
  duration_seconds integer,
  requested_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.can_read_villagers() OR public.can_manage_villagers()) THEN
    RAISE EXCEPTION 'not authorized to read villager call events'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.villager_id,
    v.name AS villager_name,
    vg.name AS village_name,
    c.phone_e164,
    c.distance_m,
    c.call_status,
    c.failure_reason,
    c.provider_status_raw,
    c.msg91_uuid,
    c.duration_seconds,
    c.requested_at,
    c.started_at,
    c.ended_at,
    c.created_at
  FROM public.villager_call_events c
  JOIN public.villagers v ON v.id = c.villager_id
  JOIN public.villages vg ON vg.id = v.village_id
  WHERE c.report_id = p_report_id
  ORDER BY c.distance_m NULLS LAST, v.name;
END;
$$;

COMMENT ON FUNCTION public.get_report_villager_calls(uuid) IS
  'Staff/admin: villager voice-alert rows for a report (name, village, phone, MSG91-aligned status).';

GRANT EXECUTE ON FUNCTION public.get_report_villager_calls(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_report_villager_calls(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Notify: keep sms_queued dual-write; also queue voice call rows
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_villagers_on_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  report_division_id uuid;
  match_radius_m double precision := 2000;
BEGIN
  IF NEW.location IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.beat_id IS NOT NULL THEN
    SELECT r.division_id INTO report_division_id
    FROM public.geo_beats b
    JOIN public.geo_ranges r ON r.id = b.range_id
    WHERE b.id = NEW.beat_id;
  END IF;

  -- Existing dummy SMS queue (unchanged for 2.1.8 / certification)
  INSERT INTO public.villager_alert_events (report_id, villager_id, distance_m, channel)
  SELECT NEW.id,
         v.id,
         ST_Distance(
           NEW.location,
           ST_SetSRID(ST_MakePoint(v.longitude, v.latitude), 4326)::geography
         ),
         'sms_queued'
  FROM public.villagers v
  WHERE v.is_active
    AND v.alert_opt_in
    AND v.latitude IS NOT NULL
    AND v.longitude IS NOT NULL
    AND (
      report_division_id IS NULL
      OR v.division_id IS NULL
      OR v.division_id = report_division_id
    )
    AND ST_DWithin(
      NEW.location,
      ST_SetSRID(ST_MakePoint(v.longitude, v.latitude), 4326)::geography,
      match_radius_m
    )
  ORDER BY 3
  LIMIT 100
  ON CONFLICT (report_id, villager_id) DO NOTHING;

  -- Voice call queue (MSG91 dispatch later; status stays queued until then)
  INSERT INTO public.villager_call_events (
    report_id,
    villager_id,
    distance_m,
    phone_e164,
    call_status
  )
  SELECT NEW.id,
         v.id,
         ST_Distance(
           NEW.location,
           ST_SetSRID(ST_MakePoint(v.longitude, v.latitude), 4326)::geography
         ),
         v.mobile,
         'queued'
  FROM public.villagers v
  WHERE v.is_active
    AND v.alert_opt_in
    AND v.latitude IS NOT NULL
    AND v.longitude IS NOT NULL
    AND v.mobile IS NOT NULL
    AND (
      report_division_id IS NULL
      OR v.division_id IS NULL
      OR v.division_id = report_division_id
    )
    AND ST_DWithin(
      NEW.location,
      ST_SetSRID(ST_MakePoint(v.longitude, v.latitude), 4326)::geography,
      match_radius_m
    )
  ORDER BY 3
  LIMIT 100
  ON CONFLICT (report_id, villager_id) DO NOTHING;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_villagers_on_report() IS
  'On report insert with GPS: queue villager_alert_events (sms_queued) and villager_call_events (queued) within 2 km.';

-- Backfill call queue from existing geo-match SMS rows (idempotent)
INSERT INTO public.villager_call_events (
  report_id,
  villager_id,
  distance_m,
  phone_e164,
  call_status,
  created_at
)
SELECT
  e.report_id,
  e.villager_id,
  e.distance_m,
  v.mobile,
  'queued',
  e.created_at
FROM public.villager_alert_events e
JOIN public.villagers v ON v.id = e.villager_id
WHERE v.mobile IS NOT NULL
ON CONFLICT (report_id, villager_id) DO NOTHING;
