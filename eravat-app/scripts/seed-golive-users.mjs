/**
 * Seed go-live admin + pilot users on production after the wipe.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/seed-golive-users.mjs path/to/pilots.json
 *
 * pilots.json shape:
 * [
 *   { "phone": "9876543210", "role": "admin", "first_name": "Ops", "last_name": "Admin",
 *     "otp": "123456", "latitude": 23.25, "longitude": 77.41 },
 *   { "phone": "9123456780", "role": "beat_guard", "first_name": "Pilot", "last_name": "One",
 *     "otp": "123456", "division_id": "...", "range_id": "...", "beat_id": "...",
 *     "latitude": 23.25, "longitude": 77.41 }
 * ]
 *
 * Also add each phone under Dashboard → Auth → Phone → Test OTP as 91XXXXXXXXXX = otp.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const file = process.argv[2];

if (!url || !key || !file) {
  console.error('Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-golive-users.mjs pilots.json');
  process.exit(1);
}

const users = JSON.parse(readFileSync(file, 'utf8'));
const sb = createClient(url, key, { auth: { persistSession: false } });

function toE164(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  throw new Error(`Bad phone: ${phone}`);
}

for (const u of users) {
  const e164 = toE164(u.phone);
  console.log(`\nCreating ${u.role} ${u.first_name} ${u.last_name} (${e164})`);

  const { data: created, error: createErr } = await sb.auth.admin.createUser({
    phone: e164,
    phone_confirm: true,
    user_metadata: {
      first_name: u.first_name,
      last_name: u.last_name,
      role: u.role,
    },
  });

  if (createErr) {
    console.error('auth create failed:', createErr.message);
    continue;
  }

  const id = created.user.id;
  const { error: profileErr } = await sb.from('profiles').upsert({
    id,
    first_name: u.first_name,
    last_name: u.last_name,
    phone: e164,
    role: u.role,
    is_active: true,
    latitude: u.latitude ?? 23.2599,
    longitude: u.longitude ?? 77.4126,
    location_updated_at: new Date().toISOString(),
  });

  if (profileErr) {
    console.error('profile upsert failed:', profileErr.message);
    await sb.auth.admin.deleteUser(id);
    continue;
  }

  if (u.division_id || u.range_id || u.beat_id) {
    const { error: assignErr } = await sb.from('user_region_assignments').upsert({
      user_id: id,
      division_id: u.division_id ?? null,
      range_id: u.range_id ?? null,
      beat_id: u.beat_id ?? null,
    }, { onConflict: 'user_id' });
    if (assignErr) console.error('assignment failed:', assignErr.message);
  }

  console.log('OK', id);
  if (u.otp) {
    console.log(`  Dashboard Test OTP: 91${e164.replace(/\D/g, '').slice(-10)} = ${u.otp}`);
  }
}

console.log('\nDone. Configure Test OTP entries in the Supabase Dashboard before pilots log in.');
