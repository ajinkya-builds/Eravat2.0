/**
 * Emulator tests for 2.1.6 field issues:
 * 1. Offline cold start should not wait on Auth refresh (~8s).
 * 2. GPS should populate on the first attempt with a geo fix (no 2–3 refreshes).
 * 3. Location-off should surface the in-app "Turn on location" banner.
 *
 * Prereq: emulator running. Builds debug APK unless --skip-build.
 * Run: node scripts/emulator-offline-location.mjs [--skip-build]
 */
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { CdpPage } from './cdp-page.mjs';

const ROOT = process.cwd();
const PKG = 'com.forestdept.eravat';
const APK = join(ROOT, 'android/app/build/outputs/apk/debug/app-debug.apk');
const OUT = join(ROOT, '../Go live Prep - Staging/generated/emulator-offline-location');
const GEO_LNG = '80.988653';
const GEO_LAT = '23.181467';

const args = new Set(process.argv.slice(2));
const skipBuild = args.has('--skip-build');
const skipInstall = args.has('--skip-install');

const manifest = JSON.parse(
  readFileSync(
    join(ROOT, '../Go live Prep - Staging/generated/uat-testers/uat-testers-otp-manifest.json'),
    'utf8',
  ),
);
const beatGuard = manifest.find((x) => x.role === 'beat_guard');
if (!beatGuard) throw new Error('No beat_guard in UAT OTP manifest');

const results = [];
let page;

function sh(cmd, opts = {}) {
  return execSync(cmd, {
    encoding: 'utf8',
    stdio: opts.quiet ? ['pipe', 'pipe', 'pipe'] : 'inherit',
    cwd: opts.cwd,
  });
}

