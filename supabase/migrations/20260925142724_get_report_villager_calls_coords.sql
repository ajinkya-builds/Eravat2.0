-- Include villager latitude/longitude in call-log export RPC.

DROP FUNCTION IF EXISTS public.get_report_villager_calls(uuid);

CREATE FUNCTION public.get_report_villager_calls(p_report_id uuid)
RETURNS TABLE (
  id uuid,
  villager_id uuid,
  villager_name text,
  village_name text,
  phone_e164 text,
  distance_m double precision,
  latitude double precision,
  longitude double precision,
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
    v.latitude,
    v.longitude,
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
  'Staff/admin: villager voice-alert rows for a report (name, village, phone, coords, MSG91-aligned status).';

GRANT EXECUTE ON FUNCTION public.get_report_villager_calls(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_report_villager_calls(uuid) TO service_role;
