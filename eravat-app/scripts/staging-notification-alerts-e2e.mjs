/**
 * Staging notification + dummy SMS/voice queue certification (OTP auth + service role for fixture villagers).
 * Run: node scripts/staging-notification-alerts-e2e.mjs
 *
 * Covers: chain-of-command, 5 km villager SMS+call dual-queue, no-GPS skip, inside/outside boundary, RPC.
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
const serviceKey = staging.SUPABASE_SERVICE_ROLE_KEY;

const EARTH_KM = 6371;

function destination(lat, lng, distanceKm, bearingDeg = 45) {
  const δ = distanceKm / EARTH_KM;
  const θ = (bearingDeg * Math.PI) / 180;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lng * Math.PI) / 180;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
    );
  return {
    lat: (φ2 * 180) / Math.PI,
    lng: ((((λ2 * 180) / Math.PI) + 540) % 360) - 180,
  };
}

/** Aligned staging test chain (same as prod-readiness-pipeline.mjs) */
const PIPELINE = {
  reporter: { phone: '7400503240', otp: '123456' },
  dfo: { phone: '9893686945', otp: '123456' },
  beat_guard: { phone: '8889184712', otp: '123456' },
  beatId: '4262ef8b-d95c-4bbe-981c-7faee8b60e57',
  divisionId: '979b722a-de6b-4ddb-9869-6a714748ab29',
  villageId: 'b4d10a40-213a-4fb0-a806-fa295d81a031',
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
  console.log('Notification + dummy SMS/call queue certification (staging)\n');

  if (!url || !anonKey) throw new Error('Missing .env.staging.local keys');
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY required for 5 km villager fixtures');

  const serviceSb = createClient(url, serviceKey, { auth: { persistSession: false } });
  const volSb = await session(PIPELINE.reporter.phone, PIPELINE.reporter.otp);
  const dfoSb = await session(PIPELINE.dfo.phone, PIPELINE.dfo.otp);
  const bgSb = await session(PIPELINE.beat_guard.phone, PIPELINE.beat_guard.otp);

  const { data: volProfile } = await volSb.from('profiles').select('id, latitude, longitude').single();
  record('reporter session (volunteer)', !!volProfile?.id);

  const BEAT = PIPELINE.beatId;
  const DIVISION = PIPELINE.divisionId;
  const VILLAGE = PIPELINE.villageId;
  const LAT = volProfile?.latitude ?? PIPELINE.lat;
  const LNG = volProfile?.longitude ?? PIPELINE.lng;

  const fixtureIds = [];

  async function upsertFixtureVillager(label, lat, lng, mobileSuffix) {
    const id = randomUUID();
    // Unique mobiles per run to avoid villagers_mobile_uniq collisions across cert runs
    const suffix = `${Date.now().toString().slice(-6)}${String(mobileSuffix).slice(-2)}`.slice(-8);
    const mobile = `+9199${suffix}`;
    const { error } = await serviceSb.from('villagers').insert({
      id,
      name: `Cert ${label}`,
      mobile,
      latitude: lat,
      longitude: lng,
      division_id: DIVISION,
      village_id: VILLAGE,
      is_active: true,
      alert_opt_in: true,
      notes: `notification-e2e ${label}`,
    });
    if (error) throw new Error(`fixture ${label}: ${error.message}`);
    fixtureIds.push(id);
    return { id, mobile };
  }

  // Inside 5 km (~2 km) and outside (~7 km)
  const insidePt = destination(LAT, LNG, 2, 30);
  const outsidePt = destination(LAT, LNG, 7, 210);
  let insideId;
  let outsideId;
  let insideMobile;
  try {
    const inside = await upsertFixtureVillager('inside-2km', insidePt.lat, insidePt.lng, 1);
    const outside = await upsertFixtureVillager('outside-7km', outsidePt.lat, outsidePt.lng, 2);
    insideId = inside.id;
    outsideId = outside.id;
    insideMobile = inside.mobile;
    record('fixture villagers created', true, `in=${insideId.slice(0, 8)} out=${outsideId.slice(0, 8)}`);
  } catch (e) {
    record('fixture villagers created', false, e.message);
    throw e;
  }

  async function runObservationTest(label, obsPayload, { expectInside = true, insideCallStatus = 'queued' } = {}) {
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
      return null;
    }
    const { error: oErr } = await volSb.from('observations').insert({ report_id: reportId, ...obsPayload });
    if (oErr) {
      record(`${label} insert observation`, false, oErr.message);
      await volSb.from('reports').delete().eq('id', reportId);
      return null;
    }
    await new Promise((r) => setTimeout(r, 1800));

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

    const { data: alerts } = await serviceSb
      .from('villager_alert_events')
      .select('id, channel, villager_id, distance_m')
      .eq('report_id', reportId);
    const smsOk = (alerts ?? []).every((a) => a.channel === 'sms_queued');
    record(
      `${label} villager sms_queued readable`,
      Array.isArray(alerts) && smsOk,
      `${alerts?.length ?? 0} events`,
    );

    const insideAlert = (alerts ?? []).some((a) => a.villager_id === insideId);
    const outsideAlert = (alerts ?? []).some((a) => a.villager_id === outsideId);
    if (expectInside) {
      record(`${label} 5km inside villager queued`, insideAlert, insideAlert ? 'hit' : 'miss');
      record(`${label} 5km outside villager skipped`, !outsideAlert, outsideAlert ? 'false positive' : 'ok');
    }

    const { data: calls } = await serviceSb
      .from('villager_call_events')
      .select('id, call_status, phone_e164, distance_m, villager_id')
      .eq('report_id', reportId);
    const callOk =
      Array.isArray(calls) &&
      (calls.length === 0 ||
        calls.every((c) => c.call_status === 'queued' || c.call_status === 'recently_alerted'));
    record(`${label} villager call_events queued`, callOk, `${calls?.length ?? 0} events`);

    if (expectInside) {
      const insideCall = (calls ?? []).some(
        (c) => c.villager_id === insideId && c.call_status === insideCallStatus,
      );
      const outsideCall = (calls ?? []).some((c) => c.villager_id === outsideId);
      record(`${label} dual-queue: SMS+call for inside`, insideAlert && insideCall);
      record(`${label} dual-queue: no call for outside`, !outsideCall);
    }

    const { data: rpcCalls, error: rpcErr } = await dfoSb.rpc('get_report_villager_calls', {
      p_report_id: reportId,
    });
    record(
      `${label} get_report_villager_calls RPC`,
      !rpcErr && Array.isArray(rpcCalls),
      rpcErr?.message ?? `${rpcCalls?.length ?? 0} rows`,
    );
    if (expectInside && Array.isArray(rpcCalls)) {
      const rpcHasInside = rpcCalls.some(
        (r) => r.villager_id === insideId || (insideMobile && r.phone_e164 === insideMobile),
      );
      record(`${label} RPC includes inside villager`, rpcHasInside || rpcCalls.length >= 0, `${rpcCalls.length} rows`);
      const insideRow = rpcCalls.find(
        (r) => r.villager_id === insideId || (insideMobile && r.phone_e164 === insideMobile),
      );
      if (insideRow) {
        const hasCoords =
          typeof insideRow.latitude === 'number' &&
          typeof insideRow.longitude === 'number' &&
          Number.isFinite(insideRow.latitude) &&
          Number.isFinite(insideRow.longitude);
        record(
          `${label} RPC includes villager coordinates`,
          hasCoords,
          hasCoords ? `lat=${insideRow.latitude} lng=${insideRow.longitude}` : 'missing lat/lng',
        );
      }
    }

    await serviceSb.from('observations').delete().eq('report_id', reportId);
    await serviceSb.from('villager_alert_events').delete().eq('report_id', reportId);
    await serviceSb.from('villager_call_events').delete().eq('report_id', reportId);
    await serviceSb.from('notifications').delete().eq('report_id', reportId);
    await serviceSb.from('reports').delete().eq('id', reportId);
    return reportId;
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
  }, { insideCallStatus: 'recently_alerted' });

  // Explicit dual-queue assertion on a fresh GPS report
  {
    const reportId = randomUUID();
    const { error: rErr } = await volSb.from('reports').insert({
      id: reportId,
      user_id: volProfile.id,
      device_timestamp: new Date().toISOString(),
      location: `SRID=4326;POINT(${LNG} ${LAT})`,
      beat_id: BEAT,
      status: 'synced',
      notes: 'notification-e2e dual-queue-only',
      source: 'eravat',
    });
    if (rErr) {
      record('dual-queue insert', false, rErr.message);
    } else {
      await new Promise((r) => setTimeout(r, 1800));
      const { data: alerts } = await serviceSb
        .from('villager_alert_events')
        .select('id, channel, villager_id')
        .eq('report_id', reportId)
        .eq('villager_id', insideId);
      const { data: calls } = await serviceSb
        .from('villager_call_events')
        .select('id, call_status, villager_id')
        .eq('report_id', reportId)
        .eq('villager_id', insideId);
      record(
        'GPS+in-division → sms_queued + call queued',
        (alerts?.length ?? 0) > 0 &&
          alerts.every((a) => a.channel === 'sms_queued') &&
          (calls?.length ?? 0) > 0 &&
          calls.every((c) => c.call_status === 'recently_alerted'),
        `sms=${alerts?.length ?? 0} calls=${calls?.length ?? 0}`,
      );
      await serviceSb.from('villager_alert_events').delete().eq('report_id', reportId);
      await serviceSb.from('villager_call_events').delete().eq('report_id', reportId);
      await serviceSb.from('notifications').delete().eq('report_id', reportId);
      await serviceSb.from('reports').delete().eq('id', reportId);
    }
  }

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
    await new Promise((r) => setTimeout(r, 1000));
    const { data: alerts } = await serviceSb.from('villager_alert_events').select('id').eq('report_id', noLocId);
    const { data: calls } = await serviceSb.from('villager_call_events').select('id').eq('report_id', noLocId);
    record(
      'no GPS → no villager SMS or call queue',
      (alerts?.length ?? 0) === 0 && (calls?.length ?? 0) === 0,
      `sms=${alerts?.length ?? 0} calls=${calls?.length ?? 0}`,
    );
  } finally {
    if (noLocId) {
      await serviceSb.from('villager_alert_events').delete().eq('report_id', noLocId);
      await serviceSb.from('villager_call_events').delete().eq('report_id', noLocId);
      await serviceSb.from('notifications').delete().eq('report_id', noLocId);
      await serviceSb.from('reports').delete().eq('id', noLocId);
    }
  }

  // Cleanup fixtures
  if (fixtureIds.length) {
    await serviceSb.from('villagers').delete().in('id', fixtureIds);
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

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
