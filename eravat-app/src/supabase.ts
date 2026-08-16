import { createClient } from '@supabase/supabase-js';

/**
 * Browser client uses the **publishable** Supabase key (never the service_role key).
 * Dashboard → Project Settings → API → **Publishable** (`sb_publishable_...`).
 * `@supabase/supabase-js` sends it as `apikey` and as Bearer when unauthenticated; RLS still applies.
 */
const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const supabaseKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim();

/** When true, skips background token refresh (fewer console errors if DNS/host is wrong; sessions expire normally). */
const disableAutoRefresh =
  import.meta.env.VITE_SUPABASE_DISABLE_AUTO_REFRESH === 'true' ||
  import.meta.env.VITE_SUPABASE_DISABLE_TOKEN_REFRESH === 'true';

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    '[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in eravat-app/.env.local (see .env.example).'
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
    // Persist the session so OTP login lasts until the user explicitly signs out.
    persistSession: true,
    autoRefreshToken: !disableAutoRefresh,
    detectSessionInUrl: true,
  },
  global: {
    fetch: (input, init = {}) => {
      const headers = new Headers(init.headers);
      const prefer = headers.get('Prefer') ?? '';
      if (!/count=/.test(prefer)) {
        headers.set('Prefer', prefer ? `${prefer},count=none` : 'count=none');
      }
      return fetch(input, { ...init, headers });
    },
  },
});
