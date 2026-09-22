/**
 * Edge Function: msg91-voice-dispatch (stub)
 *
 * Placeholder for later MSG91 Voice SMS / IVR dialing.
 * Until MSG91_AUTHKEY (+ template/flow ids) are configured, this only reports
 * how many villager_call_events are waiting in call_status = 'queued'.
 *
 * Auth: service-role Bearer or X-Dispatch-Secret (MSG91_VOICE_DISPATCH_SECRET).
 *
 * Future wiring (not enabled here):
 *   1. Select queued rows (limit batch)
 *   2. POST MSG91 Send Voice SMS / Execute IVR with CRQID = call_event.id
 *   3. On API success → call_status = 'triggered', store msg91_uuid / crqid
 *   4. On API failure → call_status = 'failed', failure_reason = error
 *   5. Webhook msg91-voice-webhook updates ringing / completed / no_answer / …
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return json(500, { error: 'missing_supabase_env' })
  }

  const dispatchSecret = Deno.env.get('MSG91_VOICE_DISPATCH_SECRET') || ''
  const auth = req.headers.get('Authorization') || ''
  const headerSecret = req.headers.get('X-Dispatch-Secret') || ''
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
  const serviceOk = !!serviceKey && bearer === serviceKey
  const secretOk = !!dispatchSecret && (headerSecret === dispatchSecret || bearer === dispatchSecret)
  if (!serviceOk && !secretOk) {
    return json(401, { error: 'unauthorized' })
  }

  const sb = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const authKey = Deno.env.get('MSG91_AUTHKEY') || ''
  const { count, error } = await sb
    .from('villager_call_events')
    .select('id', { count: 'exact', head: true })
    .eq('call_status', 'queued')

  if (error) {
    return json(500, { error: 'queue_count_failed', detail: error.message })
  }

  if (!authKey) {
    return json(200, {
      ok: true,
      dispatched: 0,
      queued: count ?? 0,
      skipped: 'MSG91_AUTHKEY not configured — infra only',
    })
  }

  // Live dialing intentionally not implemented yet.
  return json(200, {
    ok: true,
    dispatched: 0,
    queued: count ?? 0,
    skipped: 'MSG91 dialing not enabled in this stub; configure template/flow then implement send',
  })
})
