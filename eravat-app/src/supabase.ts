import { createClient } from '@supabase/supabase-js';

/**
 * Browser client uses the **public** Supabase key (never the service_role key).
 *
 * - **Legacy “anon” JWT** — long `eyJ...` string from Dashboard → API → Project API keys → `anon` `public`.
 * - **Publishable key** (`sb_publishable_...`) — newer dashboard default; same usage as anon for
 *   `@supabase/supabase-js`: sent as `apikey` and as Bearer for unauthenticated REST. RLS still applies.
 *
 * There is no separate “new REST API” for the app: PostgREST, Auth, Storage, and Realtime all use this
 * project URL + public key; after login, the user’s JWT is used for Row Level Security.
 */
const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const supabaseKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ||
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim();

/** When true, skips background token refresh (fewer console errors if DNS/host is wrong; sessions expire normally). */
const disableAutoRefresh =
  import.meta.env.VITE_SUPABASE_DISABLE_AUTO_REFRESH === 'true' ||
  import.meta.env.VITE_SUPABASE_DISABLE_TOKEN_REFRESH === 'true';

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    '[supabase] Missing VITE_SUPABASE_URL or public key. Set VITE_SUPABASE_ANON_KEY or VITE_SUPABASE_PUBLISHABLE_KEY in eravat-app/.env.local (see .env.example).'
  );
}

try {
  const host = new URL(supabaseUrl).hostname;
  if (!host.endsWith('.supabase.co')) {
    console.warn(
      '[supabase] Expected VITE_SUPABASE_URL host like <ref>.supabase.co; got:',
      host
    );
  }
} catch {
  throw new Error(`[supabase] Invalid VITE_SUPABASE_URL: ${supabaseUrl}`);
}

if (import.meta.env.DEV && disableAutoRefresh) {
  console.info('[supabase] autoRefreshToken is disabled (VITE_SUPABASE_DISABLE_AUTO_REFRESH).');
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: !disableAutoRefresh,
    detectSessionInUrl: true,
  },
});
