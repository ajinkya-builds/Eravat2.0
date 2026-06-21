/**
 * RLS anonymous-access probe.
 *
 * Verifies that NO table is readable with only the public publishable key
 * (no auth session) — the key that ships inside the app bundle. Every row
 * returned here is a row any internet user can read.
 *
 * Read-only: performs SELECT ... limit 1 per table plus one RPC call with a
 * non-existent phone number. Never writes.
 *
 * Run: node scripts/check-rls-anon.mjs
 * Exit code 0 = all locked down, 1 = at least one table leaks.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(resolve(__dirname, '../.env'), 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const url = env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !anonKey) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY in eravat-app/.env');
  process.exit(2);
}

const anon = createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TABLES = [
  'profiles',
  'reports',
  'observations',
  'report_media',
  'conflict_damages',
  'notifications',
  'push_tokens',
  'user_region_assignments',
  // geo tables are reference data — leaking them is lower severity but still reported
  'geo_divisions',
  'geo_ranges',
  'geo_beats',
];

let leaks = 0;

console.log(`Probing ${url} with the publishable (anon) key, no auth session…\n`);

for (const table of TABLES) {
  const { data, error, status } = await anon.from(table).select('*').limit(1);
  if (error) {
    console.log(`  ✅ ${table.padEnd(25)} blocked (${status}: ${error.message})`);
  } else if (!data || data.length === 0) {
    console.log(`  🟡 ${table.padEnd(25)} query allowed but 0 rows returned (RLS filter or empty table — verify policy intent)`);
  } else {
    leaks++;
    const cols = Object.keys(data[0]).join(', ');
    console.log(`  ❌ ${table.padEnd(25)} READABLE — returned a row with columns: ${cols}`);
  }
}

// RPC probe: must not reveal whether a phone exists beyond its intended contract
const { data: rpcData, error: rpcError } = await anon.rpc('get_email_by_phone', {
  p_phone: '0000000000',
});
if (rpcError) {
  console.log(`  ✅ ${'rpc:get_email_by_phone'.padEnd(25)} blocked for anon (${rpcError.message})`);
} else {
  console.log(`  🟡 ${'rpc:get_email_by_phone'.padEnd(25)} callable by anon — returned: ${JSON.stringify(rpcData)} (by design for login, but confirm it rate-limits)`);
}

console.log(
  leaks === 0
    ? '\nRESULT: no table returned data to the anonymous key.'
    : `\nRESULT: ${leaks} table(s) READABLE with the public key shipped in the app bundle — fix RLS before launch.`,
);
process.exit(leaks === 0 ? 0 : 1);
