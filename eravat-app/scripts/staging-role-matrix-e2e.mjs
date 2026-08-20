/**
 * Role-matrix E2E against staging web bundle (same as APK).
 * Prereq: VITE_BASE_PATH=/ npx vite build --mode staging
 *         npx vite preview --port 4173 --strictPort
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'fs/promises';
import { join } from 'path';

const OUT = join(process.cwd(), '../Go live Prep - Staging/generated/e2e-role-matrix');
const BASE = process.env.E2E_BASE || 'http://localhost:4173';

const manifest = JSON.parse(
  await readFile(
    join(process.cwd(), '../Go live Prep - Staging/generated/uat-testers/uat-testers-otp-manifest.json'),
    'utf8'
  )
);

function pick(role) {
  const u = manifest.find((x) => x.role === role);
  if (!u) throw new Error(`No UAT user for role ${role}`);
  return { phone: u.phone_app, otp: u.otp, admin: role === 'admin' || role === 'dfo' };
}

const USERS = {
  beat_guard: pick('beat_guard'),
  range_officer: pick('range_officer'),
  dfo: pick('dfo'),
  volunteer: pick('volunteer'),
  admin: pick('admin'),
};

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
  '/admin/settings',
  '/admin/map',
];

const results = [];

async function shot(page, name) {
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true }).catch(() => {});
}

function record(name, ok, extra = '') {
  results.push({ name, ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
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

for (const [role, user] of Object.entries(USERS)) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    geolocation: { latitude: 23.75, longitude: 80.93 },
    permissions: ['geolocation'],
  });
  const page = await ctx.newPage();
  try {
    await loginOTP(page, user.phone, user.otp);
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
    const sawAdmin = body.includes('command center') || body.includes('user management') || body.includes('conflict intelligence');
    if (user.admin) {
      record(`${role} admin home`, sawAdmin || page.url().includes('/admin'), 'expected admin');
      for (const route of ADMIN_ROUTES) {
        await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2200);
        const ok = !page.url().includes('/login');
        record(`${role} ${route}`, ok);
        await shot(page, `admin${route.replaceAll('/', '-')}`);
      }
      const intel = (await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' }), await page.waitForTimeout(4000), await page.content());
      record('admin ED intelligence panel', /conflict intelligence|90 day|priority/i.test(intel));
    } else {
      record(`${role} blocked from admin`, !sawAdmin);
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

await browser.close();
const summary = {
  passed: results.filter((r) => r.ok).length,
  failed: results.filter((r) => !r.ok).length,
  results,
  testedAt: new Date().toISOString(),
};
await writeFile(join(OUT, 'results.json'), JSON.stringify(summary, null, 2));
console.log('\nSUMMARY', { passed: summary.passed, failed: summary.failed });
process.exit(summary.failed ? 1 : 0);
