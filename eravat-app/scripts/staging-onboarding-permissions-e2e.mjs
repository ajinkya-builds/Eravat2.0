/**
 * Staging E2E: admin onboarding permission toggles + beat guard home CTAs.
 * Prereq: preview on :4173, STAGE_SUPABASE_SERVICE_ROLE in env for flag restore.
 * Run: node scripts/staging-onboarding-permissions-e2e.mjs
 */
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile, readFile } from 'fs/promises';
import { join } from 'path';

const OUT = join(process.cwd(), '../Go live Prep - Staging/generated/onboarding-permissions-e2e');
const BASE = process.env.E2E_BASE || 'http://127.0.0.1:4173';
const STAGE_URL = process.env.VITE_SUPABASE_URL || process.env.STAGE_SUPABASE_URL;
const STAGE_KEY = process.env.STAGE_SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY;

const manifest = JSON.parse(
  await readFile(join(process.cwd(), '../Go live Prep - Staging/generated/uat-testers/uat-testers-otp-manifest.json'), 'utf8'),
);

function pick(role) {
  const u = manifest.find((x) => x.role === role);
  if (!u) throw new Error(`No UAT user for ${role}`);
  return u;
}

const ADMIN = pick('admin');
const BG = pick('beat_guard');

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function loginOTP(page, phone, otp) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('9876543210').waitFor({ timeout: 20000 });
  await page.getByPlaceholder('9876543210').fill(phone);
  await page.getByRole('button', { name: /Send OTP/i }).click();
  await page.getByPlaceholder(/Enter 6-digit code/i).waitFor({ timeout: 20000 });
  await page.getByPlaceholder(/Enter 6-digit code/i).fill(otp);
  await page.getByRole('button', { name: /Verify/i }).click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30000 });
}

const admin = STAGE_URL && STAGE_KEY
  ? createClient(STAGE_URL, STAGE_KEY, { auth: { persistSession: false } })
  : null;

async function readBeatGuardFlags() {
  if (!admin) return null;
  const { data, error } = await admin
    .from('role_onboarding_config')
    .select('can_add_hathi_mitra, can_add_villager')
    .eq('role', 'beat_guard')
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function setBeatGuardFlags(hathi, villager) {
  if (!admin) throw new Error('STAGE_SUPABASE_SERVICE_ROLE required');
  const { error } = await admin
    .from('role_onboarding_config')
    .update({ can_add_hathi_mitra: hathi, can_add_villager: villager })
    .eq('role', 'beat_guard');
  if (error) throw error;
}

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
let before = null;

try {
  if (admin) {
    before = await readBeatGuardFlags();
    record('Read beat_guard flags', true, JSON.stringify(before));
  } else {
    record('Read beat_guard flags', false, 'no service role — skipped DB checks');
  }

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await loginOTP(adminPage, ADMIN.phone_app, ADMIN.otp);
  await adminPage.goto(`${BASE}/admin/settings`, { waitUntil: 'domcontentloaded' });
  await adminPage.getByTestId('onboarding-toggle-beat_guard-hathi').waitFor({ timeout: 20000 });

  const wasOn = (await adminPage.getByTestId('onboarding-toggle-beat_guard-hathi').getAttribute('aria-checked')) === 'true';
  if (wasOn) {
    await adminPage.getByTestId('onboarding-toggle-beat_guard-hathi').click();
    await adminPage.waitForTimeout(1500);
  }
  record('Admin toggled beat_guard Hathi off', (await adminPage.getByTestId('onboarding-toggle-beat_guard-hathi').getAttribute('aria-checked')) === 'false');

  if (admin) {
    const after = await readBeatGuardFlags();
    record('DB beat_guard hathi false', after?.can_add_hathi_mitra === false, JSON.stringify(after));
  }

  await adminContext.close();

  const bgContext = await browser.newContext();
  const bgPage = await bgContext.newPage();
  await loginOTP(bgPage, BG.phone_app, BG.otp);
  await bgPage.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await bgPage.waitForTimeout(2000);
  const onboardVisible = (await bgPage.getByText(/Onboard Hathi Mitra/i).count()) > 0;
  record('Beat guard home hides Onboard Hathi Mitra', !onboardVisible);
  await bgContext.close();

  if (admin && before) {
    await setBeatGuardFlags(before.can_add_hathi_mitra, before.can_add_villager);
    const restored = await readBeatGuardFlags();
    record('DB flags restored', restored?.can_add_hathi_mitra === before.can_add_hathi_mitra);
  }
} catch (e) {
  record('onboarding-permissions fatal', false, e.message);
  if (admin && before) {
    await setBeatGuardFlags(before.can_add_hathi_mitra, before.can_add_villager).catch(() => {});
  }
}

await browser.close();

const summary = {
  passed: results.filter((r) => r.ok).length,
  failed: results.filter((r) => !r.ok).length,
  results,
  testedAt: new Date().toISOString(),
};
await writeFile(join(OUT, 'results.json'), JSON.stringify(summary, null, 2));
console.log('\nSUMMARY', summary);
process.exit(summary.failed ? 1 : 0);
