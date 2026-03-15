import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Edge Function: send-push
 *
 * Called (via pg_net trigger or Database Webhook) whenever a new
 * notification row is inserted.  Looks up the target user's FCM
 * tokens from `push_tokens` and sends a push via the FCM HTTP v1 API.
 *
 * Required Supabase secrets:
 *   - FCM_PROJECT_ID          (Firebase project ID)
 *   - FCM_SERVICE_ACCOUNT_JSON (full service-account JSON, base-64 encoded)
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Decode a base-64 string into a UTF-8 string. */
function b64decode(b64: string): string {
  return new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0)))
}

/** Import an RSA private key from PEM for signing JWTs. */
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
    ['sign']
  )
}

/** Create a signed JWT for Google OAuth 2.0 service-account flow. */
async function createServiceAccountJWT(
  email: string,
  privateKeyPem: string,
  scope: string,
): Promise<string> {
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
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned)
  )
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  return `${unsigned}.${sigB64}`
}

/** Exchange a service-account JWT for a short-lived OAuth access token. */
async function getAccessToken(email: string, privateKey: string): Promise<string> {
  const jwt = await createServiceAccountJWT(
    email,
    privateKey,
    'https://www.googleapis.com/auth/firebase.messaging',
  )

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
  return data.access_token
}

// ── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  // Accept POST only (from pg_net trigger or webhook)
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { user_id, title, message, report_id } = await req.json()

    if (!user_id || !title) {
      return new Response(JSON.stringify({ error: 'Missing user_id or title' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // ── 1. Lookup FCM config ────────────────────────────────────────────────
    const fcmProjectId = Deno.env.get('FCM_PROJECT_ID')
    const fcmServiceAccountB64 = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON')

    if (!fcmProjectId || !fcmServiceAccountB64) {
      // FCM not configured yet — skip silently
      return new Response(JSON.stringify({ skipped: true, reason: 'FCM not configured' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // ── 2. Look up user's push tokens ───────────────────────────────────────
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
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

    // ── 3. Get OAuth access token for FCM ───────────────────────────────────
    const serviceAccount = JSON.parse(b64decode(fcmServiceAccountB64))
    const accessToken = await getAccessToken(
      serviceAccount.client_email,
      serviceAccount.private_key,
    )

    // ── 4. Send push to each registered device ──────────────────────────────
    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${fcmProjectId}/messages:send`
    const results: { token: string; success: boolean; error?: string }[] = []

    for (const { token } of tokens) {
      const fcmBody = {
        message: {
          token,
          notification: { title, body: message },
          data: {
            report_id: report_id ?? '',
            notification_type: 'eravat_alert',
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

        // If token is invalid/expired, clean it up
        if (fcmRes.status === 404 || fcmRes.status === 410) {
          await adminClient.from('push_tokens').delete().eq('token', token)
        }
      }
    }

    return new Response(JSON.stringify({ sent: results.length, results }), {
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
