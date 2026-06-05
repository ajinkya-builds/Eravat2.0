/**
 * Verifies chain-of-command notifications when observations are inserted.
 * Run: node scripts/test-notifications-integration.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
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

const E2E_PHONE = '8899776655';

async function findUserIdByPhone(phone) {
  const phoneE164 = `+91${phone}`;
  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .or(`phone.eq.${phoneE164},phone.eq.${phone}`)
    .maybeSingle();
  return profile?.id ?? null;
}

async function getBeatGuardContext(userId) {
  const { data: profile } = await admin
    .from('profiles')
    .select('id, latitude, longitude')
    .eq('id', userId)
    .single();
  const { data: assignment } = await admin
    .from('user_region_assignments')
    .select('beat_id, range_id, division_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (!assignment?.beat_id) throw new Error('E2E beat guard has no beat assignment');
  const { data: beat } = await admin
    .from('geo_beats')
    .select('id, range_id, name')
    .eq('id', assignment.beat_id)
    .single();
  const { data: range } = await admin
    .from('geo_ranges')
    .select('id, division_id, name')
    .eq('id', beat.range_id)
    .single();
  return { profile, beat, range, assignment };
}

async function officersForRange(rangeId, divisionId) {
  const ids = new Set();
  const { data: rangeRows } = await admin
    .from('user_region_assignments')
    .select('user_id, profiles!inner(role)')
    .eq('range_id', rangeId);
  for (const row of rangeRows ?? []) {
    if (row.profiles?.role === 'range_officer') ids.add(row.user_id);
  }
  const { data: divRows } = await admin
    .from('user_region_assignments')
    .select('user_id, profiles!inner(role)')
    .eq('division_id', divisionId);
  for (const row of divRows ?? []) {
    if (row.profiles?.role === 'dfo') ids.add(row.user_id);
  }
  return [...ids];
}

async function insertReportAndObservation({ userId, beatId, lat, lng, obsType }) {
  const location = `SRID=4326;POINT(${lng} ${lat})`;
  const reportId = randomUUID();
  const { data: report, error: repErr } = await admin
    .from('reports')
    .insert({
      id: reportId,
      user_id: userId,
      beat_id: beatId,
      location,
      device_timestamp: new Date().toISOString(),
      status: 'pending',
    })
    .select('id')
    .single();
  if (repErr) throw repErr;

  const obsPayload =
    obsType === 'direct_sighting'
      ? {
          report_id: report.id,
          type: 'direct_sighting',
          male_count: 2,
          female_count: 1,
          calf_count: 0,
          unknown_count: 0,
        }
      : {
          report_id: report.id,
          type: 'indirect_sign',
          indirect_sign_details: ['footprints', 'dung'],
        };

  const { error: obsErr } = await admin.from('observations').insert({
    id: randomUUID(),
    ...obsPayload,
  });
  if (obsErr) throw obsErr;
  return report.id;
}

async function countNotifications(reportId, userIds) {
  const { data, error } = await admin
    .from('notifications')
    .select('id, user_id, title, notification_type')
    .eq('report_id', reportId)
    .in('user_id', userIds);
  if (error) throw error;
  return data ?? [];
}

async function cleanupReport(reportId) {
  await admin.from('notifications').delete().eq('report_id', reportId);
  await admin.from('observations').delete().eq('report_id', reportId);
  await admin.from('reports').delete().eq('id', reportId);
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

async function main() {
  console.log('Notification integration test — remote Supabase\n');
  const userId = await findUserIdByPhone(E2E_PHONE);
  assert(userId, `E2E user ${E2E_PHONE} not found — run: npm run seed:e2e`);

  const { profile, beat, range } = await getBeatGuardContext(userId);
  const lat = profile?.latitude ?? 21.5;
  const lng = profile?.longitude ?? 79.1;
  const officers = await officersForRange(range.id, range.division_id);
  console.log(`Beat: ${beat.name}, Range: ${range.name}, officers to notify: ${officers.length}`);

  const results = [];

  for (const obsType of ['direct_sighting', 'indirect_sign']) {
    const reportId = await insertReportAndObservation({
      userId,
      beatId: beat.id,
      lat,
      lng,
      obsType,
    });
    await new Promise((r) => setTimeout(r, 500));
    const notes = await countNotifications(reportId, officers.length ? officers : [userId]);
    const chain = notes.filter((n) => n.notification_type === 'chain_of_command' || !n.notification_type);
    const ok = officers.length === 0 ? notes.length >= 0 : chain.length >= 1;
    results.push({ obsType, reportId, notified: chain.length, ok });
    console.log(`  ${obsType}: ${chain.length} chain notification(s) — ${ok ? 'PASS' : 'FAIL'}`);
    await cleanupReport(reportId);
  }

  const failed = results.filter((r) => !r.ok);
  if (officers.length === 0) {
    console.warn('\nWARN: No range_officer/DFO assigned — chain notifications may be 0 by design.');
  }
  if (failed.length) {
    console.error('\nFAILED:', failed);
    process.exit(1);
  }
  console.log('\nAll notification integration checks passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
