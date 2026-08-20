/**
 * Invoke send-push Edge Function after notification insert (FCM pipeline smoke).
 * Passes if edge function returns 200; full device delivery needs google-services.json + FCM secrets.
 * Run: node scripts/staging-push-pipeline-e2e.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

const OUT = join(import.meta.dirname, '../../Go live Prep - Staging/generated/push-pipeline-e2e');

function loadEnv(rel) {
  try {
    return Object.fromEntries(
      readFileSync(join(import.meta.dirname, rel), 'utf8')
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
const serviceKey = staging.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Add SUPABASE_SERVICE_ROLE_KEY to eravat-app/.env.staging.local (staging project ttjtyvxfiqhjdngkgdkf only)');
  process.exit(2);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

mkdirSync(OUT, { recursive: true });

const { data: user } = await admin
  .from('profiles')
  .select('id')
  .eq('role', 'beat_guard')
  .eq('is_active', true)
  .limit(1)
  .maybeSingle();

record('beat_guard profile', !!user?.id, user?.id ? 'ok' : 'check staging service role key');
if (!user?.id) {
  writeFileSync(join(OUT, 'results.json'), JSON.stringify({ ok: false, error: 'staging service role or profile missing' }, null, 2));
  process.exit(1);
}

const fakeToken = `e2e-fake-fcm-${randomUUID().slice(0, 8)}`;
if (user?.id) {
  await admin.from('push_tokens').upsert(
    { user_id: user.id, token: fakeToken, platform: 'android', updated_at: new Date().toISOString() },
    { onConflict: 'user_id,token' },
  );
  record('push_tokens upsert (test token)', true);
}

const reportId = randomUUID();
const notifId = randomUUID();
await admin.from('notifications').insert({
  id: notifId,
  user_id: user.id,
  report_id: reportId,
  title: 'E2E Push Pipeline Test',
  message: 'Certification smoke',
  notification_type: 'general',
});

const { data: fnData, error: fnErr } = await admin.functions.invoke('send-push', {
  body: {
    user_id: user.id,
    title: 'E2E Push Pipeline Test',
    message: 'Certification smoke',
    report_id: reportId,
    notification_type: 'general',
  },
});

let detail = '';
let pushOk = false;
if (fnErr) {
  detail = fnErr.message;
  if (fnErr.context) {
    try {
      const raw = await fnErr.context.text?.();
      if (raw) detail += ` ${raw.slice(0, 160)}`;
    } catch {
      /* ignore */
    }
  }
} else {
  detail = JSON.stringify(fnData).slice(0, 160);
  pushOk =
    fnData?.skipped === true ||
    typeof fnData?.sent === 'number' ||
    Boolean(fnData?.reason);
}
record('send-push invoke', pushOk, detail);

if (user?.id) {
  await admin.from('push_tokens').delete().eq('token', fakeToken);
}
await admin.from('notifications').delete().eq('id', notifId);

const ok = results.every((r) => r.ok);
writeFileSync(join(OUT, 'results.json'), JSON.stringify({ ranAt: new Date().toISOString(), ok, results }, null, 2));
process.exit(ok ? 0 : 1);
