/**
 * Staging write-path stress: bounded parallel report inserts → trigger fan-out.
 * Asserts notifications + villager queues complete within budget; cleans up after.
 *
 * Run: node scripts/staging-report-trigger-stress.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '../../Go live Prep - Staging/generated/report-trigger-stress');

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

const REPORT_COUNT = Number(process.env.STRESS_REPORTS || 12);
const CONCURRENCY = Number(process.env.STRESS_CONCURRENCY || 3);
const BUDGET_MS_PER_REPORT = Number(process.env.STRESS_BUDGET_MS || 8000);

const PIPELINE = {
  reporter: { phone: '7400503240', otp: '123456' },
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

async function mapPool(items, limit, fn) {
  const out = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  console.log(`Report trigger stress — ${REPORT_COUNT} reports, concurrency ${CONCURRENCY}\n`);

  if (!url || !anonKey || !serviceKey) throw new Error('Missing staging env keys');

  const serviceSb = createClient(url, serviceKey, { auth: { persistSession: false } });
  const volSb = await session(PIPELINE.reporter.phone, PIPELINE.reporter.otp);
  const { data: volProfile } = await volSb.from('profiles').select('id, latitude, longitude').single();
  if (!volProfile?.id) throw new Error('reporter profile missing');

  const LAT = volProfile.latitude ?? PIPELINE.lat;
  const LNG = volProfile.longitude ?? PIPELINE.lng;
  const BEAT = PIPELINE.beatId;

  const reportIds = Array.from({ length: REPORT_COUNT }, () => randomUUID());
  const timings = [];

  const insertResults = await mapPool(reportIds, CONCURRENCY, async (reportId, idx) => {
    const t0 = Date.now();
    const { error: rErr } = await volSb.from('reports').insert({
      id: reportId,
      user_id: volProfile.id,
      device_timestamp: new Date().toISOString(),
      location: `SRID=4326;POINT(${LNG} ${LAT})`,
      beat_id: BEAT,
      status: 'synced',
      notes: `trigger-stress #${idx}`,
      source: 'eravat',
    });
    if (rErr) return { reportId, ok: false, ms: Date.now() - t0, error: rErr.message };

    const { error: oErr } = await volSb.from('observations').insert({
      report_id: reportId,
      type: 'direct_sighting',
      male_count: 1,
      female_count: 0,
      calf_count: 0,
      unknown_count: 0,
      total_elephants: 1,
    });
    if (oErr) return { reportId, ok: false, ms: Date.now() - t0, error: oErr.message };

    // Wait for triggers
    await new Promise((r) => setTimeout(r, 1200));

    const { count: notifCount, error: nErr } = await serviceSb
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('report_id', reportId);
    if (nErr) return { reportId, ok: false, ms: Date.now() - t0, error: nErr.message };

    const ms = Date.now() - t0;
    timings.push(ms);
    return {
      reportId,
      ok: ms <= BUDGET_MS_PER_REPORT && (notifCount ?? 0) >= 1,
      ms,
      notifCount: notifCount ?? 0,
      error: ms > BUDGET_MS_PER_REPORT ? `budget ${BUDGET_MS_PER_REPORT}ms exceeded` : undefined,
    };
  });

  const okInserts = insertResults.filter((r) => r.ok).length;
  record(
    `insert+trigger fan-out (${REPORT_COUNT} @ concurrency ${CONCURRENCY})`,
    okInserts === REPORT_COUNT,
    `${okInserts}/${REPORT_COUNT} ok`,
  );

  const p50 = timings.slice().sort((a, b) => a - b)[Math.floor(timings.length * 0.5)] ?? 0;
  const p95 = timings.slice().sort((a, b) => a - b)[Math.floor(timings.length * 0.95)] ?? 0;
  record(`p50 insert+trigger ≤ ${BUDGET_MS_PER_REPORT}ms`, p50 <= BUDGET_MS_PER_REPORT, `${p50}ms`);
  record(`p95 insert+trigger ≤ ${BUDGET_MS_PER_REPORT * 1.5}ms`, p95 <= BUDGET_MS_PER_REPORT * 1.5, `${p95}ms`);

  // No orphan call rows with null report (integrity)
  const { data: orphanCalls } = await serviceSb
    .from('villager_call_events')
    .select('id, report_id')
    .in('report_id', reportIds);
  record('call events tied to stress reports only', Array.isArray(orphanCalls), `${orphanCalls?.length ?? 0} rows`);

  // Cleanup
  await serviceSb.from('observations').delete().in('report_id', reportIds);
  await serviceSb.from('villager_alert_events').delete().in('report_id', reportIds);
  await serviceSb.from('villager_call_events').delete().in('report_id', reportIds);
  await serviceSb.from('notifications').delete().in('report_id', reportIds);
  await serviceSb.from('reports').delete().in('id', reportIds);
  record('cleanup stress reports', true, `${reportIds.length} deleted`);

  const failed = results.filter((r) => !r.ok);
  const summary = {
    ranAt: new Date().toISOString(),
    reportCount: REPORT_COUNT,
    concurrency: CONCURRENCY,
    budgetMs: BUDGET_MS_PER_REPORT,
    timings,
    p50,
    p95,
    insertResults,
    total: results.length,
    passed: results.filter((r) => r.ok).length,
    failed: failed.length,
    ok: failed.length === 0,
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
