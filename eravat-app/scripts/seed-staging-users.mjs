/**
 * Seed mapped staging users into a Supabase project (auth + profiles + assignments).
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/seed-staging-users.mjs path/to/staging-users.seed.json
 *
 * Idempotent: if phone already exists, updates profile + assignment.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const file = process.argv[2];
const limit = process.env.SEED_LIMIT ? Number(process.env.SEED_LIMIT) : null;

if (!url || !key || !file) {
  console.error(
    'Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-staging-users.mjs seed.json'
  );
  process.exit(1);
}

const users = JSON.parse(readFileSync(file, 'utf8'));
const cohort = limit ? users.slice(0, limit) : users;
const sb = createClient(url, key, { auth: { persistSession: false } });

function toE164(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  throw new Error(`Bad phone: ${phone}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function preloadPhoneIndex() {
  const index = new Map(); // e164 or digits → id
  let page = 1;
  const perPage = 1000;
  for (;;) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    for (const u of data.users) {
      if (!u.phone) continue;
      const e164 = u.phone.startsWith('+') ? u.phone : `+${u.phone}`;
      index.set(e164, u.id);
      index.set(e164.replace(/\D/g, ''), u.id);
    }
    if (data.users.length < perPage) break;
    page += 1;
    if (page > 100) break;
  }
  return index;
}

console.log('Preloading existing auth users…');
const phoneIndex = await preloadPhoneIndex();
console.log(`Indexed ${phoneIndex.size / 2} existing phones`);

const results = {
  created: 0,
  updated: 0,
  failed: [],
  ids_by_phone: {},
};

for (let i = 0; i < cohort.length; i++) {
  const u = cohort[i];
  const e164 = toE164(u.phone);
  const label = `${i + 1}/${cohort.length} ${u.role} ${u.first_name} ${u.last_name} ${e164}`;

  try {
    let id = phoneIndex.get(e164) || phoneIndex.get(e164.replace(/\D/g, '')) || null;
    let created = false;

    if (!id) {
      const { data: createdUser, error: createErr } = await sb.auth.admin.createUser({
        phone: e164,
        phone_confirm: true,
        user_metadata: {
          first_name: u.first_name,
          last_name: u.last_name,
          role: u.role,
          csv_sr: u.csv_sr,
        },
        app_metadata: {
          role: u.role,
          is_system: !!u.is_system,
        },
      });
      if (createErr) {
        // Race / already exists
        if (/already|registered|exists/i.test(createErr.message || '')) {
          const reloaded = await preloadPhoneIndex();
          id = reloaded.get(e164) || reloaded.get(e164.replace(/\D/g, ''));
          if (!id) throw createErr;
        } else {
          throw createErr;
        }
      } else {
        id = createdUser.user.id;
        created = true;
        phoneIndex.set(e164, id);
        phoneIndex.set(e164.replace(/\D/g, ''), id);
        await sleep(25);
      }
    }

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
    if (profileErr) throw profileErr;

    // Always sync assignment: upsert when scoped IDs present, else delete (Global)
    if (u.division_id || u.range_id || u.beat_id) {
      const isPrimary =
        (u.role === 'dfo' && !!u.division_id && !u.range_id && !u.beat_id) ||
        (u.role === 'range_officer' && !!u.range_id && !u.beat_id) ||
        (u.role === 'beat_guard' && !!u.beat_id);
      const { error: assignErr } = await sb.from('user_region_assignments').upsert(
        {
          user_id: id,
          division_id: u.division_id ?? null,
          range_id: u.range_id ?? null,
          beat_id: u.beat_id ?? null,
          is_primary_contact: isPrimary,
        },
        { onConflict: 'user_id' }
      );
      if (assignErr) throw assignErr;
    } else {
      const { error: delErr } = await sb
        .from('user_region_assignments')
        .delete()
        .eq('user_id', id);
      if (delErr) throw delErr;
    }

    results.ids_by_phone[u.phone] = id;
    if (created) results.created++;
    else results.updated++;
    if ((i + 1) % 25 === 0 || i === 0) console.log(`OK ${label}`);
  } catch (err) {
    console.error(`FAIL ${label}:`, err.message || err);
    results.failed.push({ phone: u.phone, name: `${u.first_name} ${u.last_name}`, error: String(err.message || err) });
  }
}

const outPath = file.replace(/\.json$/i, '.seed-results.json');
writeFileSync(
  outPath,
  JSON.stringify(
    {
      created: results.created,
      updated: results.updated,
      failed: results.failed,
      ids_by_phone: results.ids_by_phone,
    },
    null,
    2
  )
);

console.log(
  `\nDone. created=${results.created} updated=${results.updated} failed=${results.failed.length}`
);
console.log(`Results → ${outPath}`);
if (results.failed.length) process.exitCode = 1;
