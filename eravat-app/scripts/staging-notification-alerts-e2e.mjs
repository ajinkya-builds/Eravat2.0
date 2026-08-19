/**
 * Staging notification + dummy SMS/voice queue certification (OTP auth, no service role).
 * Run: node scripts/staging-notification-alerts-e2e.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '../../Go live Prep - Staging/generated/notification-alerts-e2e');

function loadEnv(relativePath) {
  try {
    return Object.fromEntries(
      readFileSync(join(__dirname, relativePath), 'utf8')
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

const staging = loadEnv('../.env.staging.local');
const url = staging.VITE_SUPABASE_URL;
const anonKey = staging.VITE_SUPABASE_PUBLISHABLE_KEY;

/** Aligned staging test chain (same as prod-readiness-pipeline.mjs) */
const PIPELINE = {
  reporter: { phone: '7400503240', otp: '123456' },
  dfo: { phone: '9893686945', otp: '123456' },
  beat_guard: { phone: '8889184712', otp: '123456' },
  beatId: '4262ef8b-d95c-4bbe-981c-7faee8b60e57',
  lat: 23.857845625031,
  lng: 81.038319794626,
};

function e164(p) {
  return `+91${String(p).replace(/\D/g, '').slice(-10)}`;
}

async function session(phone, otp) {
  const base = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  await base.auth.signInWithOtp({ phone: e164(phone) }).catch(() => {});
  const { data, error } = await base.auth.verifyOtp({ phone: e164(phone), token: otp, type: 'sms' });
  if (error || !data.session) throw error || new Error(`OTP failed ${phone}`);
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    auth: { persistSession: false },
  });
}

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  console.log('Notification + dummy SMS queue certification (staging)\n');

  const volSb = await session(PIPELINE.reporter.phone, PIPELINE.reporter.otp);
  const dfoSb = await session(PIPELINE.dfo.phone, PIPELINE.dfo.otp);
  const bgSb = await session(PIPELINE.beat_guard.phone, PIPELINE.beat_guard.otp);

  const { data: volProfile } = await volSb.from('profiles').select('id, latitude, longitude').single();

  record('reporter session (volunteer)', !!volProfile?.id);

  const BEAT = PIPELINE.beatId;
  const LAT = volProfile?.latitude ?? PIPELINE.lat;
  const LNG = volProfile?.longitude ?? PIPELINE.lng;

  async function runObservationTest(label, obsPayload) {
    const reportId = randomUUID();
    const { error: rErr } = await volSb.from('reports').insert({
      id: reportId,
      user_id: volProfile.id,
      device_timestamp: new Date().toISOString(),
      location: `SRID=4326;POINT(${LNG} ${LAT})`,
      beat_id: BEAT,
      status: 'synced',
      notes: `notification-e2e ${label}`,
      source: 'eravat',
    });
    if (rErr) {
      record(`${label} insert report`, false, rErr.message);
      return;
    }
    const { error: oErr } = await volSb.from('observations').insert({ report_id: reportId, ...obsPayload });
    if (oErr) {
      record(`${label} insert observation`, false, oErr.message);
      await volSb.from('reports').delete().eq('id', reportId);
      return;
    }
    await new Promise((r) => setTimeout(r, 1500));

    const { data: dfoN } = await dfoSb
      .from('notifications')
      .select('id, title, notification_type')
      .eq('report_id', reportId)
      .eq('notification_type', 'chain_of_command');
    const { data: bgN } = await bgSb
      .from('notifications')
      .select('id, title, notification_type')
      .eq('report_id', reportId)
      .eq('notification_type', 'chain_of_command');

    record(`${label} chain → DFO`, (dfoN?.length ?? 0) > 0, dfoN?.[0]?.title ?? 'none');
    record(`${label} chain → beat_guard`, (bgN?.length ?? 0) > 0, bgN?.[0]?.title ?? 'none');

    const { data: alerts } = await bgSb.from('villager_alert_events').select('id, channel, distance_m').eq('report_id', reportId);
    record(`${label} villager sms_queued readable`, Array.isArray(alerts), `${alerts?.length ?? 0} events`);

    await volSb.from('reports').delete().eq('id', reportId);
  }

  await runObservationTest('direct_sighting', {
    type: 'direct_sighting',
    male_count: 2,
    female_count: 1,
    calf_count: 0,
    unknown_count: 0,
    total_elephants: 3,
  });

  await runObservationTest('indirect_sign', {
    type: 'indirect_sign',
    indirect_sign_details: ['footprints', 'dung'],
  });

  let noLocId;
  try {
    noLocId = randomUUID();
    await volSb.from('reports').insert({
      id: noLocId,
      user_id: volProfile.id,
      beat_id: BEAT,
      device_timestamp: new Date().toISOString(),
      status: 'synced',
      notes: 'no-gps test',
    });
    await new Promise((r) => setTimeout(r, 800));
    const { data: alerts } = await bgSb.from('villager_alert_events').select('id').eq('report_id', noLocId);
    record('no GPS → no villager queue', (alerts?.length ?? 0) === 0, `${alerts?.length ?? 0} events`);
  } finally {
    if (noLocId) await volSb.from('reports').delete().eq('id', noLocId);
  }

  const failed = results.filter((r) => !r.ok);
  const summary = {
    ranAt: new Date().toISOString(),
    total: results.length,
    passed: results.filter((r) => r.ok).length,
    failed: failed.length,
    ok: failed.length === 0,
    results,
  };
  writeFileSync(join(OUT, 'results.json'), JSON.stringify(summary, null, 2));
  console.log(`\n${summary.passed}/${summary.total} passed`);
  process.exit(summary.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