function adb(...parts) {
  return execSync(['adb', ...parts].join(' '), { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function adbOk(...parts) {
  try {
    return adb(...parts);
  } catch {
    return '';
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function acceptLocationDialog() {
  for (let i = 0; i < 5; i++) {
    const focus = adbOk('shell', 'dumpsys', 'window');
    if (!/LocationSettingsChecker/i.test(focus)) return;
    adbOk('shell', 'input', 'keyevent', '22');
    adbOk('shell', 'input', 'keyevent', '66');
    sleep(700);
  }
}

function launchApp() {
  adbOk('shell', 'am', 'force-stop', PKG);
  sleep(1200);
  let started = '';
  for (let i = 0; i < 4; i++) {
    started = adbOk('shell', 'am', 'start', '-n', `${PKG}/.MainActivity`);
    sleep(2500);
    acceptLocationDialog();
    if (adbOk('shell', 'pidof', PKG)) break;
  }
  sleep(1500);
  if (!adbOk('shell', 'pidof', PKG)) {
    throw new Error(`Eravat process not running after launch. am start: ${started || '(empty)'}`);
  }
}

function forwardDevtools() {
  let pid = '';
  for (let i = 0; i < 10; i++) {
    pid = adbOk('shell', 'pidof', PKG).replace(/\r/g, '');
    if (pid) break;
    sleep(1000);
  }
  if (!pid) throw new Error('Eravat process not running');
  try {
    adb('forward', '--remove-all');
  } catch {
    /* ignore */
  }
  adb('forward', 'tcp:9222', `localabstract:webview_devtools_remote_${pid}`);
  for (let i = 0; i < 20; i++) {
    sleep(500);
    try {
      const list = JSON.parse(execSync('curl -s --max-time 2 http://127.0.0.1:9222/json/list', { encoding: 'utf8' }));
      const target = list.find((t) => t.type === 'page' && String(t.url || '').includes('localhost'));
      if (target?.webSocketDebuggerUrl) return target.webSocketDebuggerUrl;
    } catch {
      /* WebView CDP not ready yet */
    }
  }
  throw new Error('No WebView page target found');
}

async function connectPage() {
  return CdpPage.connect(forwardDevtools());
}

async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log('PASS', name);
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
    console.log('FAIL', name, e.message);
    try {
      await page?.screenshot(join(OUT, `fail-${name.replace(/\s+/g, '-')}.png`));
    } catch {
      /* ignore */
    }
  }
}

function setNetwork(online) {
  adb('shell', 'svc', 'wifi', online ? 'enable' : 'disable');
  adb('shell', 'svc', 'data', online ? 'enable' : 'disable');
  sleep(online ? 2500 : 1500);
}

function setLocationEnabled(on) {
  try {
    adb('shell', 'cmd', 'location', 'set-location-enabled', on ? 'true' : 'false');
  } catch {
    adb('shell', 'settings', 'put', 'secure', 'location_mode', on ? '3' : '0');
  }
  if (on) {
    setMockGps();
  }
  sleep(1000);
}

function setMockGps() {
  adbOk('emu', 'geo', 'fix', GEO_LNG, GEO_LAT);
}

function grantLocation() {
  adb('shell', 'pm', 'grant', PKG, 'android.permission.ACCESS_FINE_LOCATION');
  adb('shell', 'pm', 'grant', PKG, 'android.permission.ACCESS_COARSE_LOCATION');
  try {
    adb('shell', 'appops', 'set', PKG, 'android:fine_location', 'allow');
  } catch {
    /* ignore */
  }
}

async function fillPlaceholder(placeholder, value) {
  const ok = await page.evaluate(
    (ph, val) => {
      const input = document.querySelector(`input[placeholder="${ph}"]`);
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, val);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return input.value === val;
    },
    placeholder,
    value,
  );
  if (!ok) throw new Error(`Input not found or not set: ${placeholder}`);
}

async function clickButton(matcher) {
  const clicked = await page.evaluate((pattern) => {
    const re = new RegExp(pattern, 'i');
    const btn = [...document.querySelectorAll('button')].find((b) => re.test(b.textContent || ''));
    if (!btn) return false;
    btn.click();
    return true;
  }, matcher);
  if (!clicked) throw new Error(`Button not found: ${matcher}`);
}

async function dismissIssueSheet() {
  await page.evaluate(() => {
    const form = document.querySelector('[data-testid="report-issue-form"]');
    const closeBtn = form?.querySelector('button[type="button"]');
    closeBtn?.click();
  });
}

async function waitForText(text, timeout = 15000) {
  await page.waitFor(
    `!!(document.body && document.body.innerText && document.body.innerText.includes(${JSON.stringify(text)}))`,
    timeout,
  );
}

const HOME_READY = '!!(document.body && /Add Sighting|साइटिंग जोड़ें|साइटिंग जोडा/i.test(document.body.innerText || ""))';

async function loginOTP() {
  const home = await page.evaluate(() =>
    /Add Sighting|साइटिंग जोड़ें|साइटिंग जोडा/i.test(document.body?.innerText || ''),
  );
  if (home) return;
  await page.evaluate(() => {
    window.location.href = 'https://localhost/login';
  });
  await page.waitFor(
    `!!document.querySelector('input[placeholder="9876543210"]') || ${HOME_READY}`,
    25000,
  );
  const alreadyIn = await page.evaluate(() =>
    /Add Sighting|साइटिंग जोड़ें|साइटिंग जोडा/i.test(document.body?.innerText || ''),
  );
  if (alreadyIn) return;
  await fillPlaceholder('9876543210', beatGuard.phone_app);
  await clickButton('Send OTP');
  await page.waitFor('!!document.querySelector(\'input[placeholder="Enter 6-digit code"]\')', 20000);
  await fillPlaceholder('Enter 6-digit code', beatGuard.otp);
  await clickButton('Verify');
  await page.waitFor(HOME_READY, 25000);
}

async function goToLocationStep() {
  await page.goto('https://localhost/report');
  await page.sleep(1500);
  const injected = await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="e2e-inject-photo"]');
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (!injected) throw new Error('Staging test photo button missing');
  await clickButton('Continue');
  await page.sleep(600);
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /Direct Sighting/i.test(b.textContent || ''));
    btn?.click();
  });
  await page.sleep(400);
  await page.evaluate(() => {
    const plus = document.querySelector('button .lucide-plus')?.closest('button');
    plus?.click();
  });
  await clickButton('Continue');
  await page.sleep(1500);
}

mkdirSync(OUT, { recursive: true });

