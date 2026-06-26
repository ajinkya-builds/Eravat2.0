/**
 * Provisions / repairs Playwright E2E test accounts on remote Supabase.
 * Run: node scripts/seed-e2e-test-users.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../.env.local');
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in eravat-app/.env.local');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const E2E_FIELD = {
  phone: '8899776655',
  first_name: 'E2E',
  last_name: 'BeatGuard',
  role: 'beat_guard',
};

const E2E_ADMIN = {
  phone: '9988775566',
};

async function getGeoIds() {
  const { data: beat, error: beatErr } = await admin
    .from('geo_beats')
    .select('id, range_id')
    .limit(1)
    .single();
  if (beatErr || !beat) throw new Error(`geo beat lookup failed: ${beatErr?.message}`);
  const { data: range, error: rangeErr } = await admin
    .from('geo_ranges')
    .select('division_id')
    .eq('id', beat.range_id)
    .single();
  if (rangeErr || !range) throw new Error(`geo range lookup failed: ${rangeErr?.message}`);
  return { beat_id: beat.id, range_id: beat.range_id, division_id: range.division_id };
}

async function findUserByPhone(phone) {
  const phoneE164 = `+91${phone}`;
  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .or(`phone.eq.${phoneE164},phone.eq.${phone}`)
    .maybeSingle();
  if (!profile?.id) return null;
  const { data: authData, error } = await admin.auth.admin.getUserById(profile.id);
  if (error) throw error;
  return authData.user;
}

async function upsertBeatGuard(geo) {
  const phoneE164 = `+91${E2E_FIELD.phone}`;
  const phoneGoTrue = `91${E2E_FIELD.phone}`;
  let user = await findUserByPhone(E2E_FIELD.phone);

  if (user) {
    console.log(`[field] Existing user ${user.id} (profile/assignment sync only)`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      phone: phoneGoTrue,
      phone_confirm: true,
      user_metadata: {
        first_name: E2E_FIELD.first_name,
        last_name: E2E_FIELD.last_name,
        role: E2E_FIELD.role,
        latitude: 22.9734,
        longitude: 78.6568,
      },
    });
    if (error) throw error;
    user = data.user;
    console.log(`[field] Created user ${user.id}`);
  }

  const { error: profileErr } = await admin.from('profiles').upsert({
    id: user.id,
    role: E2E_FIELD.role,
    first_name: E2E_FIELD.first_name,
    last_name: E2E_FIELD.last_name,
    phone: phoneE164,
    is_active: true,
    latitude: 22.9734,
    longitude: 78.6568,
    location_updated_at: new Date().toISOString(),
    notification_radius_km: 10,
  });
  if (profileErr) throw profileErr;

  const { error: assignErr } = await admin.from('user_region_assignments').upsert({
    user_id: user.id,
    division_id: geo.division_id,
    range_id: geo.range_id,
    beat_id: geo.beat_id,
  }, { onConflict: 'user_id' });
  if (assignErr) throw assignErr;

  // Verify creation
  const { data: verifyProf, error: verifyErr } = await admin
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .single();
  if (verifyErr || !verifyProf) throw new Error(`[field] Verification failed: profile row missing`);
  console.log('[field] Created and verified OK');
}

async function syncAdminProfile() {
  const user = await findUserByPhone(E2E_ADMIN.phone);
  if (!user) throw new Error('[admin] No profile found for E2E admin phone');
  const phoneE164 = `+91${E2E_ADMIN.phone}`;
  const { error } = await admin.from('profiles').upsert({
    id: user.id,
    role: 'admin',
    phone: phoneE164,
    is_active: true,
    latitude: 22.9734,
    longitude: 78.6568,
    location_updated_at: new Date().toISOString(),
    notification_radius_km: 10,
  });
  if (error) throw new Error(`[admin] profile sync failed: ${error.message}`);
  console.log(`[admin] Profile synced for ${user.id}`);
}

async function verifyAdmin() {
  await syncAdminProfile();
  const user = await findUserByPhone(E2E_ADMIN.phone);
  if (!user) throw new Error('[admin] E2E admin user record missing in auth.users');
  console.log('[admin] Admin verified OK');
}

async function main() {
  const geo = await getGeoIds();
  console.log('[geo]', geo);
  await upsertBeatGuard(geo);
  await verifyAdmin();
  console.log('E2E seed complete.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
