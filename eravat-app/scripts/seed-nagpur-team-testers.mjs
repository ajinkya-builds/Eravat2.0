/**
 * Seed the Nagpur / Seoni / Pachmarhi test cohort on staging.
 * OTP = 48 + last 4 digits of the phone (e.g. 9890916713 → 486713).
 *
 * Roles are spread so the group together covers every app role and a
 * two-division field chain (South Balaghat + Satna).
 *
 * Usage (from eravat-app):
 *   node --env-file=.env.staging.local scripts/seed-nagpur-team-testers.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../../Go live Prep - Staging/generated/nagpur-team');

const SOUTH_BALAGHAT = '1bfff967-20d6-48c6-8f21-13d3b108fcdf';
const SATNA = '32dcf6c1-cb09-42c0-8739-cb6c002c02b9';

const RANGE = {
  balaghat: 'f7a0253a-896e-4d01-b389-a0dce7ee7aed',
  eastLanji: 'd2597e09-863e-4e0f-8ce7-1440d2157a65',
  hatta: 'fd69b2a7-723a-4ce8-a1be-3e5d878ee12c',
  kirnapur: '5a1bd1ba-4baf-4ecf-b87b-128b05b08cea',
  amarpatan: '18c6ce40-25c3-438a-ba96-2ea35af37bea',
  barondha: '2da09fda-9211-49c9-8cd8-a74a0788925b',
};

const BEAT = {
  agarwada: '37d78b0a-5584-4dd8-8492-05ae576724d6',
  balaghatI: 'f6859d85-0c25-4812-962a-54c2f2d60fad',
  bodadalkha: 'f64a9adc-143c-4ec6-9ff9-8216ba49eeeb',
  chilora: '6ca06bbf-2eb5-4bfd-91b1-b485a73f4aaf',
  bhagatpur: 'e861f56f-a0f6-4de1-a917-cc39d822ca46',
  dongargaon: '33281294-2fd8-4d6c-88af-78a81b1f1406',
  atariya: 'aa8eaab0-eb6e-4d5a-9ad1-4017ee6e714f',
  bagdari: '40adcd9a-5204-4caa-8183-6d2911a23046',
  baroundha: 'c402e0fc-4de4-45d0-88d5-0157de2be5ca',
};

const GPS = {
  nagpur: { latitude: 21.1458, longitude: 79.0882 },
  balaghat: { latitude: 21.8129, longitude: 80.1838 },
  satna: { latitude: 24.5298, longitude: 80.831 },
};

function person(phone, first, last, role, territory, gps, notes) {
  return {
    phone,
    first_name: first,
    last_name: last,
    role,
    division_id: territory?.division_id ?? null,
    range_id: territory?.range_id ?? null,
    beat_id: territory?.beat_id ?? null,
    division_name: territory?.division_name ?? 'State',
    range_name: territory?.range_name ?? '',
    beat_name: territory?.beat_name ?? '',
    ...gps,
    notes: notes ?? '',
  };
}

const bal = (rangeId, rangeName, beatId, beatName) => ({
  division_id: SOUTH_BALAGHAT,
  division_name: 'South Balaghat',
  range_id: rangeId,
  range_name: rangeName,
  beat_id: beatId ?? null,
  beat_name: beatName ?? '',
});

const sat = (rangeId, rangeName, beatId, beatName) => ({
  division_id: SATNA,
  division_name: 'Satna',
  range_id: rangeId,
  range_name: rangeName,
  beat_id: beatId ?? null,
  beat_name: beatName ?? '',
});

/** One account per sheet row, plus Munna's second number as Kirnapur beat guard. */
const ROSTER = [
  person('9890916713', 'Aditya', 'S Joshi', 'admin', null, GPS.nagpur, 'Command Center, all divisions'),
  person('7972866568', 'Anooj', 'Alukathra', 'ccf', null, GPS.nagpur, 'State command, all divisions'),
  person('8452043395', 'Vikrant', 'Shashikant Jathar', 'biologist', null, GPS.nagpur, 'All reports, no Command Center'),
  person('9158666221', 'Jayeshkumar', 'Kolhe', 'veterinarian', null, GPS.nagpur, 'All reports, no Command Center'),

  person('9730885744', 'Vivek', 'M Tumsare', 'dfo', bal(null, '', null, ''), GPS.balaghat, 'South Balaghat division head'),
  person('7721052439', 'Munna', 'Madhukar Bramhankar', 'rrt', bal(null, '', null, ''), GPS.balaghat, 'South Balaghat rapid response'),

  person('8261093483', 'Sandeep', 'Hardeo Tekam', 'range_officer', bal(RANGE.balaghat, 'Balaghat'), GPS.balaghat),
  person('7218469381', 'Suraj', 'Haridas Meshram', 'beat_guard', bal(RANGE.balaghat, 'Balaghat', BEAT.agarwada, 'Agarwada'), GPS.balaghat),
  person('7820966249', 'Sanskar', 'Sushil Dhamdar', 'volunteer', bal(RANGE.balaghat, 'Balaghat', BEAT.agarwada, 'Agarwada'), GPS.balaghat),
  person('7767988258', 'Hitesh', 'Pawan Chute', 'beat_guard', bal(RANGE.balaghat, 'Balaghat', BEAT.balaghatI, 'Balaghat I'), GPS.balaghat),
  person('7498579415', 'Nilesh', 'Nagpure', 'volunteer', bal(RANGE.balaghat, 'Balaghat', BEAT.balaghatI, 'Balaghat I'), GPS.balaghat),

  person('9623120800', 'Rahul', 'Vijayrao Deshmukh', 'range_officer', bal(RANGE.eastLanji, 'East Lanji'), GPS.balaghat),
  person('8698405776', 'Swapnil', 'Ashok Badhekar', 'beat_guard', bal(RANGE.eastLanji, 'East Lanji', BEAT.bodadalkha, 'Bodadalkha_Sarrasethi I'), GPS.balaghat),
  person('9021958838', 'Prajwal', 'Suresh Raut', 'volunteer', bal(RANGE.eastLanji, 'East Lanji', BEAT.bodadalkha, 'Bodadalkha_Sarrasethi I'), GPS.balaghat),
  person('7030436520', 'Sanjay', 'Pabhakar Wasake', 'beat_guard', bal(RANGE.eastLanji, 'East Lanji', BEAT.chilora, 'Chilora_Jaitpuri'), GPS.balaghat),
  person('9763200432', 'Manoj', 'Meshram', 'volunteer', bal(RANGE.eastLanji, 'East Lanji', BEAT.chilora, 'Chilora_Jaitpuri'), GPS.balaghat),

  person('9307700187', 'Pratik', 'Vijay Rangari', 'range_officer', bal(RANGE.hatta, 'Hatta'), GPS.balaghat),
  person('7719910346', 'Ayush', 'Purshottam Kohale', 'beat_guard', bal(RANGE.hatta, 'Hatta', BEAT.bhagatpur, 'Bhagatpur'), GPS.balaghat),
  person('7038470161', 'Gaurisudan', 'Mendhe', 'volunteer', bal(RANGE.hatta, 'Hatta', BEAT.bhagatpur, 'Bhagatpur'), GPS.balaghat),
  person('9356716837', 'Rabbani', 'Hanif Shaikh', 'beat_guard', bal(RANGE.hatta, 'Hatta', BEAT.dongargaon, 'Dongargaon'), GPS.balaghat),
  person('9112074349', 'Rahul', 'Rajkumar Uikey', 'volunteer', bal(RANGE.hatta, 'Hatta', BEAT.dongargaon, 'Dongargaon'), GPS.balaghat),

  person('8169321069', 'Lalit', 'Jadhav', 'range_officer', bal(RANGE.kirnapur, 'Kirnapur'), GPS.balaghat),
  person('9373069605', 'Munna', 'Madhukar Bramhankar', 'beat_guard', bal(RANGE.kirnapur, 'Kirnapur', BEAT.atariya, 'Atariya'), GPS.balaghat, 'Second number on the sheet'),

  person('9673392670', 'Rajesh', 'Bhendarkar', 'dfo', sat(null, '', null, ''), GPS.satna, 'Satna division — Seoni team'),
  person('7067553727', 'Rahul', 'Suresh Kshirsagar', 'rrt', sat(null, '', null, ''), GPS.satna, 'Satna rapid response'),
  person('9370306278', 'Yogesh', 'Dhanraj Mendhe', 'range_officer', sat(RANGE.amarpatan, 'Amarpatan'), GPS.satna),
  person('8767590856', 'Dhananjay', 'Naresh Chandewar', 'beat_guard', sat(RANGE.amarpatan, 'Amarpatan', BEAT.bagdari, 'Bagdari'), GPS.satna),
  person('7066211274', 'Swapnil', 'Vishnuji Meshram', 'volunteer', sat(RANGE.amarpatan, 'Amarpatan', BEAT.bagdari, 'Bagdari'), GPS.satna),
  person('8080322645', 'Bhushan', 'Dudhram Bhoyar', 'range_officer', sat(RANGE.barondha, 'Barondha'), GPS.satna),
  person('7620565125', 'Sachin', 'Walmik Raut', 'beat_guard', sat(RANGE.barondha, 'Barondha', BEAT.baroundha, 'Baroundha'), GPS.satna),
  person('9765362160', 'Fanindra', 'Sonwane', 'volunteer', sat(RANGE.barondha, 'Barondha', BEAT.baroundha, 'Baroundha'), GPS.satna),
];

