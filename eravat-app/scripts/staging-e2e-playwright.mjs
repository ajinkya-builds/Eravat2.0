/**
 * Staging E2E via Playwright (same web bundle as Android APK).
 * Prereq: VITE_BASE_PATH=/ npx vite preview --port 4173 --strictPort
 * Run: node scripts/staging-e2e-playwright.mjs
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'fs/promises';
import { join } from 'path';

const OUT = join(process.cwd(), '../Go live Prep - Staging/generated/e2e-playwright');
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
  return { phone: u.phone_app, otp: u.otp };
}

const USERS = {
  beat_guard: pick('beat_guard'),
  admin: pick('admin'),
  unenrolled: { phone: '9000000001' },
};

const results = [];

async function shot(page, name) {
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
}

async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log('PASS', name);
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
    console.log('FAIL', name, e.message);
  }
}

async function clearSession(page) {
  await page.goto(`${BASE}/login`);
  await page.context().clearCookies();
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
}

async function loginOTP(page, phone, otp) {
  await page.goto(`${BASE}/login`);
  await page.getByPlaceholder('9876543210').waitFor({ timeout: 10000 });
  await page.getByPlaceholder('9876543210').fill(phone);
  await page.getByRole('button', { name: /Send OTP/i }).click();
  await page.getByPlaceholder('Enter 6-digit code').waitFor({ timeout: 15000 });
  await page.getByPlaceholder('Enter 6-digit code').fill(otp);
  await page.getByRole('button', { name: /Verify/i }).click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 25000 });
}

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

await check('Login screen loads', async () => {
  await page.goto(`${BASE}/login`);
  await page.getByText(/Welcome Back/i).waitFor({ timeout: 10000 });
  await page.getByPlaceholder('9876543210').waitFor();
  await shot(page, '01-login');
});

await check('Unenrolled phone rejected', async () => {
  await clearSession(page);
  await page.getByPlaceholder('9876543210').fill(USERS.unenrolled.phone);
  await page.getByRole('button', { name: /Send OTP/i }).click();
  await page.getByText(/not enrolled|Invalid credentials/i).waitFor({ timeout: 10000 });
  await shot(page, '02-unenrolled');
});

await check('Beat guard OTP login', async () => {
  await clearSession(page);
  await loginOTP(page, USERS.beat_guard.phone, USERS.beat_guard.otp);
  await shot(page, '03-dashboard');
});

await check('Dashboard content', async () => {
  await page.goto(`${BASE}/`);
   await page.getByText(/Report|Activity|Welcome|sighting/i).first().waitFor({ timeout: 15000 });
  await shot(page, '04-dashboard-home');
});

await check('Report wizard opens', async () => {
  await page.goto(`${BASE}/report`);
   await page.waitForTimeout(2000);
  const body = await page.content();
  if (!/location|observation|date|time|sighting|activity/i.test(body)) {
    throw new Error('Report wizard missing expected fields');
  }
  await shot(page, '05-report');
});

await check('Map loads Leaflet', async () => {
  await page.goto(`${BASE}/map`);
   await page.locator('.leaflet-container').waitFor({ timeout: 25000 });
  await shot(page, '06-map');
});

await check('Profile page', async () => {
  await page.goto(`${BASE}/profile`);
   await page.waitForTimeout(2000);
  const body = await page.content();
  if (!/profile|phone|role|territory/i.test(body)) throw new Error('Profile page missing');
  await shot(page, '07-profile');
});

await check('Settings page', async () => {
  await page.goto(`${BASE}/settings`);
   await page.waitForTimeout(2000);
  await shot(page, '08-settings');
});

await check('History page', async () => {
  await page.goto(`${BASE}/history`);
   await page.waitForTimeout(3000);
  const body = await page.content();
  if (!/history|report|sighting|observation/i.test(body)) throw new Error('History page missing');
  await shot(page, '09-history');
});

await check('Beat guard blocked from admin', async () => {
  await page.goto(`${BASE}/admin`);
   await page.waitForTimeout(2500);
  await shot(page, '10-beat-guard-admin');
  const body = (await page.content()).toLowerCase();
  if (body.includes('command center') || body.includes('user management')) {
    throw new Error('Beat guard reached admin UI');
  }
});

// Admin journeys in fresh context
const adminContext = await browser.newContext();
const adminPage = await adminContext.newPage();

await check('Admin login', async () => {
  await clearSession(adminPage);
  await loginOTP(adminPage, USERS.admin.phone, USERS.admin.otp);
  await shot(adminPage, '11-admin-login');
});

await check('Admin dashboard', async () => {
  await adminPage.goto(`${BASE}/admin`);
   await adminPage.waitForTimeout(3000);
  const body = (await adminPage.content()).toLowerCase();
  if (!body.includes('command center') && !body.includes('user management') && !body.includes('conflict intelligence') && !body.includes('admin')) {
    throw new Error('Admin dashboard not loaded');
  }
  await shot(adminPage, '12-admin-dashboard');
});

await check('Admin users page', async () => {
  await adminPage.goto(`${BASE}/admin/users`);
   await adminPage.waitForTimeout(4000);
  const body = await adminPage.content();
  if (!/user|phone|role|search/i.test(body)) throw new Error('Admin users page missing');
  await shot(adminPage, '13-admin-users');
});

await check('Admin villagers tracker', async () => {
  await adminPage.goto(`${BASE}/admin/villagers`);
  await adminPage.waitForTimeout(4000);
  const body = await adminPage.content();
  if (!/villager|search|register|mobile/i.test(body)) throw new Error('Admin villagers page missing');
  await shot(adminPage, '13b-admin-villagers');
});

await check('Admin observations', async () => {
  await adminPage.goto(`${BASE}/admin/observations`);
   await adminPage.waitForTimeout(4000);
  const body = await adminPage.content();
  if (!/observation|report|sighting/i.test(body)) throw new Error('Admin observations missing');
  await shot(adminPage, '14-admin-observations');
});

await check('Admin map', async () => {
  await adminPage.goto(`${BASE}/admin/map`);
   await adminPage.locator('.leaflet-container').waitFor({ timeout: 25000 });
  await shot(adminPage, '15-admin-map');
});

await check('Session persists after reload', async () => {
  await page.reload();
  await page.waitForTimeout(1500);
  const locked = (await page.getByText(/Enter.*PIN|Unlock/i).count()) > 0;
  if (locked) throw new Error('PIN lock still shown after reload');
  if (page.url().includes('/login')) throw new Error('Session did not persist after reload');
  await shot(page, '16-session-persist');
});

await adminContext.close();
await browser.close();

const summary = {
  passed: results.filter((r) => r.ok).length,
  failed: results.filter((r) => !r.ok).length,
  results,
  testedAt: new Date().toISOString(),
  baseUrl: BASE,
};
await writeFile(join(OUT, 'results.json'), JSON.stringify(summary, null, 2));
console.log('\nSUMMARY', summary);
process.exit(summary.failed ? 1 : 0);
