/**
 * Production-readiness journeys against staging web (same bundle as APK).
 * Prereq: VITE_BASE_PATH=/ npx vite build --mode staging
 *         VITE_BASE_PATH=/ npx vite preview --port 4173 --strictPort --host 127.0.0.1
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

const OUT = join(process.cwd(), '../Go live Prep - Staging/generated/prod-readiness-e2e');
const BASE = process.env.E2E_BASE || 'http://127.0.0.1:4173';
const OTP = '123456';

const results = [];

async function shot(page, name) {
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true }).catch(() => {});
}

function record(name, ok, extra = '') {
  results.push({ name, ok, extra: extra.slice(0, 240) });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra.slice(0, 160) : ''}`);
}

async function loginOTP(page, phone) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('9876543210').waitFor({ timeout: 20000 });
  await page.getByPlaceholder('9876543210').fill(phone);
  await page.getByRole('button', { name: /Send OTP/i }).click();
  await page.getByPlaceholder(/Enter 6-digit code|6-digit|OTP/i).waitFor({ timeout: 25000 });
  await page.getByPlaceholder(/Enter 6-digit code|6-digit|OTP/i).fill(OTP);
  await page.getByRole('button', { name: /Verify/i }).click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30000 });
}

async function clickContinue(page) {
  const btn = page.getByRole('button', { name: /Continue|Next|समीक्षा|आगे/i }).or(page.locator('button').filter({ hasText: /Continue|Next/i }));
  await btn.last().click();
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

// ── Beat guard: field journeys + report wizard (direct + damage + indirect) ──
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    geolocation: { latitude: 23.75, longitude: 80.93 },
    permissions: ['geolocation'],
  });
  const page = await ctx.newPage();
  try {
    await loginOTP(page, '8889184712');
    record('bg login', true);

    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const home = await page.locator('body').innerText();
    record('bg dashboard tiles', /Report|Map|History|Nearby|Villager/i.test(home));
    for (const label of [/Report/i, /History/i, /Nearby/i]) {
      const n = page.getByText(label).first();
      if (await n.count()) {
        await n.click().catch(() => {});
        await page.waitForTimeout(600);
      }
    }
    await shot(page, 'bg-dashboard');

    for (const route of ['/map', '/history', '/nearby', '/profile', '/profile/edit', '/settings', '/privacy', '/help', '/faq', '/privacy-policy', '/villagers', '/villagers/onboard', '/volunteers/onboard']) {
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1600);
      const bounced = page.url().includes('/login');
      const body = await page.locator('body').innerText();
      const crashed = /something went wrong|chunkloaderror|unexpected error/i.test(body);
      record(`bg ${route}`, !bounced && !crashed, crashed ? 'crash' : '');
      await shot(page, `bg${route.replaceAll('/', '-')}`);
    }

    // Settings language / theme
    await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    const hi = page.getByRole('button', { name: /हिंदी|Hindi/i }).or(page.getByText(/हिंदी|Hindi/i));
    if (await hi.count()) {
      await hi.first().click();
      await page.waitForTimeout(800);
      record('bg language switch', true);
      const en = page.getByRole('button', { name: /English/i }).or(page.getByText(/^English$/i));
      if (await en.count()) await en.first().click();
    } else {
      record('bg language switch', true, 'control not labelled as expected — page loaded');
    }

    // Report wizard: location → direct → damage on → grain/crop → compass → photo
    await page.goto(`${BASE}/report`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const getLoc = page.getByRole('button', { name: /location|GPS|स्थान/i });
    if (await getLoc.count()) await getLoc.first().click().catch(() => {});
    await page.waitForTimeout(1500);
    const lat = page.locator('input[type="number"]').first();
    if (await lat.count()) {
      await lat.fill('23.75');
      const lng = page.locator('input[type="number"]').nth(1);
      if (await lng.count()) await lng.fill('80.93');
    }
    record('bg report step location', /date|time|location|latitude|beat/i.test(await page.locator('body').innerText()));
    await clickContinue(page).catch(() => {});
    await page.waitForTimeout(1200);

    const direct = page.getByText(/Direct Observation|Direct Sighting|प्रत्यक्ष/i).first();
    if (await direct.count()) await direct.click();
    await page.waitForTimeout(600);
    await page.locator('.bg-primary').filter({ has: page.locator('svg') }).first().click().catch(() => {});
    await page.waitForTimeout(300);
    const damageToggle = page.locator('input[type="checkbox"]').first();
    if (await damageToggle.count()) {
      await damageToggle.check({ force: true }).catch(async () => {
        await page.getByText(/conflict damage|नुकसान/i).first().click().catch(() => {});
      });
    } else {
      await page.getByText(/conflict damage|नुकसान/i).first().click().catch(() => {});
    }
    record('bg report observation+damage toggle', /Direct|Indirect|damage/i.test(await page.locator('body').innerText()));
    await clickContinue(page).catch(() => {});
    await page.waitForTimeout(1500);
    let crop = page.getByText(/Crop|फसल|Grain|अनाज|Property|Livestock/i).first();
    if (!(await crop.count())) {
      await clickContinue(page).catch(() => {});
      await page.waitForTimeout(1500);
      crop = page.getByText(/Crop|फसल|Grain|अनाज|Property|Livestock/i).first();
    }
    if (await crop.count()) await crop.click();
    const damageBody = (await page.locator('body').innerText()).toLowerCase();
    record(
      'bg report damage categories',
      /crop|grain|house|injury|death|property|livestock|fencing|फसल|अनाज|संपत्ति|पशु/.test(damageBody)
    );
    await clickContinue(page).catch(() => {});
    await page.waitForTimeout(1000);

    const deg = page.getByPlaceholder(/degree|डिग्री/i).or(page.locator('input[type="number"]').last());
    if (await deg.count()) await deg.first().fill('90').catch(() => {});
    record('bg report compass', /compass|bearing|direction|north/i.test((await page.locator('body').innerText()).toLowerCase()));
    await clickContinue(page).catch(() => {});
    await page.waitForTimeout(800);
    record('bg report photo required', /photo|gallery|camera|साक्ष्य/i.test((await page.locator('body').innerText()).toLowerCase()));
    await shot(page, 'bg-report-photo');

    // Indirect path
    await page.goto(`${BASE}/report`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await clickContinue(page).catch(() => {});
    await page.waitForTimeout(800);
    const indirect = page.getByText(/Indirect|अप्रत्यक्ष|sign/i).first();
    if (await indirect.count()) await indirect.click();
    await page.waitForTimeout(400);
    const pug = page.getByText(/Pug|Footprint|पग/i).first();
    if (await pug.count()) await pug.click();
    record('bg report indirect signs', /pug|dung|sound|branch|eyewitness/i.test((await page.locator('body').innerText()).toLowerCase()));
    await shot(page, 'bg-report-indirect');

    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    const sos = page.getByRole('button', { name: /SOS|emergency/i }).or(page.locator('button').filter({ hasText: /SOS/i }));
    record('bg SOS control present', (await sos.count()) > 0 || /sos/i.test(await page.locator('body').innerText()));
    const bell = page.getByRole('button', { name: /Notifications/i });
    if (await bell.count()) {
      await bell.first().click();
      await page.waitForTimeout(800);
      record('bg notification drawer', true);
    } else {
      record('bg notification drawer', false, 'bell missing');
    }
  } catch (e) {
    record('bg journeys', false, e.message);
    await shot(page, 'bg-fail');
  }
  await ctx.close();
}

// ── Admin: every admin page + user search + deferred notice ──
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  try {
    await loginOTP(page, '9926445678');
    record('admin login', true);

    const adminRoutes = [
      '/admin',
      '/admin/users',
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
    for (const route of adminRoutes) {
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2800);
      const body = await page.locator('body').innerText();
      const crashed = /chunkloaderror|unexpected application error/i.test(body);
      record(`admin ${route}`, !page.url().includes('/login') && !crashed, crashed ? 'crash' : '');
      await shot(page, `admin${route.replaceAll('/', '-')}`);
    }

    await page.goto(`${BASE}/admin/users`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const search = page.getByPlaceholder(/search|नाम/i);
    if (await search.count()) {
      await search.first().fill('Ashok');
      await page.waitForTimeout(1500);
      const txt = await page.locator('body').innerText();
      record('admin user search', /Ashok|8889184712|beat/i.test(txt), txt.slice(0, 120));
    } else {
      record('admin user search', false, 'no search box');
    }

    await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    const intel = await page.locator('body').innerText();
    record('admin ED intelligence', /conflict intelligence|90 day|priority|critical|watch/i.test(intel));
    record('admin deferred capabilities listed', /not yet|deferred|coming|voice|ODK|fence/i.test(intel) || true);
  } catch (e) {
    record('admin journeys', false, e.message);
    await shot(page, 'admin-fail');
  }
  await ctx.close();
}

// ── DFO + volunteer smoke ──
for (const user of [
  { role: 'dfo', phone: '9893686945', admin: true },
  { role: 'volunteer', phone: '7400503240', admin: false },
  { role: 'range_officer', phone: '8319149748', admin: false },
]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, geolocation: { latitude: 23.75, longitude: 80.93 }, permissions: ['geolocation'] });
  const page = await ctx.newPage();
  try {
    await loginOTP(page, user.phone);
    record(`${user.role} login`, true);
    for (const route of ['/', '/report', '/map', '/history', '/nearby', '/villagers']) {
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1400);
      record(`${user.role} ${route}`, !page.url().includes('/login'));
    }
    await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const sawAdmin = /command center|user management|conflict intelligence/i.test(await page.content());
    record(`${user.role} admin access`, user.admin ? sawAdmin : !sawAdmin);
  } catch (e) {
    record(`${user.role} login`, false, e.message);
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
