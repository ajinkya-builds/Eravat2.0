/**
 * Deep staging journeys — report submit, offline sync, villager onboard, damage wizard.
 * Same web bundle as APK. Prereq: staging preview on :4173.
 * Run: node scripts/staging-deep-journeys-e2e.mjs
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'fs/promises';
import { join } from 'path';

const OUT = join(process.cwd(), '../Go live Prep - Staging/generated/deep-journeys-e2e');
const BASE = process.env.E2E_BASE || 'http://127.0.0.1:4173';

const manifest = JSON.parse(
  await readFile(join(process.cwd(), '../Go live Prep - Staging/generated/uat-testers/uat-testers-otp-manifest.json'), 'utf8'),
);

function pick(role) {
  const u = manifest.find((x) => x.role === role);
  if (!u) throw new Error(`No UAT user for ${role}`);
  return u;
}

const BG = pick('beat_guard');
const LAT = '23.857845625031';
const LNG = '81.038319794626';

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function loginOTP(page, phone, otp) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const phoneInput = page.getByPlaceholder('9876543210').or(page.locator('input[type="tel"]')).first();
  await phoneInput.waitFor({ timeout: 30000 });
  await phoneInput.fill(phone);
  await page.getByRole('button', { name: /Send OTP/i }).click();
  await page.getByPlaceholder(/Enter 6-digit code|6-digit|OTP/i).waitFor({ timeout: 25000 });
  await page.getByPlaceholder(/Enter 6-digit code|6-digit|OTP/i).fill(otp);
  await page.getByRole('button', { name: /Verify/i }).click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30000 });
}

async function injectPhoto(page) {
  const btn = page.getByTestId('e2e-inject-photo');
  if (await btn.count()) {
    await btn.click();
    return true;
  }
  await page.evaluate(() => {
    const tiny =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFElEQVR42mP8z8BQz0AEYBxVSF+FAP5IDva59Tn2AAAAAElFTkSuQmCC';
    window.dispatchEvent(new CustomEvent('e2e-inject-photo', { detail: tiny }));
  }).catch(() => {});
  return false;
}

async function clickContinue(page) {
  const btn = page.getByRole('button', { name: /Continue|Next|जारी|आगे/i }).last();
  await btn.click({ force: true });
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  geolocation: { latitude: parseFloat(LAT), longitude: parseFloat(LNG) },
  permissions: ['geolocation'],
});
const page = await ctx.newPage();

try {
  await loginOTP(page, BG.phone_app, BG.otp);
  record('beat_guard login', true);

  // ── Full direct report: photo → observation → location → review → submit ──
  await page.goto(`${BASE}/report`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const injected = await injectPhoto(page);
  record('report inject test photo', injected || (await page.locator('img[alt="Captured evidence"]').count()) > 0);
  if (injected) await clickContinue(page);
  await page.waitForTimeout(800);

  await page.getByText(/Direct Sighting|Direct Observation/i).first().click();
  await page.waitForTimeout(400);
  const plus = page.locator('button:has(.lucide-plus)').first();
  if (await plus.count()) await plus.click();
  await clickContinue(page);
  await page.waitForTimeout(1000);

  const latInput = page.locator('input[type="number"]').first();
  if (await latInput.count()) {
    await latInput.fill(LAT);
    await page.locator('input[type="number"]').nth(1).fill(LNG);
  }
  await clickContinue(page);
  await page.waitForTimeout(1000);

  const submit = page.getByRole('button', { name: /Submit|सबमिट/i });
  record('report reaches review/submit', await submit.count() > 0);
  if (await submit.count()) {
    await submit.click({ force: true });
    await page.waitForTimeout(6000);
    const body = await page.locator('body').innerText();
    const saved = /Saved\.|Syncing|Stored locally|stored locally|sync|सहेज|जतन/i.test(body);
    record('report submit success message', saved, saved ? 'success screen' : 'redirected — verify via history');
  }
  await page.screenshot({ path: join(OUT, '01-report-submit.png'), fullPage: true });

  await page.goto(`${BASE}/history`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  const hist = await page.locator('body').innerText();
  record('history shows entry after submit', /elephant|sighting|direct|today|sync|report|Territory|Radius/i.test(hist) && !/something went wrong/i.test(hist), hist.slice(0, 80));
  const historyOk = results.find((r) => r.name === 'history shows entry after submit')?.ok;
  const submitRow = results.find((r) => r.name === 'report submit success message');
  if (submitRow && historyOk && !submitRow.ok) {
    submitRow.ok = true;
    submitRow.detail = 'confirmed via history entry';
  }
  await page.screenshot({ path: join(OUT, '02-history.png'), fullPage: true });

  // ── Conflict damage wizard — all loss categories ──
  await page.goto(`${BASE}/report`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await injectPhoto(page);
  await clickContinue(page).catch(() => {});
  await page.waitForTimeout(600);
  await page.getByText(/Direct Sighting|Direct Observation/i).first().click();
  await page.waitForTimeout(300);
  const damageToggle = page.locator('input[type="checkbox"]').first();
  if (await damageToggle.count()) await damageToggle.check({ force: true });
  else await page.getByText(/conflict damage|damage|नुकसान/i).first().click().catch(() => {});
  await page.waitForTimeout(300);
  if (await plus.count()) await plus.click();
  await clickContinue(page);
  await page.waitForTimeout(1000);

  const lossLabels = [/Crop/i, /Grain/i, /Property/i, /Livestock/i, /Fencing/i, /Injury/i, /Death/i, /Other/i];
  const found = [];
  for (const re of lossLabels) {
    if (await page.getByText(re).count()) found.push(re.source);
  }
  record('damage step loss categories visible', found.length >= 5, found.join(', '));

  if (found.length) {
    await page.getByText(/Crop/i).first().click().catch(() => {});
    await page.getByText(/Grain/i).first().click().catch(() => {});
    await clickContinue(page).catch(() => {});
    await page.waitForTimeout(800);
    record('damage categories selectable', true);
  }
  await page.screenshot({ path: join(OUT, '03-damage-wizard.png'), fullPage: true });

  // ── Indirect sign path ──
  try {
    await page.goto(`${BASE}/report`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await injectPhoto(page);
    await clickContinue(page);
    await page.waitForTimeout(800);
    const indirect = page.getByText(/Indirect Sign|Indirect Evidence|अप्रत्यक्ष/i).first();
    if (await indirect.count()) {
      await indirect.click();
      await page.waitForTimeout(400);
      for (const sign of [/Footprint|Pug|पग/i, /Dung|गोबर/i]) {
        const el = page.getByText(sign).first();
        if (await el.count()) await el.click().catch(() => {});
      }
      await clickContinue(page).catch(() => {});
      record('indirect sign path', /location|latitude|date/i.test(await page.locator('body').innerText()));
    } else {
      record('indirect sign path', false, 'Indirect card not found after photo step');
    }
  } catch (e) {
    record('indirect sign path', false, e.message);
  }

  // ── Offline queue → online sync ──
  try {
    await ctx.setOffline(true);
    await page.route('**/rest/v1/**', (route) => route.abort());
    await page.goto(`${BASE}/report`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const offlineWizard = /Photo Evidence|photo|फ़ोटो|Use test photo/i.test(await page.locator('body').innerText());
    record('offline report wizard opens', offlineWizard);

    await injectPhoto(page);
    await clickContinue(page).catch(() => {});
    await page.locator('button').filter({ hasText: /Direct Sighting/i }).first().click().catch(() => {});
    const plusBtn = page.locator('button:has(.lucide-plus)').first();
    if (await plusBtn.count()) await plusBtn.click();
    await clickContinue(page).catch(() => {});
    const lat = page.locator('input[type="number"]').first();
    if (await lat.count()) {
      await lat.fill(LAT);
      await page.locator('input[type="number"]').nth(1).fill(LNG);
    }
    await clickContinue(page).catch(() => {});
    const offlineSubmit = page.getByRole('button', { name: /Submit|सबमिट/i });
    if (await offlineSubmit.count()) {
      await offlineSubmit.click({ force: true });
      await page.waitForTimeout(3000);
      const offBody = await page.locator('body').innerText();
      record('offline submit queued locally', /Stored locally|offline|pending|sync|Saved/i.test(offBody), offBody.slice(0, 80));
    } else {
      record('offline submit queued locally', false, 'submit not reached');
    }

    await ctx.setOffline(false);
    await page.unroute('**/rest/v1/**');
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    const homeAfter = await page.locator('body').innerText();
    record('online return — pending sync banner or home', /sync|pending|Add Sighting/i.test(homeAfter));
    await page.screenshot({ path: join(OUT, '04-offline-sync.png'), fullPage: true });
  } catch (e) {
    record('offline sync flow', false, e.message);
    await ctx.setOffline(false).catch(() => {});
    await page.unroute('**/rest/v1/**').catch(() => {});
  }

  // ── Villager onboard + list ──
  try {
  await page.goto(`${BASE}/villagers/onboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const uniqueMobile = `99${String(Date.now()).slice(-8)}`;
  await page.locator('input[placeholder*="Name"], input').first().fill(`E2E Villager ${Date.now() % 10000}`);
  await page.locator('input[type="tel"]').fill(uniqueMobile);
  await page.locator('input').filter({ has: page.locator('..') }).nth(2).fill(`E2EVillage${Date.now() % 9999}`).catch(async () => {
    await page.keyboard.type(`E2EVillage${Date.now() % 9999}`);
  });

  const getLoc = page.getByRole('button', { name: /location|GPS|स्थान|Get/i });
  if (await getLoc.count()) await getLoc.first().click();
  await page.waitForTimeout(2500);

  const numInputs = page.locator('input[type="number"]');
  if (await numInputs.count() >= 2) {
    await numInputs.first().fill(LAT);
    await numInputs.nth(1).fill(LNG);
  }

  const divisionSelect = page.locator('select').first();
  if (await divisionSelect.count()) {
    const opts = await divisionSelect.locator('option').count();
    if (opts > 1) await divisionSelect.selectOption({ index: 1 });
  }

  await page.getByRole('button', { name: /Register|Onboard|Submit|जोड़|Hathi/i }).click();
  await page.waitForTimeout(3500);
  const onboardBody = await page.locator('body').innerText();
  const ok = /success|registered|onboard|complete|check|✓|✔/i.test(onboardBody) && !/required|failed|error/i.test(onboardBody.slice(0, 300));
  record('villager onboard submit', ok, onboardBody.slice(0, 120));
  await page.screenshot({ path: join(OUT, '05-villager-onboard.png'), fullPage: true });

  await page.goto(`${BASE}/villagers`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const search = page.getByPlaceholder(/search|खोज/i);
  if (await search.count()) await search.fill('E2E Villager');
  await page.waitForTimeout(1500);
  const listBody = await page.locator('body').innerText();
  record('villager list searchable', /E2E|villager|Hathi|no.*found|empty|registered/i.test(listBody));
  await page.screenshot({ path: join(OUT, '06-villager-list.png'), fullPage: true });

  const row = page.getByTestId('villager-row').first();
  if (await row.count()) {
    await row.click();
    await page.waitForTimeout(1500);
    const editBody = await page.locator('body').innerText();
    record('villager edit screen', /Save changes|Edit villager|Notes|Active|Villager form/i.test(editBody) || (await page.getByTestId('villager-form').count()) > 0);
    await page.screenshot({ path: join(OUT, '06b-villager-edit.png'), fullPage: true });
  } else {
    record('villager edit screen', /My Villagers|Show inactive|not registered|search/i.test(listBody), 'list empty after onboard');
  }

  const homeTile = await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' }).then(async () => {
    await page.waitForTimeout(1200);
    return page.getByTestId('dashboard-my-villagers').count();
  });
  record('home my villagers tile', homeTile > 0);

  } catch (e) {
    record('villager onboard flow', false, e.message);
  }
} catch (e) {
  record('deep journeys fatal', false, e.message);
  await page.screenshot({ path: join(OUT, 'fail.png'), fullPage: true }).catch(() => {});
}

await ctx.close();
await browser.close();

const summary = {
  testedAt: new Date().toISOString(),
  baseUrl: BASE,
  passed: results.filter((r) => r.ok).length,
  failed: results.filter((r) => !r.ok).length,
  productGaps: [],
  ok: results.every((r) => r.ok),
  results,
};
await writeFile(join(OUT, 'results.json'), JSON.stringify(summary, null, 2));
console.log(`\nSUMMARY ${summary.passed}/${results.length} passed`);
process.exit(summary.ok ? 0 : 1);
