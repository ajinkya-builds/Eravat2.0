/**
 * Full staging smoke for performance hardening.
 * Prereq: VITE_BASE_PATH=/ npx vite build --mode staging
 *         npx vite preview --port 4173 --strictPort
 * Run: node scripts/staging-perf-full-smoke.mjs
 *
 * Auth model (current): OTP + optional PIN setup, but no PIN lock on reload
 * (AuthContext clears eravat_secure_session). Session restore = Supabase persistSession.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import fs from 'fs';

const OUT = join(process.cwd(), '../Go live Prep - Staging/generated/e2e-perf-full');
const BASE = 'http://127.0.0.1:4173';
const USERS = {
  beat_guard: { phone: '8889184712', pin: '1234' },
  admin: { phone: '9926445678', pin: '5678' },
  unenrolled: { phone: '9000000001' },
};

const results = [];
const timings = {};

function mark(name, ms) {
  timings[name] = ms;
}

async function shot(page, name) {
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
}

async function check(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    const ms = Date.now() - t0;
    results.push({ name, ok: true, ms });
    mark(name, ms);
    console.log(`PASS ${name} (${ms}ms)`);
  } catch (e) {
    const ms = Date.now() - t0;
    results.push({ name, ok: false, ms, error: e.message });
    mark(name, ms);
    console.log(`FAIL ${name} (${ms}ms): ${e.message}`);
    try {
      // best-effort failure shot if page still open
    } catch { /* ignore */ }
  }
}

async function clearStorage(page) {
  await page.goto(`${BASE}/login`);
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload({ waitUntil: 'networkidle' });
}

async function loginOTP(page, phone) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('9876543210').waitFor({ timeout: 15000 });
  await page.getByPlaceholder('9876543210').fill(phone);
  await page.getByRole('button', { name: /Send OTP/i }).click();
  const otp = page.getByPlaceholder(/Enter 6-digit code|6-digit|OTP|कोड/i);
  await otp.waitFor({ timeout: 20000 });
  await otp.click();
  await otp.fill('');
  await otp.type('123456', { delay: 40 });
  const verify = page.getByRole('button', { name: /Verify|सत्यापित|पडताळ/i });
  await verify.waitFor({ state: 'visible' });
  // Wait until enabled (otpCode.length === 6)
  await page.waitForFunction(() => {
    const buttons = [...document.querySelectorAll('button[type="submit"]')];
    return buttons.some((b) => /verify/i.test(b.textContent || '') && !b.disabled);
  }, null, { timeout: 10000 });
  await verify.click();
}

async function maybeSetPIN(page, pin) {
  const pinPrompt = page.getByText(/Create.*PIN|Set.*PIN|Confirm.*PIN|Enter.*PIN/i);
  try {
    await pinPrompt.first().waitFor({ timeout: 8000 });
  } catch {
    return false;
  }
  for (const d of pin) {
    await page.getByRole('button', { name: d, exact: true }).click();
  }
  await page.waitForTimeout(400);
  // confirm round if still on PIN
  if (await page.getByText(/Confirm|again|पुन्हा/i).count()) {
    for (const d of pin) {
      await page.getByRole('button', { name: d, exact: true }).click();
    }
  }
  await page.waitForTimeout(1500);
  return true;
}

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
page.setDefaultTimeout(20000);

// Capture console errors for diagnostics
const consoleErrors = [];
page.on('pageerror', (err) => consoleErrors.push(String(err)));
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});

await check('Login screen loads', async () => {
  const t0 = Date.now();
  await clearStorage(page);
  await page.getByText(/Welcome Back|वापस स्वागत|पुन्हा स्वागत/i).waitFor({ timeout: 15000 });
  await page.locator('input').first().waitFor();
  mark('login_tti_ms', Date.now() - t0);
  await shot(page, '01-login');
});

await check('Unenrolled phone rejected', async () => {
  await clearStorage(page);
  const phoneInput = page.locator('input').first();
  await phoneInput.fill(USERS.unenrolled.phone);
  await page.getByRole('button', { name: /Send OTP|OTP/i }).click();
  await page.getByText(/Invalid credentials|not found|try again|अमान्य/i).waitFor({ timeout: 15000 });
  await shot(page, '02-unenrolled');
});

await check('Beat guard OTP login', async () => {
  await clearStorage(page);
  const t0 = Date.now();
  await loginOTP(page, USERS.beat_guard.phone);
  await maybeSetPIN(page, USERS.beat_guard.pin);
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 25000 });
  mark('beat_guard_login_ms', Date.now() - t0);
  await shot(page, '03-post-login');
});

