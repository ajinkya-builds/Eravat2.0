/**
 * Seed UAT testers from Go-live CSV → staging auth + profiles + assignments.
 * Generates unique Test OTP per phone: 48 + last 4 digits (e.g. 9752458789 → 488789).
 *
 * Usage:
 *   SUPABASE_URL=https://ttjtyvxfiqhjdngkgdkf.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/seed-uat-testers-from-sheet.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_PATH = resolve(
  __dirname,
  '../../Go live Prep - Staging/Eravat 2.0 Testers_List and Details.xlsx - Sheet1.csv'
);
const OUT_DIR = resolve(__dirname, '../../Go live Prep - Staging/generated/uat-testers');

const DIVISION = {
  Anuppur: '597dc966-70d7-450c-be64-6564fd766f55',
  'Bandhavgarh NP': '979b722a-de6b-4ddb-9869-6a714748ab29',
  'North Shahdol': '6536f2ee-53a9-452f-8b1d-2da1089d44b0',
  'Sanjay National Park': '45792010-51f2-4883-ba6e-c714787dd57c',
  Umaria: '444cc20f-008d-4dee-9499-0a10ccedb5e0',
};

const RANGE = {
  Anuppur: 'a5bbb48e-1d00-4e98-92a8-478331221d3e',
  Jaithari: '8425c8af-ba84-414a-bab7-fa0ddb5dbb9b',
  'Kallwah Core': 'd5bade26-4d54-4343-a02d-dec7d1776601',
  'Khitauli Core': 'dee0382e-c898-4155-b0ef-06e74ef9f7b9',
  'Magdhi Core': '940fe19b-c82b-4eb7-a86b-c1d32c3e6a9c',
  'Panpatha Buffer': '228ee9d5-e263-4b4d-a1b0-ba9665745a86',
  'Beohari West': '16354830-d28c-4d16-982d-678aa003c42c',
  Pondi: 'aff08c44-b0d9-4598-97f3-d46777f1f3cf',
  Chandia: 'a322f2b2-35bc-4eb6-9a97-2248089b1d89',
  Ahirgawa: 'ffe3add8-3129-4ec0-b1a9-d88568519149',
};

const BEAT = {
  Jamudi: '31442ddc-2e14-4f33-ba8e-710555c19eb1',
  Jhiriya: '92a0b502-5195-4cc2-a9d3-03679544d7e7',
  Madai: '18e5a6c4-ea65-4ce5-99b5-e6dc6a9518f2',
  'Mahainwah North': 'cf4ccf02-a441-48c2-8baf-665c1fbece00',
  Dhatura: '5a1b54bb-55c8-486c-b916-8b1781ba398d',
};

/** CSV division label → DB division name */
function mapDivision(csv) {
  const d = String(csv || '').trim();
  if (!d || d.toUpperCase() === 'NA') return null;
  if (/bandh/i.test(d)) return 'Bandhavgarh NP';
  if (/sanjay/i.test(d)) return 'Sanjay National Park';
  if (/north shahdol/i.test(d)) return 'North Shahdol';
  if (/umaria/i.test(d)) return 'Umaria';
  if (/anuppur/i.test(d)) return 'Anuppur';
  return null;
}

function otpForPhone(phone10) {
  const digits = String(phone10).replace(/\D/g, '').slice(-10);
  return `48${digits.slice(-4)}`;
}

function toE164(phone10) {
  const d = String(phone10).replace(/\D/g, '').slice(-10);
  return `+91${d}`;
}

/** Territory presets aligned with existing staging assignments where known */
const TERRITORY_BY_PHONE = {
  '9752458789': { division_id: DIVISION.Anuppur, range_id: RANGE.Jaithari, beat_id: null },
  '7415740750': { division_id: DIVISION.Anuppur, range_id: RANGE.Anuppur, beat_id: BEAT.Jamudi },
  '8770984995': { division_id: DIVISION.Anuppur, range_id: RANGE.Jaithari, beat_id: null },
  '9752552212': { division_id: DIVISION['Bandhavgarh NP'], range_id: RANGE['Magdhi Core'], beat_id: null },
  '7772067087': { division_id: DIVISION['Bandhavgarh NP'], range_id: RANGE['Kallwah Core'], beat_id: null },
  '6261890445': { division_id: DIVISION['Bandhavgarh NP'], range_id: RANGE['Panpatha Buffer'], beat_id: null },
  '9009319067': { division_id: DIVISION['Bandhavgarh NP'], range_id: RANGE['Kallwah Core'], beat_id: BEAT['Mahainwah North'] },
  '7566246445': { division_id: DIVISION['North Shahdol'], range_id: RANGE['Beohari West'], beat_id: BEAT.Jhiriya },
  '9340983708': { division_id: DIVISION['North Shahdol'], range_id: RANGE['Beohari West'], beat_id: null },
  '6265182717': { division_id: DIVISION['North Shahdol'], range_id: RANGE['Beohari West'], beat_id: null },
  '8120973941': { division_id: DIVISION['North Shahdol'], range_id: RANGE['Beohari West'], beat_id: BEAT.Madai },
  '9009603210': { division_id: DIVISION['Sanjay National Park'], range_id: RANGE.Pondi, beat_id: null },
  '7089967800': { division_id: DIVISION.Umaria, range_id: RANGE.Chandia, beat_id: BEAT.Dhatura },
  '9516084467': { division_id: DIVISION['Bandhavgarh NP'], range_id: RANGE['Khitauli Core'], beat_id: null },
  '9165327539': { division_id: DIVISION.Anuppur, range_id: RANGE.Ahirgawa, beat_id: null },
  '8250463914': { division_id: DIVISION.Anuppur, range_id: null, beat_id: null },
  '9238583474': { division_id: null, range_id: null, beat_id: null },
  '9545893779': { division_id: null, range_id: null, beat_id: null },
  '8319714182': { division_id: DIVISION.Anuppur, range_id: RANGE.Anuppur, beat_id: null },
};

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(',');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length < 7) continue;
    const phone = parts[5]?.trim().replace(/\D/g, '').slice(-10);
    if (!phone || phone.length !== 10) continue;
    rows.push({
      sr: parts[0]?.trim(),
      first_name: parts[1]?.trim(),
      last_name: parts[2]?.trim(),
      post: parts[3]?.trim(),
      division_csv: parts[4]?.trim(),
      phone,
      role: parts[6]?.trim(),
      device: parts[7]?.trim() || '',
      android: parts[8]?.trim() || '',
    });
  }
  const byPhone = new Map();
  for (const row of rows) {
    if (!byPhone.has(row.phone)) byPhone.set(row.phone, row);
  }
  return [...byPhone.values()];
}

