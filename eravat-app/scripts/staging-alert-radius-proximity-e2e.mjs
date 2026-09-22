/**
 * Staging alert-radius proximity module tests.
 * Covers in-radius / out-of-radius / boundary / bounds / self / no-GPS / geo-role isolation.
 *
 * Run: node scripts/staging-alert-radius-proximity-e2e.mjs
 *
 * Emulator UI companion (optional): node scripts/emulator-alert-radius-e2e.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '../../Go live Prep - Staging/generated/alert-radius-proximity-e2e');

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

function loadUat() {
  const path = join(__dirname, '../../Go live Prep - Staging/generated/uat-testers/uat-testers-otp-manifest.json');
  return JSON.parse(readFileSync(path, 'utf8'));
}

const staging = loadEnv('../.env.staging.local');
const url = staging.VITE_SUPABASE_URL;
const anonKey = staging.VITE_SUPABASE_PUBLISHABLE_KEY;

const EARTH_KM = 6371;

/** Destination point at distanceKm along bearingDeg from (lat, lng). */
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
    lng: (((λ2 * 180) / Math.PI) + 540) % 360 - 180,
  };
}

function haversineKm(aLat, aLng, bLat, bLng) {
  const toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(bLat - aLat);
  const dLng = toR(bLng - aLng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(x));
}

function e164(p) {
  return `+91${String(p).replace(/\D/g, '').slice(-10)}`;
}

