/**
 * Verify UAT Test OTP login against staging for one user per role.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv(relativePath) {
  try {
    return Object.fromEntries(
      readFileSync(resolve(__dirname, relativePath), 'utf8')
        .split('\n')
        .filter((l) => l && !l.startsWith('#'))
        .map((l) => {
          const i = l.indexOf('=');
          return [l.slice(0, i), l.slice(i + 1)];
        }),
    );
  } catch {
    return {};
  }
}

const stagingEnv = loadEnv('../.env.staging.local');

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || stagingEnv.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || stagingEnv.VITE_SUPABASE_PUBLISHABLE_KEY;
const manifest = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../Go live Prep - Staging/generated/uat-testers/uat-testers-otp-manifest.json'),
    'utf8'
  )
);

if (!url || !key) {
  console.error('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or use .env.staging.local)');
  process.exit(1);
}

const reps = {
  beat_guard: manifest.find((u) => u.role === 'beat_guard'),
  range_officer: manifest.find((u) => u.role === 'range_officer'),
  dfo: manifest.find((u) => u.role === 'dfo'),
  volunteer: manifest.find((u) => u.role === 'volunteer'),
  admin: manifest.find((u) => u.role === 'admin'),
};

async function tryLogin(user) {
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const phone = `+91${user.phone_app}`;
  const { error: sendErr } = await sb.auth.signInWithOtp({ phone });
  if (sendErr) {
    const msg = (sendErr.message || '').toLowerCase();
    if (!(msg.includes('phone provider') || sendErr.code === 'phone_provider_disabled')) {
      throw sendErr;
    }
  }
  const { data, error } = await sb.auth.verifyOtp({ phone, token: user.otp, type: 'sms' });
  if (error || !data.session) throw error || new Error('no session');
  const { data: profile } = await sb.from('profiles').select('role,first_name,last_name').eq('id', data.user.id).single();
  return { userId: data.user.id, profile };
}

let failed = 0;
for (const [role, user] of Object.entries(reps)) {
  if (!user) {
    console.error(`Missing rep for ${role}`);
    failed++;
    continue;
  }
  try {
    const { userId, profile } = await tryLogin(user);
    console.log(`PASS ${role} ${user.name} (${user.phone_app}) OTP=${user.otp} → ${profile?.role} ${userId.slice(0, 8)}…`);
  } catch (err) {
    console.error(`FAIL ${role} ${user.name}:`, err.message || err);
    failed++;
  }
}
process.exit(failed ? 1 : 0);