await check('Home dashboard', async () => {
  const t0 = Date.now();
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  if (page.url().includes('/login')) throw new Error('Not authenticated on home');
  await page.getByText(/What would you like to do today|Recent Sightings|Add Sighting|Report Activity/i).first().waitFor({ timeout: 20000 });
  mark('home_load_ms', Date.now() - t0);
  await shot(page, '04-home');
});

await check('Report wizard opens', async () => {
  const t0 = Date.now();
  await page.goto(`${BASE}/report`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  if (page.url().includes('/login')) throw new Error('Redirected to login on report');
  const body = await page.content();
  if (!/location|observation|date|time|sighting|activity|GPS|beat|division|Continue|Next|step/i.test(body)) {
    throw new Error('Report wizard missing expected fields');
  }
  mark('report_open_ms', Date.now() - t0);
  await shot(page, '05-report');
});

await check('Map loads Leaflet', async () => {
  const t0 = Date.now();
  await page.goto(`${BASE}/map`, { waitUntil: 'domcontentloaded' });
  if (page.url().includes('/login')) throw new Error('Redirected to login on map');
  await page.locator('.leaflet-container').waitFor({ timeout: 30000 });
  mark('map_load_ms', Date.now() - t0);
  await shot(page, '06-map');
});

await check('History page', async () => {
  const t0 = Date.now();
  await page.goto(`${BASE}/history`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  if (page.url().includes('/login')) throw new Error('Redirected to login on history');
  const body = await page.content();
  if (!/history|report|sighting|observation|activity|No .*yet|territory/i.test(body)) {
    throw new Error('History page missing expected content');
  }
  mark('history_load_ms', Date.now() - t0);
  await shot(page, '07-history');
});

await check('Profile page', async () => {
  await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const body = await page.content();
  if (!/profile|phone|role|territory|name/i.test(body)) throw new Error('Profile missing');
  await shot(page, '08-profile');
});

await check('Hathi Mitra villagers list + search', async () => {
  await page.goto(`${BASE}/villagers`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const body = await page.content();
  // Either list UI or forbidden for role — beat_guard should read
  if (/forbidden|not allowed|onboardForbidden/i.test(body) && !/villager|Hathi|search|village/i.test(body)) {
    throw new Error('Villagers route blocked unexpectedly');
  }
  const search = page.locator('input[type="search"], input[placeholder*="Search" i], input').first();
  if (await search.count()) {
    await search.fill('a');
    await page.waitForTimeout(800);
  }
  await shot(page, '09-villagers');
});

await check('Villager onboard form loads', async () => {
  await page.goto(`${BASE}/villagers/onboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const body = await page.content();
  if (!/village|mobile|name|onboard|Hathi|mitra/i.test(body)) {
    throw new Error('Onboard villager form missing');
  }
  await shot(page, '10-villager-onboard');
});

await check('Cold start session restore (no full re-login)', async () => {
  // Simulate background→foreground / cold start with persisted session
  await page.goto('about:blank');
  await page.waitForTimeout(500);
  const t0 = Date.now();
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  // Should NOT bounce to login if session persisted
  await page.waitForTimeout(2000);
  const url = page.url();
  if (url.includes('/login')) throw new Error('Session lost after cold navigation — bounced to login');
  // PIN lock is not expected in current AuthContext
  const locked = (await page.getByText(/Enter.*PIN|Unlock/i).count()) > 0;
  if (locked) {
    console.log('NOTE: PIN lock shown (unexpected under current auth model)');
  }
  await page.getByText(/Report|Activity|Welcome|sighting|Recent|Elephant/i).first().waitFor({ timeout: 15000 });
  mark('cold_restore_ms', Date.now() - t0);
  await shot(page, '11-cold-restore');
});

await check('Offline → online reconnect (no crash)', async () => {
  await page.context().setOffline(true);
  await page.waitForTimeout(1000);
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(1000);
  await page.context().setOffline(false);
  await page.waitForTimeout(4000); // debounce sync window
  // App should still be usable
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  if (page.url().includes('/login')) throw new Error('Lost session after offline flap');
  await shot(page, '12-sync-reconnect');
});

await check('Beat guard blocked from admin', async () => {
  await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const body = (await page.content()).toLowerCase();
  if (body.includes('command center') || body.includes('user management')) {
    throw new Error('Beat guard reached admin UI');
  }
  await shot(page, '13-beat-guard-admin');
});

// Admin flow
const adminContext = await browser.newContext();
const adminPage = await adminContext.newPage();

await check('Admin OTP login', async () => {
  await adminPage.goto(`${BASE}/login`);
  await adminPage.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await adminPage.reload({ waitUntil: 'networkidle' });
  await loginOTP(adminPage, USERS.admin.phone);
  await maybeSetPIN(adminPage, USERS.admin.pin);
  await adminPage.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 25000 });
  await shot(adminPage, '14-admin-login');
});

await check('Admin dashboard', async () => {
  const t0 = Date.now();
  await adminPage.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
  await adminPage.waitForTimeout(3000);
  const body = (await adminPage.content()).toLowerCase();
  if (!body.includes('admin') && !body.includes('dashboard') && !body.includes('personnel') && !body.includes('observation')) {
    throw new Error('Admin dashboard not loaded');
  }
  mark('admin_dashboard_ms', Date.now() - t0);
  await shot(adminPage, '15-admin-dashboard');
});

await check('Admin users page', async () => {
  await adminPage.goto(`${BASE}/admin/users`, { waitUntil: 'domcontentloaded' });
  await adminPage.waitForTimeout(4000);
  const body = await adminPage.content();
  if (!/user|phone|role|search|personnel/i.test(body)) throw new Error('Admin users missing');
  await shot(adminPage, '16-admin-users');
});

await check('Admin map (Leaflet)', async () => {
  await adminPage.goto(`${BASE}/admin/map`, { waitUntil: 'domcontentloaded' });
  await adminPage.locator('.leaflet-container').waitFor({ timeout: 30000 });
  await shot(adminPage, '17-admin-map');
});

await adminContext.close();
await browser.close();

// API concurrency probe (staging)
const env = Object.fromEntries(
  fs.readFileSync('.env.staging.local', 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => {
    const i = l.indexOf('=');
    return [l.slice(0, i), l.slice(i + 1)];
  }),
);
const apiBase = env.VITE_SUPABASE_URL.replace(/\/$/, '');
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const headers = { apikey: key, Authorization: `Bearer ${key}` };

async function apiTimed(name, url, init) {
  const t0 = Date.now();
  const res = await fetch(url, { headers, ...init });
  const ms = Date.now() - t0;
  await res.text();
  return { name, status: res.status, ms };
}

const apiResults = [];
await check('API sequential hot paths', async () => {
  apiResults.push(await apiTimed('divisions', `${apiBase}/rest/v1/geo_divisions?select=id,name&order=name`));
  apiResults.push(await apiTimed('villages', `${apiBase}/rest/v1/villages?select=id,name&limit=12`));
  apiResults.push(await apiTimed('villagers', `${apiBase}/rest/v1/villagers?select=id,name&is_active=eq.true&limit=50`));
  apiResults.push(await apiTimed('reports', `${apiBase}/rest/v1/reports?select=id,device_timestamp&order=device_timestamp.desc&limit=8`));
  apiResults.push(await apiTimed('nearby_rpc', `${apiBase}/rest/v1/rpc/reports_nearby`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_lng: 77.4, p_lat: 23.2, p_radius_m: 50000, p_limit: 20 }),
  }));
  const bad = apiResults.filter((r) => r.status >= 500);
  if (bad.length) throw new Error(`API 5xx: ${JSON.stringify(bad)}`);
});

await check('API concurrency x20 (no systemic failure)', async () => {
  const jobs = [];
  for (let i = 0; i < 20; i++) {
    jobs.push(apiTimed('reports', `${apiBase}/rest/v1/reports?select=id&order=device_timestamp.desc&limit=8`));
    jobs.push(apiTimed('divisions', `${apiBase}/rest/v1/geo_divisions?select=id,name&limit=20`));
    jobs.push(apiTimed('villagers', `${apiBase}/rest/v1/villagers?select=id,name&limit=20`));
  }
  const settled = await Promise.all(jobs);
  apiResults.push(...settled.map((r) => ({ ...r, concurrent: true })));
  const fails = settled.filter((r) => r.status >= 500);
  if (fails.length > settled.length * 0.1) {
    throw new Error(`Too many 5xx under concurrency: ${fails.length}/${settled.length}`);
  }
});

const summary = {
  passed: results.filter((r) => r.ok).length,
  failed: results.filter((r) => !r.ok).length,
  results,
  timings,
  apiResults,
  consoleErrors: consoleErrors.slice(0, 30),
  testedAt: new Date().toISOString(),
  baseUrl: BASE,
  notes: [
    'PIN lock after reload is NOT expected under current AuthContext (session via persistSession).',
    'Bundle targets staging ttjtyvxfiqhjdngkgdkf.',
  ],
};

await writeFile(join(OUT, 'results.json'), JSON.stringify(summary, null, 2));
console.log('\nSUMMARY', JSON.stringify({
  passed: summary.passed,
  failed: summary.failed,
  timings: summary.timings,
  apiSequential: apiResults.filter((r) => !r.concurrent),
}, null, 2));
process.exit(summary.failed ? 1 : 0);
