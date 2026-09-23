/**
 * Role-matrix E2E against staging web bundle (same as APK).
 * Prereq: VITE_BASE_PATH=/ npx vite build --mode staging
 *         npx vite preview --port 4173 --strictPort
 *
 * Extended roles (ccf / rrt / biologist / veterinarian) are not on the UAT sheet.
 * We temporarily reassign spare beat_guard phones (OTP already enrolled), then restore.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'fs/promises';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';

const OUT = join(process.cwd(), '../Go live Prep - Staging/generated/e2e-role-matrix');
const BASE = process.env.E2E_BASE || 'http://localhost:4173';

const manifest = JSON.parse(
  await readFile(
    join(process.cwd(), '../Go live Prep - Staging/generated/uat-testers/uat-testers-otp-manifest.json'),
    'utf8',
  ),
);

function loadEnv(path) {
  try {
    return Object.fromEntries(
      readFileSync(path, 'utf8')
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

const staging = loadEnv(join(process.cwd(), '.env.staging.local'));
const serviceSb =
  staging.VITE_SUPABASE_URL && staging.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(staging.VITE_SUPABASE_URL, staging.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      })
    : null;

function pick(role, index = 0) {
  const hits = manifest.filter((x) => x.role === role);
  const u = hits[index];
  if (!u) throw new Error(`No UAT user for role ${role} (index ${index})`);
  return { phone: u.phone_app, otp: u.otp, name: u.name };
}

/** Roles that may access Command Center (AdminRoute). */
const ADMIN_ACCESS = new Set(['admin', 'ccf', 'dfo']);

/**
 * Core five from manifest + four extended roles via temporary role swap on spare BGs.
 * Spare phones: high beat_guard indices — never Jamudi 7415740750 (reserved for Maestro/emulator e2e).
 */
const RESERVED_E2E_PHONES = new Set(['7415740750']);

function pickSpareBeatGuard(spareIndex) {
  const hits = manifest.filter(
    (x) => x.role === 'beat_guard' && !RESERVED_E2E_PHONES.has(String(x.phone_app)),
  );
  // Skip first remaining BG so matrix "beat_guard" (index 0 of full list) stays distinct when possible
  const u = hits[spareIndex + 1] || hits[spareIndex];
  if (!u) throw new Error(`No spare beat_guard for swap index ${spareIndex}`);
  return { phone: u.phone_app, otp: u.otp, name: u.name };
}

const ROLE_SPECS = [
  { role: 'beat_guard', ...pick('beat_guard', 0), admin: false, swap: null },
  { role: 'range_officer', ...pick('range_officer', 0), admin: false, swap: null },
  { role: 'dfo', ...pick('dfo', 0), admin: true, swap: null },
  { role: 'volunteer', ...pick('volunteer', 0), admin: false, swap: null },
  { role: 'admin', ...pick('admin', 0), admin: true, swap: null },
  { role: 'ccf', ...pickSpareBeatGuard(0), admin: true, swap: 'ccf' },
  { role: 'rrt', ...pickSpareBeatGuard(1), admin: false, swap: 'rrt' },
  { role: 'biologist', ...pickSpareBeatGuard(2), admin: false, swap: 'biologist' },
  { role: 'veterinarian', ...pickSpareBeatGuard(3), admin: false, swap: 'veterinarian' },
];

const FIELD_ROUTES = ['/', '/report', '/map', '/history', '/nearby', '/profile', '/settings', '/villagers'];
const ADMIN_ROUTES = [
  '/admin',
  '/admin/users',
  '/admin/villagers',
  '/admin/observations',
  '/admin/conflict',
  '/admin/live',
  '/admin/latest',
  '/admin/user-stats',
  '/admin/divisions',
  '/admin/notifications',
  '/admin/support',
  '/admin/settings',
  '/admin/map',
];

const results = [];
const swaps = []; // { phoneE164, originalRole }

async function shot(page, name) {
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true }).catch(() => {});
}

