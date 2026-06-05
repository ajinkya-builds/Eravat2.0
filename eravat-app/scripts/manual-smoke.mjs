/**
 * Headless manual smoke via Playwright — run: node scripts/manual-smoke.mjs
 * Requires dev server at http://localhost:5173/Eravat2.0/
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'fs/promises';

const BASE = 'http://localhost:5173/Eravat2.0';
const FIELD = { phone: '8899776655', password: 'pass123' };
const ADMIN = { phone: '9988775566', password: 'P@ss123' };

const results = [];

async function login(page, creds) {
  await page.goto(`${BASE}/login`);
  const passwordTab = page.getByRole('button', { name: /Login with Password|पासवर्ड/i });
  if (await passwordTab.isVisible().catch(() => false)) await passwordTab.click();
  await page.getByPlaceholder('+91 98765 43210').fill(creds.phone);
  await page.getByPlaceholder('••••••••').fill(creds.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 60_000 });
}

async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`OK  ${name}`);
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
    console.log(`FAIL ${name}: ${e.message}`);
  }
}

const browser = await chromium.launch();
const page = await browser.newPage();

await check('Field login', async () => {
  await login(page, FIELD);
  await page.waitForTimeout(1000);
});

await check('Dashboard', async () => {
  await page.goto(`${BASE}/`);
  await page.getByText(/Report Activity|What would you like/i).first().waitFor({ timeout: 15_000 });
});

await check('Report page', async () => {
  await page.goto(`${BASE}/report`);
  await page.waitForTimeout(2000);
});

await check('Map page', async () => {
  await page.goto(`${BASE}/map`);
  await page.locator('.leaflet-container').waitFor({ timeout: 20_000 });
});

await check('Profile', async () => {
  await page.goto(`${BASE}/profile`);
  await page.waitForTimeout(1500);
});

await page.context().clearCookies();
await page.evaluate(() => localStorage.clear());

await check('Admin login', async () => {
  await login(page, ADMIN);
});

await check('Admin dashboard', async () => {
  await page.goto(`${BASE}/admin`);
  await page.waitForTimeout(3000);
});

await check('Admin users', async () => {
  await page.goto(`${BASE}/admin/users`);
  await page.waitForTimeout(2000);
});

await browser.close();

const summary = {
  at: new Date().toISOString(),
  passed: results.filter((r) => r.ok).length,
  failed: results.filter((r) => !r.ok).length,
  results,
};
await mkdir('../docs/testing', { recursive: true });
await writeFile('../docs/testing/manual-smoke-results.json', JSON.stringify(summary, null, 2));
console.log('\nSummary:', summary.passed, 'passed,', summary.failed, 'failed');
process.exit(summary.failed > 0 ? 1 : 0);
