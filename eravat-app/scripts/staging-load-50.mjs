/**
 * 50 concurrent authenticated sessions against staging API + preview.
 * Uses the five tester OTP accounts, 10 workers each.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

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
const PHONES = ['8889184712', '8319149748', '9893686945', '7400503240', '9926445678'];
const WORKERS_PER_USER = 10; // 50 total

function e164(p) {
  return p.startsWith('+') ? p : `+91${p}`;
}

async function sessionFor(phone) {
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: sendErr } = await sb.auth.signInWithOtp({ phone: e164(phone) });
  if (sendErr) {
    const msg = (sendErr.message || '').toLowerCase();
    const providerDisabled =
      msg.includes('phone provider') || sendErr.code === 'phone_provider_disabled';
    if (!providerDisabled) throw sendErr;
  }
  const { data, error } = await sb.auth.verifyOtp({
    phone: e164(phone),
    token: '123456',
    type: 'sms',
  });
  if (error || !data.session) throw error || new Error(`no session for ${phone}`);
  return data.session.access_token;
}

async function timed(name, fn) {
  const t0 = Date.now();
  try {
    const res = await fn();
    return { name, ok: res.ok, status: res.status, ms: Date.now() - t0 };
  } catch (e) {
    return { name, ok: false, status: 0, ms: Date.now() - t0, error: e.message };
  }
}

const tokens = [];
for (const phone of PHONES) {
  tokens.push(await sessionFor(phone));
  await new Promise((r) => setTimeout(r, 400));
}

const waves = [];
for (let w = 0; w < WORKERS_PER_USER; w++) {
  const wave = [];
  for (const token of tokens) {
    const headers = {
      apikey: key,
      Authorization: `Bearer ${token}`,
      Prefer: 'count=none',
    };
    wave.push(
      timed('reports', () =>
        fetch(`${url}/rest/v1/reports?select=id,device_timestamp&order=device_timestamp.desc&limit=20`, { headers }),
      ),
    );
    wave.push(
      timed('notifications', () => {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
        const uid = payload.sub;
        return fetch(
          `${url}/rest/v1/notifications?select=id,title,created_at&user_id=eq.${uid}&order=created_at.desc&limit=20`,
          { headers },
        );
      }),
    );
    wave.push(
      timed('profiles_self', () => {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
        return fetch(`${url}/rest/v1/profiles?select=id,role,phone&id=eq.${payload.sub}`, { headers });
      }),
    );
    wave.push(
      timed('centroids_bbox', () =>
        fetch(
          `${url}/rest/v1/village_centroids?select=name,latitude,longitude&latitude=gte.23.4&latitude=lte.24.1&longitude=gte.80.6&longitude=lte.81.3&limit=200`,
          { headers },
        ),
      ),
    );
  }
  waves.push(wave);
}

console.log(`Firing ${waves.length} waves × ${waves[0].length} requests (${tokens.length * WORKERS_PER_USER} sessions)…`);
const settled = [];
for (const wave of waves) {
  settled.push(...(await Promise.all(wave)));
}

const byName = {};
for (const r of settled) {
  if (!byName[r.name]) byName[r.name] = { n: 0, ok: 0, p50: [], statuses: {} };
  byName[r.name].n++;
  if (r.ok) byName[r.name].ok++;
  byName[r.name].p50.push(r.ms);
  byName[r.name].statuses[r.status] = (byName[r.name].statuses[r.status] || 0) + 1;
}
for (const k of Object.keys(byName)) {
  const arr = byName[k].p50.sort((a, b) => a - b);
  byName[k].p50ms = arr[Math.floor(arr.length * 0.5)];
  byName[k].p95ms = arr[Math.floor(arr.length * 0.95)];
  delete byName[k].p50;
}

const fails = settled.filter((r) => !r.ok || r.status >= 500);
const outDir = join(process.cwd(), '../Go live Prep - Staging/generated/load-50');
mkdirSync(outDir, { recursive: true });
const summary = {
  sessions: tokens.length * WORKERS_PER_USER,
  requests: settled.length,
  fail5xx: fails.length,
  byName,
  testedAt: new Date().toISOString(),
};
writeFileSync(join(outDir, 'results.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (fails.length > settled.length * 0.05) process.exit(1);
