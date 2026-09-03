/**
 * CORS for Edge Functions invoked from Vite, Capacitor Android/iOS, and staging/prod web.
 *
 * Capacitor Android uses `androidScheme: 'https'` → Origin `https://localhost`.
 * Omitting that origin makes OPTIONS succeed with a mismatched ACAO, so the
 * WebView never sends POST and the client shows:
 * "Failed to send a request to the Edge Function".
 */
const DEFAULT_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://localhost',
  'https://localhost',
  'capacitor://localhost',
  'ionic://localhost',
  'https://eravat.netlify.app',
  'https://ajinkya-builds.github.io',
]

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || ''
  const fromEnv = (Deno.env.get('ALLOWED_ORIGINS') || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
  const allowed = [...new Set([...DEFAULT_ORIGINS, ...fromEnv])]
  const allowedOrigin = allowed.includes(origin) ? origin : (allowed[0] || '*')
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    // Include `prefer` — the app's global Supabase fetch wrapper adds Prefer: count=none
    // to all requests; without it in ACAH, Capacitor WebView blocks the POST after OPTIONS.
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, prefer, x-supabase-api-version',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}
