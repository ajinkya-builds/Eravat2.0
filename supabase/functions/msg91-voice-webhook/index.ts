/**
 * Edge Function: msg91-voice-webhook
 *
 * Receives MSG91 Voice "Report Received" webhooks and updates
 * public.villager_call_events. Does NOT place calls — dispatch is separate.
 *
 * Auth: Bearer or X-Msg91-Webhook-Secret matching MSG91_VOICE_WEBHOOK_SECRET.
 * verify_jwt must be false (MSG91 cannot send Supabase JWTs).
 *
 * Secrets (set later when wiring MSG91):
 *   - MSG91_VOICE_WEBHOOK_SECRET
 *
 * Docs:
 *   https://msg91.com/help/voice/voice-call-logs-status-explanation
 *   https://msg91.com/help/webhook-new/how-to-receive-voice-call-reports-via-webhook
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type WebhookBody = {
  uuid?: string
  CRQID?: string
  crqid?: string
  requestedAt?: string
  status?: string
  duration?: string | number
  charged?: string | number
  startTime?: string
  endTime?: string
  destination?: string
  failureReason?: string
  failure_reason?: string
  direction?: string
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function normalizePhone(raw: string | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 8) return null
  if (raw.trim().startsWith('+')) return `+${digits}`
  // MSG91 often sends 91XXXXXXXXXX without +
  if (digits.length === 10) return `+91${digits}`
  return `+${digits}`
}

function parseTs(raw: string | undefined): string | null {
  if (!raw || !String(raw).trim()) return null
  const d = new Date(String(raw).replace(' ', 'T') + (String(raw).includes('Z') ? '' : 'Z'))
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' })
  }

  const expected = Deno.env.get('MSG91_VOICE_WEBHOOK_SECRET') || ''
  if (!expected) {
    // Infra prepared but secret not configured yet — acknowledge without mutating.
    return json(503, { error: 'webhook_secret_not_configured', accepted: false })
  }

  const auth = req.headers.get('Authorization') || ''
  const headerSecret = req.headers.get('X-Msg91-Webhook-Secret') || ''
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
  if (headerSecret !== expected && bearer !== expected) {
    return json(401, { error: 'unauthorized' })
  }

  let body: WebhookBody
  try {
    body = (await req.json()) as WebhookBody
  } catch {
    return json(400, { error: 'invalid_json' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return json(500, { error: 'missing_supabase_env' })
  }

  const sb = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const rawStatus = body.status ?? ''
  const { data: mapped, error: mapErr } = await sb.rpc('map_msg91_voice_status', {
    raw: rawStatus,
  })
  if (mapErr) {
    return json(500, { error: 'status_map_failed', detail: mapErr.message })
  }

  const callStatus = (mapped as string | null) ?? 'failed'
  const phone = normalizePhone(body.destination)
  const msg91Uuid = body.uuid || null
  const crqid = body.CRQID || body.crqid || null
  const failureReason = body.failureReason || body.failure_reason || null
  const duration =
    body.duration === undefined || body.duration === ''
      ? null
      : Number.parseInt(String(body.duration), 10)
  const charged =
    body.charged === undefined || body.charged === ''
      ? null
      : Number.parseFloat(String(body.charged))

  const patch: Record<string, unknown> = {
    call_status: callStatus,
    provider_status_raw: rawStatus || null,
    failure_reason: failureReason,
    duration_seconds: Number.isFinite(duration as number) ? duration : null,
    charged: Number.isFinite(charged as number) ? charged : null,
    requested_at: parseTs(body.requestedAt),
    started_at: parseTs(body.startTime),
    ended_at: parseTs(body.endTime),
    last_webhook_at: new Date().toISOString(),
  }
  if (msg91Uuid) patch.msg91_uuid = msg91Uuid
  if (crqid) patch.msg91_crqid = crqid

  let updated = 0

  if (msg91Uuid) {
    const { data, error } = await sb
      .from('villager_call_events')
      .update(patch)
      .eq('msg91_uuid', msg91Uuid)
      .select('id')
    if (error) return json(500, { error: 'update_by_uuid_failed', detail: error.message })
    updated = data?.length ?? 0
  }

  if (updated === 0 && crqid) {
    const { data, error } = await sb
      .from('villager_call_events')
      .update(patch)
      .eq('msg91_crqid', crqid)
      .select('id')
    if (error) return json(500, { error: 'update_by_crqid_failed', detail: error.message })
    updated = data?.length ?? 0
  }

  if (updated === 0 && phone) {
    // Fallback: latest queued/triggered row for this phone (dispatch will set uuid later)
    const { data: candidates, error: findErr } = await sb
      .from('villager_call_events')
      .select('id')
      .eq('phone_e164', phone)
      .in('call_status', ['queued', 'triggered', 'ringing'])
      .order('created_at', { ascending: false })
      .limit(1)
    if (findErr) return json(500, { error: 'lookup_failed', detail: findErr.message })
    const id = candidates?.[0]?.id
    if (id) {
      const { data, error } = await sb
        .from('villager_call_events')
        .update(patch)
        .eq('id', id)
        .select('id')
      if (error) return json(500, { error: 'update_by_phone_failed', detail: error.message })
      updated = data?.length ?? 0
    }
  }

  return json(200, {
    ok: true,
    updated,
    call_status: callStatus,
    provider_status_raw: rawStatus,
  })
})
