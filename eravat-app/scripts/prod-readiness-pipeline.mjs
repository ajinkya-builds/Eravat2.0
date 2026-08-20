/**
 * End-to-end data pipeline on staging: volunteer files a sighting via REST
 * (same tables the app writes), then DFO/BG notifications + villager queue.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

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
const VOL = '7400503240';
const BEAT = '4262ef8b-d95c-4bbe-981c-7faee8b60e57'; // Salkhaniya Khitauli Core
const LAT = 23.857845625031;
const LNG = 81.038319794626;

function e164(p) {
  return p.startsWith('+') ? p : `+91${p}`;
}

async function session(phone) {
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: sendErr } = await sb.auth.signInWithOtp({ phone: e164(phone) });
  if (sendErr) {
    const msg = (sendErr.message || '').toLowerCase();
    if (!(msg.includes('phone provider') || sendErr.code === 'phone_provider_disabled')) throw sendErr;
  }
  const { data, error } = await sb.auth.verifyOtp({ phone: e164(phone), token: '123456', type: 'sms' });
  if (error || !data.session) throw error || new Error('no session');
  return { sb: createClient(url, key, { global: { headers: { Authorization: `Bearer ${data.session.access_token}` } } }), token: data.session.access_token, userId: data.user.id };
}

const { sb, userId } = await session(VOL);
const reportId = randomUUID();

const { error: rErr } = await sb.from('reports').insert({
  id: reportId,
  user_id: userId,
  device_timestamp: new Date().toISOString(),
  location: `SRID=4326;POINT(${LNG} ${LAT})`,
  beat_id: BEAT,
  status: 'synced',
  notes: 'prod-readiness pipeline test',
  source: 'eravat',
});

const out = { reportId, insertReport: rErr?.message || 'ok' };

if (!rErr) {
  const { error: oErr } = await sb.from('observations').insert({
    report_id: reportId,
    type: 'direct_sighting',
    male_count: 1,
    female_count: 0,
    calf_count: 0,
    unknown_count: 0,
    total_elephants: 1,
  });
  out.insertObservation = oErr?.message || 'ok';
}

await new Promise((r) => setTimeout(r, 1500));

const { data: notifs } = await sb
  .from('notifications')
  .select('id,title,notification_type,user_id')
  .eq('report_id', reportId);

out.notificationsVisibleToReporter = (notifs || []).length;

const dfo = await session('9893686945');
const { data: dfoN } = await dfo.sb
  .from('notifications')
  .select('id,title,notification_type')
  .eq('report_id', reportId)
  .order('created_at', { ascending: false });
out.dfoNotifications = dfoN || [];

const bg = await session('8889184712');
const { data: bgN } = await bg.sb
  .from('notifications')
  .select('id,title,notification_type')
  .eq('report_id', reportId);
out.bgNotifications = bgN || [];

const ro = await session('8319149748');
const { data: roN } = await ro.sb
  .from('notifications')
  .select('id,title,notification_type')
  .eq('report_id', reportId)
  .eq('notification_type', 'chain_of_command');
out.roChainCount = (roN || []).length;

out.ok =
  out.insertReport === 'ok' &&
  out.insertObservation === 'ok' &&
  (out.dfoNotifications || []).some((n) => n.notification_type === 'chain_of_command') &&
  (out.bgNotifications || []).some((n) => n.notification_type === 'chain_of_command') &&
  out.roChainCount === 0;

const dir = join(process.cwd(), '../Go live Prep - Staging/generated/prod-readiness-e2e');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'pipeline.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));

await sb.from('reports').delete().eq('id', reportId);
process.exit(out.ok ? 0 : 1);