function record(name, ok, extra = '') {
  results.push({ name, ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
}

function e164(p) {
  return `+91${String(p).replace(/\D/g, '').slice(-10)}`;
}

async function applyRoleSwap(spec) {
  if (!spec.swap) return;
  if (!serviceSb) throw new Error('SUPABASE_SERVICE_ROLE_KEY required for extended role swaps');
  const phone = e164(spec.phone);
  const { data: row, error } = await serviceSb
    .from('profiles')
    .select('id, role')
    .eq('phone', phone)
    .maybeSingle();
  if (error || !row) throw error || new Error(`No profile for ${phone}`);
  swaps.push({ phone, originalRole: row.role, id: row.id });
  const { error: upErr } = await serviceSb.from('profiles').update({ role: spec.swap }).eq('id', row.id);
  if (upErr) throw upErr;
  console.log(`  swap ${phone} ${row.role} → ${spec.swap}`);
}

async function restoreSwaps() {
  if (!serviceSb) return;
  for (const s of swaps.reverse()) {
    const { error } = await serviceSb.from('profiles').update({ role: s.originalRole }).eq('id', s.id);
    if (error) console.error(`restore failed ${s.phone}:`, error.message);
    else console.log(`  restored ${s.phone} → ${s.originalRole}`);
  }
  swaps.length = 0;
}

// Hard guarantee: any unexpected leftover roles on reserved E2E phones are reset
async function assertReservedPhonesRestored() {
  if (!serviceSb) return;
  for (const dig of RESERVED_E2E_PHONES) {
    const { data: row } = await serviceSb
      .from('profiles')
      .select('id, role, phone')
      .ilike('phone', `%${dig}`)
      .maybeSingle();
    if (row && row.role !== 'beat_guard') {
      console.warn(`Reserved E2E phone ${dig} was ${row.role}; forcing beat_guard`);
      await serviceSb.from('profiles').update({ role: 'beat_guard' }).eq('id', row.id);
    }
  }
}

async function loginOTP(page, phone, otp) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('9876543210').waitFor({ timeout: 20000 });
  await page.getByPlaceholder('9876543210').fill(phone);
  await page.getByRole('button', { name: /Send OTP/i }).click();
  const otpInput = page.getByPlaceholder(/Enter 6-digit code|6-digit|OTP/i);
  await otpInput.waitFor({ timeout: 25000 });
  await otpInput.fill(otp);
  await page.getByRole('button', { name: /Verify/i }).click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30000 });
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

try {
  for (const spec of ROLE_SPECS) {
    const role = spec.role;
    const expectAdmin = ADMIN_ACCESS.has(role);
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      geolocation: { latitude: 23.75, longitude: 80.93 },
      permissions: ['geolocation'],
    });
    const page = await ctx.newPage();
    try {
      await applyRoleSwap(spec);
      await loginOTP(page, spec.phone, spec.otp);
      record(`${role} login`, true);

      for (const route of FIELD_ROUTES) {
        await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1800);
        const bounced = page.url().includes('/login');
        record(`${role} ${route}`, !bounced, bounced ? page.url() : '');
        await shot(page, `${role}${route.replaceAll('/', '-') || '-home'}`);
      }

      await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
      const body = (await page.content()).toLowerCase();
      const sawAdmin =
        body.includes('command center') ||
        body.includes('user management') ||
        body.includes('conflict intelligence');
      if (expectAdmin) {
        record(`${role} admin home`, sawAdmin || page.url().includes('/admin'), 'expected admin');
        for (const route of ADMIN_ROUTES) {
          await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(2200);
          const ok = !page.url().includes('/login');
          record(`${role} ${route}`, ok);
          await shot(page, `${role}${route.replaceAll('/', '-')}`);
        }
        if (role === 'admin' || role === 'ccf') {
          const intel = await (async () => {
            await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(4000);
            return page.content();
          })();
          record(`${role} ED intelligence panel`, /conflict intelligence|90 day|priority/i.test(intel));
        }
      } else {
        record(`${role} blocked from admin`, !sawAdmin || !page.url().includes('/admin'));
      }

      // Read-only villager roles should reach /villagers without onboard CTAs for biologist/vet/rrt
      if (role === 'rrt' || role === 'biologist' || role === 'veterinarian') {
        await page.goto(`${BASE}/villagers`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);
        const vTxt = await page.locator('body').innerText();
        const hasOnboard = /Onboard|Register Hathi|Add Villager|नया.*मित्रा/i.test(vTxt);
        record(`${role} villagers read-only (no onboard CTA)`, !hasOnboard, vTxt.slice(0, 120).replace(/\s+/g, ' '));
      }

      await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
      if (role === 'beat_guard' || role === 'dfo') {
        const bell = page.getByRole('button', { name: /Notifications/i });
        if (await bell.count()) {
          await bell.first().click();
          await page.waitForTimeout(1500);
          const txt = await page.locator('body').innerText();
          const hasNotifications = /Direct Sighting Alert|Activity within your alert radius/i.test(txt);
          const emptyState = /No notifications yet|You're all caught up/i.test(txt);
          record(`${role} notification grain`, hasNotifications || emptyState, txt.slice(0, 180).replace(/\s+/g, ' '));
          await shot(page, `${role}-notifications`);
        } else {
          record(`${role} notification grain`, false, 'bell missing');
        }
      }
      record(`${role} home after routes`, !page.url().includes('/login'));
    } catch (e) {
      record(`${role} login`, false, e.message);
      await shot(page, `${role}-fail`);
    }
    await ctx.close();
  }
} finally {
  await restoreSwaps();
  await assertReservedPhonesRestored();
  await browser.close();
}

const summary = {
  passed: results.filter((r) => r.ok).length,
  failed: results.filter((r) => !r.ok).length,
  results,
  roles: ROLE_SPECS.map((s) => s.role),
  testedAt: new Date().toISOString(),
};
await writeFile(join(OUT, 'results.json'), JSON.stringify(summary, null, 2));
console.log('\nSUMMARY', { passed: summary.passed, failed: summary.failed, roles: summary.roles });
process.exit(summary.failed ? 1 : 0);