if (!skipBuild) {
  console.log('Building staging web + Android debug APK…');
  sh('node scripts/build-android-staging.mjs', { cwd: ROOT });
  sh('./gradlew assembleDebug', { cwd: join(ROOT, 'android') });
}

if (!existsSync(APK)) {
  throw new Error(`Missing ${APK}. Build first or omit --skip-build.`);
}

const devices = adb('devices')
  .split('\n')
  .slice(1)
  .filter((l) => l.includes('device') && !l.includes('devices'));
if (!devices.length) {
  throw new Error('No emulator/device connected. Start an AVD first.');
}

if (!skipInstall) {
  execSync(`adb install -r -t "${APK}"`, { stdio: 'inherit' });
}

setNetwork(true);
grantLocation();
setLocationEnabled(true);
setMockGps();

launchApp();
page = await connectPage();

await check('Login while online', async () => {
  await loginOTP();
  await page.screenshot(join(OUT, '01-dashboard.png'));
});

await check('GPS fills on first location step (no refresh tap)', async () => {
  grantLocation();
  setLocationEnabled(true);
  setMockGps();
  await page.evaluate(() => {
    window.location.href = 'https://localhost/report';
  });
  await page.sleep(2500);
  await page.waitFor(
    '!!(document.body && /photo evidence|Take Photo|GPS are ready|GPS is not ready|Capturing date/i.test(document.body.innerText || ""))',
    25000,
  );
  try {
    await page.waitFor(
      '!!(document.body && /GPS are ready|GPS तैयार|GPS तयार/i.test(document.body.innerText || ""))',
      20000,
    );
  } catch {
    const body = await page.evaluate(() => (document.body?.innerText || '').slice(0, 1200));
    throw new Error(`GPS not ready on first attempt. UI: ${body}`);
  }
  await page.screenshot(join(OUT, '02-gps-first-try.png'));
});

await check('Location-off banner appears', async () => {
  // Bottom nav is hidden on /report; the banner lives in AppLayout on this route too.
  acceptLocationDialog();
  setLocationEnabled(false);
  await page.waitFor(
    '!!(document.body && /turn on location|लोकेशन चालू|स्थान चालू/i.test(document.body.innerText || ""))',
    12000,
  );
  await page.screenshot(join(OUT, '03-location-off-banner.png'));
});

await check('Turning location back on hides banner', async () => {
  setLocationEnabled(true);
  acceptLocationDialog();
  await page.waitFor(
    '!!(document.body && !/turn on location so gps is ready/i.test(document.body.innerText || ""))',
    12000,
  );
  await page.screenshot(join(OUT, '04-location-on.png'));
});

await check('Offline cold start reaches home quickly', async () => {
  await page.evaluate(() => {
    window.location.href = 'https://localhost/';
  });
  await page.sleep(800);
  setNetwork(false);
  if (page) page.close();
  launchApp();
  page = await connectPage();
  const started = Date.now();
  await page.waitFor(HOME_READY, 8000);
  const elapsed = Date.now() - started;
  console.log('offline cold start ms (webview ready → home)', elapsed);
  if (elapsed > 5000) {
    throw new Error(`Offline cold start took ${elapsed}ms after WebView connect (budget 5000ms)`);
  }
  await page.screenshot(join(OUT, '05-offline-cold-start.png'));
});

await check('Offline report wizard still opens', async () => {
  await dismissIssueSheet();
  await page.evaluate(() => {
    window.location.href = 'https://localhost/report';
  });
  await page.waitFor(
    '!!(document.body && /photo evidence|Take Photo|GPS are ready|GPS is not ready|Capturing date/i.test(document.body.innerText || ""))',
    20000,
  );
  await page.screenshot(join(OUT, '06-offline-report.png'));
});

setNetwork(true);
if (page) page.close();

const summary = {
  passed: results.filter((r) => r.ok).length,
  failed: results.filter((r) => r.ok === false).length,
  results,
  testedAt: new Date().toISOString(),
};
await writeFile(join(OUT, 'results.json'), JSON.stringify(summary, null, 2));
console.log('\nSUMMARY', summary);
process.exit(summary.failed ? 1 : 0);