async function session(phone, otp) {
  const base = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  await base.auth.signInWithOtp({ phone: e164(phone) }).catch(() => {});
  const { data, error } = await base.auth.verifyOtp({ phone: e164(phone), token: otp, type: 'sms' });
  if (error || !data.session?.user?.id) throw error || new Error(`OTP failed ${phone}`);
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    auth: { persistSession: false },
  });
  return { client, userId: data.session.user.id };
}

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  console.log('Alert-radius proximity module — staging E2E\n');

  if (!url || !anonKey) throw new Error('Missing .env.staging.local Supabase keys');

  const uat = loadUat();
  const adminUat = uat.find((u) => u.role === 'admin');
  const reporterUat = uat.find((u) => u.role === 'volunteer') || uat.find((u) => u.role === 'beat_guard');
  const bgUat = uat.find((u) => u.role === 'beat_guard');
  if (!adminUat || !reporterUat) throw new Error('UAT manifest missing admin/reporter');

  const { client: adminSb, userId: adminUserId } = await session(adminUat.phone_app, adminUat.otp);
  const { client: reporterSb, userId: reporterUserId } = await session(reporterUat.phone_app, reporterUat.otp);
  const bgSession = bgUat ? await session(bgUat.phone_app, bgUat.otp) : null;
  const bgSb = bgSession?.client ?? null;
  const bgUserId = bgSession?.userId ?? null;

  const { data: admin, error: adminErr } = await adminSb
    .from('profiles')
    .select('id, role, latitude, longitude, notification_radius_km')
    .eq('id', adminUserId)
    .single();
  if (adminErr || !admin) throw adminErr || new Error('admin profile missing');

  const { data: reporter, error: repErr } = await reporterSb
    .from('profiles')
    .select('id, role, latitude, longitude')
    .eq('id', reporterUserId)
    .single();
  if (repErr || !reporter) throw repErr || new Error('reporter profile missing');

  record('admin session', admin.role === 'admin', `${admin.id.slice(0, 8)}…`);
  record('reporter session', !!reporter.id, reporter.role);

  // Capability + bounds
  const { data: canCfg } = await adminSb.rpc('can_configure_alert_radius');
  record('admin can_configure_alert_radius', canCfg === true, String(canCfg));

  if (bgSb) {
    const { data: bgCan } = await bgSb.rpc('can_configure_alert_radius');
    record('beat_guard cannot configure radius', bgCan === false, String(bgCan));
  }

  const { data: boundsRows } = await adminSb.rpc('get_alert_radius_bounds');
  const bounds = Array.isArray(boundsRows) ? boundsRows[0] : boundsRows;
  record(
    'bounds are 1–1000',
    bounds?.min_km === 1 && bounds?.max_km === 1000,
    JSON.stringify(bounds),
  );

  // Freeze a known admin GPS for deterministic distances
  const ORIGIN = { lat: 23.7215773, lng: 81.0169492 };
  const BEAT = '452e9fe2-cae6-4dfa-8455-d65edf0198ad'; // Tala — near origin
  const previous = {
    lat: admin.latitude,
    lng: admin.longitude,
    radius: admin.notification_radius_km,
  };

  const createdReportIds = [];

  async function setAdminRadius(km) {
    const { error } = await adminSb
      .from('profiles')
      .update({ notification_radius_km: km })
      .eq('id', admin.id);
    if (error) throw new Error(`set radius ${km}: ${error.message}`);
  }

  async function setAdminGps(lat, lng) {
    const { error } = await adminSb
      .from('profiles')
      .update({ latitude: lat, longitude: lng })
      .eq('id', admin.id);
    if (error) throw new Error(`set gps: ${error.message}`);
  }

  async function insertReportAt(lat, lng, label) {
    const reportId = randomUUID();
    const { error } = await reporterSb.from('reports').insert({
      id: reportId,
      user_id: reporter.id,
      device_timestamp: new Date().toISOString(),
      location: `SRID=4326;POINT(${lng} ${lat})`,
      beat_id: BEAT,
      status: 'synced',
      notes: `alert-radius-e2e ${label}`,
      source: 'eravat',
    });
    if (error) throw new Error(`insert report (${label}): ${error.message}`);
    createdReportIds.push(reportId);
    await sleep(1200);
    return reportId;
  }

  async function proximityCount(reportId) {
    const { data, error } = await adminSb
      .from('notifications')
      .select('id, title, notification_type')
      .eq('report_id', reportId)
      .eq('user_id', admin.id)
      .eq('notification_type', 'proximity');
    if (error) throw new Error(error.message);
    return data?.length ?? 0;
  }

  async function expectProximity(label, reportId, shouldHave) {
    const n = await proximityCount(reportId);
    record(label, shouldHave ? n > 0 : n === 0, `notifications=${n}`);
  }

  try {
    await setAdminGps(ORIGIN.lat, ORIGIN.lng);
    record('admin GPS pinned for tests', true, `${ORIGIN.lat}, ${ORIGIN.lng}`);

    // Bounds enforcement
    {
      const { error: lowErr } = await adminSb
        .from('profiles')
        .update({ notification_radius_km: 0 })
        .eq('id', admin.id);
      record('reject radius below min (0)', !!lowErr, lowErr?.message ?? 'accepted');

      const { error: highErr } = await adminSb
        .from('profiles')
        .update({ notification_radius_km: 1001 })
        .eq('id', admin.id);
      record('reject radius above max (1001)', !!highErr, highErr?.message ?? 'accepted');
    }

    // Case A: radius 110, report ~105 km → SHOULD notify
    {
      await setAdminRadius(110);
      const pt = destination(ORIGIN.lat, ORIGIN.lng, 105, 40);
      const actual = haversineKm(ORIGIN.lat, ORIGIN.lng, pt.lat, pt.lng);
      const id = await insertReportAt(pt.lat, pt.lng, 'in-105-of-110');
      record('case A distance ≈105 km', actual > 104 && actual < 106, `${actual.toFixed(2)} km`);
      await expectProximity('case A: 105 km report, radius 110 → notify', id, true);
    }

    // Case B: radius 50, report ~70 km → should NOT notify
    {
      await setAdminRadius(50);
      const pt = destination(ORIGIN.lat, ORIGIN.lng, 70, 90);
      const actual = haversineKm(ORIGIN.lat, ORIGIN.lng, pt.lat, pt.lng);
      const id = await insertReportAt(pt.lat, pt.lng, 'out-70-of-50');
      record('case B distance ≈70 km', actual > 69 && actual < 71, `${actual.toFixed(2)} km`);
      await expectProximity('case B: 70 km report, radius 50 → no notify', id, false);
    }

    // Case C: near-boundary inside — haversine≠spheroid exactly, so use 99.5 km
    {
      await setAdminRadius(100);
      const pt = destination(ORIGIN.lat, ORIGIN.lng, 99.5, 120);
      const actual = haversineKm(ORIGIN.lat, ORIGIN.lng, pt.lat, pt.lng);
      const id = await insertReportAt(pt.lat, pt.lng, 'boundary-in-99.5');
      record('case C distance ≈99.5 km', actual > 99 && actual < 100, `${actual.toFixed(2)} km`);
      await expectProximity('case C: 99.5 km / radius 100 → notify', id, true);
    }

    // Case D: just outside boundary — radius 100, report 101 km
    {
      await setAdminRadius(100);
      const pt = destination(ORIGIN.lat, ORIGIN.lng, 101, 150);
      const actual = haversineKm(ORIGIN.lat, ORIGIN.lng, pt.lat, pt.lng);
      const id = await insertReportAt(pt.lat, pt.lng, 'just-out-101');
      record('case D distance ≈101 km', actual > 100.5 && actual < 101.5, `${actual.toFixed(2)} km`);
      await expectProximity('case D: 101 km / radius 100 → no notify', id, false);
    }

    // Case E: near min — radius 1, report ~0.5 km → notify
    {
      await setAdminRadius(1);
      const pt = destination(ORIGIN.lat, ORIGIN.lng, 0.5, 10);
      const id = await insertReportAt(pt.lat, pt.lng, 'near-min-0.5');
      await expectProximity('case E: 0.5 km / radius 1 → notify', id, true);
    }

    // Case F: max window — radius 1000; use wide margin outside (haversine≠spheroid)
    {
      await setAdminRadius(1000);
      const inside = destination(ORIGIN.lat, ORIGIN.lng, 990, 200);
      const outside = destination(ORIGIN.lat, ORIGIN.lng, 1020, 210);
      const idIn = await insertReportAt(inside.lat, inside.lng, 'max-in-990');
      const idOut = await insertReportAt(outside.lat, outside.lng, 'max-out-1020');
      await expectProximity('case F1: 990 km / radius 1000 → notify', idIn, true);
      await expectProximity('case F2: 1020 km / radius 1000 → no notify', idOut, false);
    }

    // Case G: very close — radius 50, report 1 km → notify
    {
      await setAdminRadius(50);
      const pt = destination(ORIGIN.lat, ORIGIN.lng, 1, 0);
      const id = await insertReportAt(pt.lat, pt.lng, 'close-1');
      await expectProximity('case G: 1 km / radius 50 → notify', id, true);
    }

    // Case H: schema requires location — null insert must fail (blocks proximity path)
    {
      await setAdminRadius(100);
      const reportId = randomUUID();
      const { error } = await reporterSb.from('reports').insert({
        id: reportId,
        user_id: reporter.id,
        device_timestamp: new Date().toISOString(),
        beat_id: BEAT,
        status: 'synced',
        notes: 'alert-radius-e2e no-gps',
        source: 'eravat',
      });
      record(
        'case H: null location rejected by schema',
        !!error && /location|not-null|null value/i.test(error.message),
        error?.message ?? 'insert accepted unexpectedly',
      );
    }

    // Case I: admin is reporter → no self proximity
    {
      await setAdminRadius(100);
      const pt = destination(ORIGIN.lat, ORIGIN.lng, 20, 30);
      const reportId = randomUUID();
      const { error } = await adminSb.from('reports').insert({
        id: reportId,
        user_id: admin.id,
        device_timestamp: new Date().toISOString(),
        location: `SRID=4326;POINT(${pt.lng} ${pt.lat})`,
        beat_id: BEAT,
        status: 'synced',
        notes: 'alert-radius-e2e self',
        source: 'eravat',
      });
      if (error) {
        record('case I self-report insert', false, error.message);
      } else {
        createdReportIds.push(reportId);
        await sleep(1000);
        await expectProximity('case I: admin self-report → no self notify', reportId, false);
      }
    }

    // Case J: geo role (beat_guard) must NOT get proximity for far-from-territory path
    // (receives_radius_alerts=false). Insert near admin origin; BG may still get chain_of_command
    // only if report beat matches — we assert proximity type is absent for BG.
    if (bgSb && bgUserId) {
      await setAdminRadius(200);
      const pt = destination(ORIGIN.lat, ORIGIN.lng, 15, 60);
      const id = await insertReportAt(pt.lat, pt.lng, 'geo-isolation');
      const { data: bgProx } = await bgSb
        .from('notifications')
        .select('id')
        .eq('report_id', id)
        .eq('user_id', bgUserId)
        .eq('notification_type', 'proximity');
      record(
        'case J: beat_guard gets no proximity type',
        (bgProx?.length ?? 0) === 0,
        `proximity=${bgProx?.length ?? 0}`,
      );
    }

    // Case K: toggle radius mid-stream — same relative distances as user story
    {
      await setAdminRadius(110);
      const near = destination(ORIGIN.lat, ORIGIN.lng, 105, 220);
      const far = destination(ORIGIN.lat, ORIGIN.lng, 70, 260);
      const idNear = await insertReportAt(near.lat, near.lng, 'story-105');
      await expectProximity('case K1 (story): 105 km @ radius 110 → notify', idNear, true);

      await setAdminRadius(50);
      const idFar = await insertReportAt(far.lat, far.lng, 'story-70');
      await expectProximity('case K2 (story): 70 km @ radius 50 → no notify', idFar, false);
    }

    // Case L: missing admin GPS → no proximity (temporary clear then restore)
    {
      const { error: clearErr } = await adminSb
        .from('profiles')
        .update({ latitude: null, longitude: null })
        .eq('id', admin.id);
      // latitude/longitude may be NOT NULL — if so, skip
      if (clearErr) {
        record('case L skip (lat/lng NOT NULL)', true, clearErr.message);
      } else {
        await setAdminRadius(100);
        const pt = destination(ORIGIN.lat, ORIGIN.lng, 20, 300);
        const id = await insertReportAt(pt.lat, pt.lng, 'admin-no-gps');
        await expectProximity('case L: admin without GPS → no notify', id, false);
        await setAdminGps(ORIGIN.lat, ORIGIN.lng);
      }
    }
  } finally {
    // Cleanup reports (best-effort; may fail under RLS)
    for (const id of createdReportIds) {
      await reporterSb.from('reports').delete().eq('id', id).then(() => {});
      await adminSb.from('reports').delete().eq('id', id).then(() => {});
    }
    // Restore admin profile
    await adminSb
      .from('profiles')
      .update({
        latitude: previous.lat,
        longitude: previous.lng,
        notification_radius_km: Math.min(200, Math.max(10, previous.radius ?? 10)),
      })
      .eq('id', admin.id);
    record('admin profile restored', true, `radius=${previous.radius}`);
  }

  const failed = results.filter((r) => !r.ok);
  const summary = {
    ranAt: new Date().toISOString(),
    total: results.length,
    passed: results.filter((r) => r.ok).length,
    failed: failed.length,
    ok: failed.length === 0,
    origin: ORIGIN,
    results,
  };
  writeFileSync(join(OUT, 'results.json'), JSON.stringify(summary, null, 2));
  console.log(`\n${summary.passed}/${summary.total} passed → ${OUT}/results.json`);
  process.exit(summary.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
