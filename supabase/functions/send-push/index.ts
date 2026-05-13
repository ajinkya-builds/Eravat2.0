import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Edge Function: send-push
 *
 * Invoked by pg_net when a notification row is inserted. Delivers FCM push
 * to the target user's registered device tokens.
 *
 * Auth: Bearer service-role JWT (from pg_net trigger) or X-Push-Webhook-Secret.
 *
 * Secrets:
 *   - FCM_PROJECT_ID (optional if embedded in service account JSON)
 *   - FCM_SERVICE_ACCOUNT_JSON (plain JSON or base64-encoded JSON)
 *   - PUSH_WEBHOOK_SECRET (optional secondary auth for webhooks)
 */

let cachedFcmAccess: { token: string; expiresAt: number } | null = null

function b64decode(b64: string): string {
  return new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0)))
}

function parseServiceAccount(raw: string): { client_email: string; private_key: string; project_id?: string } {
  const trimmed = raw.trim()
  try {
    if (trimmed.startsWith('{')) {
      return JSON.parse(trimmed)
    }
    return JSON.parse(b64decode(trimmed))
  } catch {
    throw new Error('FCM_SERVICE_ACCOUNT_JSON is not valid JSON or base64 JSON')
  }
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '')
  const binary = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
  return crypto.subtle.importKey(
    'pkcs8',
    binary.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

async function createServiceAccountJWT(email: string, privateKeyPem: string, scope: string): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: email,
    scope,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }

  const encode = (obj: unknown) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

  const unsigned = `${encode(header)}.${encode(payload)}`
  const key = await importPrivateKey(privateKeyPem)
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned))
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  return `${unsigned}.${sigB64}`
}

async function getCachedFcmAccessToken(email: string, privateKey: string): Promise<string> {
  const now = Date.now()
  if (cachedFcmAccess && cachedFcmAccess.expiresAt > now + 60_000) {
    return cachedFcmAccess.token
  }

  const jwt = await createServiceAccountJWT(email, privateKey, 'https://www.googleapis.com/auth/firebase.messaging')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(`OAuth token error: ${JSON.stringify(data)}`)

  cachedFcmAccess = { token: data.access_token, expiresAt: now + 3_500_000 }
  return data.access_token
}

function isAuthorized(req: Request): boolean {
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const webhookSecret = Deno.env.get('PUSH_WEBHOOK_SECRET') ?? ''
  const authHeader = req.headers.get('Authorization') ?? ''
  const bearer = authHeader.replace(/^Bearer\s+/i, '')

  if (serviceRoleKey && bearer === serviceRoleKey) {
    return true
  }

  const headerSecret = req.headers.get('X-Push-Webhook-Secret') ?? ''
  return Boolean(webhookSecret && headerSecret === webhookSecret)
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  if (!isAuthorized(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const { user_id, title, message, report_id, notification_type } = await req.json()

    if (!user_id || !title) {
      return new Response(JSON.stringify({ error: 'Missing user_id or title' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const fcmServiceAccountRaw = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON')
    if (!fcmServiceAccountRaw) {
      return new Response(JSON.stringify({ skipped: true, reason: 'FCM not configured' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const serviceAccount = parseServiceAccount(fcmServiceAccountRaw)
    const fcmProjectId = Deno.env.get('FCM_PROJECT_ID') ?? serviceAccount.project_id
    if (!fcmProjectId) {
      return new Response(JSON.stringify({ skipped: true, reason: 'FCM project id missing' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const { data: tokens, error: tokensErr } = await adminClient
      .from('push_tokens')
      .select('token, platform')
      .eq('user_id', user_id)

    if (tokensErr || !tokens?.length) {
      return new Response(JSON.stringify({
        skipped: true,
        reason: tokensErr ? tokensErr.message : 'No push tokens for user',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const accessToken = await getCachedFcmAccessToken(
      serviceAccount.client_email,
      serviceAccount.private_key,
    )

    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${fcmProjectId}/messages:send`
    const results: { token: string; success: boolean; error?: string }[] = []

    for (const { token } of tokens) {
      const fcmBody = {
        message: {
          token,
          notification: { title, body: message },
          data: {
            report_id: report_id ?? '',
            notification_type: notification_type ?? 'eravat_alert',
          },
          android: {
            priority: 'high' as const,
            notification: {
              channel_id: 'eravat_alerts',
              sound: 'default',
            },
          },
        },
      }

      const fcmRes = await fetch(fcmUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(fcmBody),
      })

      if (fcmRes.ok) {
        results.push({ token: token.slice(0, 12) + '…', success: true })
      } else {
        const errBody = await fcmRes.text()
        results.push({ token: token.slice(0, 12) + '…', success: false, error: errBody })

        if (fcmRes.status === 404 || fcmRes.status === 410) {
          await adminClient.from('push_tokens').delete().eq('token', token)
        }
      }
    }

    return new Response(JSON.stringify({ sent: results.filter(r => r.success).length, results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('send-push error:', err)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
