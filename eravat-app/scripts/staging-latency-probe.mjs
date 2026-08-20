/**
 * Latency probe: sequential vs concurrent REST against staging.
 * Distinguishes query cost from client/compute queueing.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.staging.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function token() {
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  await sb.auth.signInWithOtp({ phone: '+918889184712' }).catch(() => {});
  const { data, error } = await sb.auth.verifyOtp({
    phone: '+918889184712',
    token: '123456',
    type: 'sms',
  });
  if (error) throw error;
  return data.session.access_token;
}

function hdr(tok) {
  return {
    apikey: key,
    Authorization: `Bearer ${tok}`,
    Prefer: 'count=none',
  };
}

async function once(tok, path) {
  const t0 = Date.now();
  const res = await fetch(`${url}${path}`, { headers: hdr(tok) });
  const ms = Date.now() - t0;
  return { status: res.status, ms, bytes: Number(res.headers.get('content-length') || 0) };
}

const tok = await token();
const uid = JSON.parse(Buffer.from(tok.split('.')[1], 'base64url').toString()).sub;
const paths = {
  reports: '/rest/v1/reports?select=id,device_timestamp&order=device_timestamp.desc&limit=20',
  reports_beat: `/rest/v1/reports?select=id,device_timestamp&beat_id=eq.4262ef8b-d95c-4bbe-981c-7faee8b60e57&order=device_timestamp.desc&limit=20`,
  notifications: `/rest/v1/notifications?select=id,title,created_at&user_id=eq.${uid}&order=created_at.desc&limit=20`,
  profiles: `/rest/v1/profiles?select=id,role,phone&id=eq.${uid}`,
  centroids: '/rest/v1/village_centroids?select=name,latitude,longitude&latitude=gte.23.4&latitude=lte.24.1&longitude=gte.80.6&longitude=lte.81.3&limit=200',
};

console.log('warmup…');
await once(tok, paths.profiles);

console.log('\n=== sequential (n=5) beat_guard ===');
for (const [name, path] of Object.entries(paths)) {
  const samples = [];
  for (let i = 0; i < 5; i++) samples.push((await once(tok, path)).ms);
  samples.sort((a, b) => a - b);
  console.log(name, { min: samples[0], p50: samples[2], max: samples[4], samples });
}

async function burst(n, path) {
  const t0 = Date.now();
  const rows = await Promise.all(Array.from({ length: n }, () => once(tok, path)));
  return {
    wall: Date.now() - t0,
    p50: rows.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(n / 2)],
    max: Math.max(...rows.map((r) => r.ms)),
    statuses: rows.map((r) => r.status),
  };
}

console.log('\n=== concurrent same endpoint ===');
for (const n of [1, 5, 10, 20, 50]) {
  console.log('reports n=' + n, await burst(n, paths.reports_beat));
  console.log('notifs  n=' + n, await burst(n, paths.notifications));
}