function resolveRole(row) {
  if (/dy\s*ro|range officer/i.test(row.post)) return 'range_officer';
  return row.role;
}

function buildSeedEntry(row) {
  const phone = row.phone;
  const role = resolveRole(row);
  const territory = TERRITORY_BY_PHONE[phone] || {};
  const divName = mapDivision(row.division_csv);
  if (divName && !territory.division_id) {
    territory.division_id = DIVISION[divName];
    if (role === 'beat_guard' && divName === 'Anuppur') {
      territory.range_id = RANGE.Anuppur;
    }
  }
  return {
    csv_sr: row.sr,
    phone,
    role,
    first_name: row.first_name,
    last_name: row.last_name,
    post_raw: row.post,
    division_name: divName,
    otp: otpForPhone(phone),
    test_otp_key: `91${phone}`,
    device: row.device,
    android: row.android,
    latitude: 23.2599,
    longitude: 77.4126,
    division_id: territory.division_id ?? null,
    range_id: territory.range_id ?? null,
    beat_id: territory.beat_id ?? null,
  };
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const csvText = readFileSync(CSV_PATH, 'utf8');
const rows = parseCsv(csvText);
const seed = rows.map(buildSeedEntry);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'uat-testers.seed.json'), JSON.stringify(seed, null, 2));

const otpManifest = seed.map((u) => ({
  name: `${u.first_name} ${u.last_name}`,
  role: u.role,
  phone_app: u.phone,
  test_otp_key: u.test_otp_key,
  otp: u.otp,
  division: u.division_name || 'Global',
  device: u.device,
}));
writeFileSync(join(OUT_DIR, 'uat-testers-otp-manifest.json'), JSON.stringify(otpManifest, null, 2));

const sb = createClient(url, key, { auth: { persistSession: false } });

async function preloadPhoneIndex() {
  const index = new Map();
  let page = 1;
  for (;;) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data.users) {
      if (!u.phone) continue;
      const e164 = u.phone.startsWith('+') ? u.phone : `+${u.phone}`;
      index.set(e164.replace(/\D/g, '').slice(-10), u.id);
    }
    if (data.users.length < 1000) break;
    page += 1;
  }
  return index;
}

console.log(`Seeding ${seed.length} UAT testers…`);
const phoneIndex = await preloadPhoneIndex();
const results = { created: 0, updated: 0, failed: [] };

for (const u of seed) {
  const e164 = toE164(u.phone);
  const label = `${u.role} ${u.first_name} ${u.last_name} (${u.phone})`;
  try {
    let id = phoneIndex.get(u.phone) ?? null;
    let created = false;
    if (!id) {
      const { data, error } = await sb.auth.admin.createUser({
        phone: e164,
        phone_confirm: true,
        user_metadata: { first_name: u.first_name, last_name: u.last_name, role: u.role },
        app_metadata: { role: u.role },
      });
      if (error) throw error;
      id = data.user.id;
      phoneIndex.set(u.phone, id);
      created = true;
    }

    const { error: profileErr } = await sb.from('profiles').upsert({
      id,
      first_name: u.first_name,
      last_name: u.last_name,
      phone: e164,
      role: u.role,
      is_active: true,
      latitude: u.latitude,
      longitude: u.longitude,
      location_updated_at: new Date().toISOString(),
      notification_radius_km: 10,
    });
    if (profileErr) throw profileErr;

    if (u.division_id || u.range_id || u.beat_id) {
      const { error: assignErr } = await sb.from('user_region_assignments').upsert(
        {
          user_id: id,
          division_id: u.division_id,
          range_id: u.range_id,
          beat_id: u.beat_id,
          is_primary_contact: u.role === 'beat_guard' && !!u.beat_id,
        },
        { onConflict: 'user_id' }
      );
      if (assignErr) throw assignErr;
    } else {
      await sb.from('user_region_assignments').delete().eq('user_id', id);
    }

    if (created) results.created++;
    else results.updated++;
    console.log(`OK ${label} OTP=${u.otp}`);
  } catch (err) {
    console.error(`FAIL ${label}:`, err.message || err);
    results.failed.push({ phone: u.phone, error: String(err.message || err) });
  }
}

writeFileSync(join(OUT_DIR, 'uat-testers.seed-results.json'), JSON.stringify(results, null, 2));
console.log(`\nDone created=${results.created} updated=${results.updated} failed=${results.failed.length}`);
console.log(`OTP manifest → ${join(OUT_DIR, 'uat-testers-otp-manifest.json')}`);
if (results.failed.length) process.exitCode = 1;