function otpForPhone(phone10) {
  return `48${String(phone10).slice(-4)}`;
}

function toE164(phone10) {
  return `+91${phone10}`;
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!url.includes('ttjtyvxfiqhjdngkgdkf')) {
  console.error('Refusing to seed: URL is not the staging project');
  process.exit(1);
}

const seed = ROSTER.map((u) => ({ ...u, otp: otpForPhone(u.phone), test_otp_key: `91${u.phone}` }));
const phones = new Set(seed.map((u) => u.phone));
const otps = new Set(seed.map((u) => u.otp));
if (phones.size !== seed.length || otps.size !== seed.length) {
  console.error('Duplicate phone or OTP in roster');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

async function preloadPhoneIndex() {
  const index = new Map();
  let page = 1;
  for (;;) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data.users) {
      if (!u.phone) continue;
      index.set(String(u.phone).replace(/\D/g, '').slice(-10), u.id);
    }
    if (data.users.length < 1000) break;
    page += 1;
  }
  return index;
}

console.log(`Seeding ${seed.length} Nagpur-team testers on staging…`);
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
    } else {
      const { error } = await sb.auth.admin.updateUserById(id, {
        phone: e164,
        phone_confirm: true,
        user_metadata: { first_name: u.first_name, last_name: u.last_name, role: u.role },
        app_metadata: { role: u.role },
      });
      if (error) throw error;
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
        { onConflict: 'user_id' },
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

mkdirSync(OUT_DIR, { recursive: true });
const manifest = seed.map((u) => ({
  name: `${u.first_name} ${u.last_name}`,
  role: u.role,
  phone_app: u.phone,
  test_otp_key: u.test_otp_key,
  otp: u.otp,
  division: u.division_name,
  range: u.range_name,
  beat: u.beat_name,
  notes: u.notes,
}));
writeFileSync(join(OUT_DIR, 'nagpur-team-otp-manifest.json'), JSON.stringify(manifest, null, 2));
writeFileSync(join(OUT_DIR, 'nagpur-team-seed-results.json'), JSON.stringify(results, null, 2));
console.log(`\nDone created=${results.created} updated=${results.updated} failed=${results.failed.length}`);
if (results.failed.length) process.exitCode = 1;
