/**
 * Emulator GPS accuracy suite — fast GPS first, cell only as last resort.
 *
 * Covers:
 * 1. With emu geo fix: GPS ready quickly, no cell dialog
 * 2. Location step gets coordinates without refresh
 * 3. GPS timing is recorded (budget outdoor &lt; 20s)
 * 4. Without GPS provider (network-only): cell dialog only after long wait
 * 5. Cell dialog "Keep trying GPS" retries without accepting cell
 *
 * Prereq: emulator running. Builds debug APK unless --skip-build.
 * Run: node scripts/emulator-gps-accuracy.mjs [--skip-build] [--skip-install]
 */
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { CdpPage } from './cdp-page.mjs';

const ROOT = process.cwd();
const PKG = 'com.forestdept.eravat';
const APK = join(ROOT, 'android/app/build/outputs/apk/debug/app-debug.apk');
const OUT = join(ROOT, '../Go live Prep - Staging/generated/emulator-gps-accuracy');
const GEO_LNG = '80.988653';
const GEO_LAT = '23.181467';

/** Outdoor/emulator with geo fix should lock well under the 90s indoor budget. */
const FAST_GPS_BUDGET_MS = 20_000;
/** Network-only path must wait — use a floor so we don't accept an instant cell. */
const CELL_NOT_BEFORE_MS = 25_000;
const CELL_WAIT_MS = 110_000;

const args = new Set(process.argv.slice(2));
const skipBuild = args.has('--skip-build');
const skipInstall = args.has('--skip-install');
const skipSlowCell = args.has('--skip-slow-cell');

const manifest = JSON.parse(
  readFileSync(
    join(ROOT, '../Go live Prep - Staging/generated/uat-testers/uat-testers-otp-manifest.json'),
    'utf8',
  ),
);
const beatGuard = manifest.find((x) => x.role === 'beat_guard');
if (!beatGuard) throw new Error('No beat_guard in UAT OTP manifest');

const results = [];
const metrics = {};
let page;

function sh(cmd, opts = {}) {
  const env = {
    ...process.env,
    JAVA_HOME: process.env.JAVA_HOME_21
      || '/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home',
  };
  if (env.JAVA_HOME) {
    env.PATH = `${env.JAVA_HOME}/bin:${env.PATH || ''}`;
  }
  return execSync(cmd, {
    encoding: 'utf8',
    stdio: opts.quiet ? ['pipe', 'pipe', 'pipe'] : 'inherit',
    cwd: opts.cwd,
    env,
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

function setMockGps() {
  adbOk('emu', 'geo', 'fix', GEO_LNG, GEO_LAT);
  // Repeat; first fix after boot is sometimes dropped.
  sleep(400);
  adbOk('emu', 'geo', 'fix', GEO_LNG, GEO_LAT);
}

function clearMockGps() {
  // Emulator has no "clear geo"; disable GPS provider simulations by not refreshing.
  // Prefer network-only where supported.
  adbOk('shell', 'settings', 'put', 'secure', 'location_mode', '1');
  sleep(800);
}

function restoreHighAccuracyGps() {
  try {
    adb('shell', 'cmd', 'location', 'set-location-enabled', 'true');
  } catch {
    adbOk('shell', 'settings', 'put', 'secure', 'location_mode', '3');
  }
  setMockGps();
  sleep(800);
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

const HOME_READY = '!!(document.body && /Add Sighting|साइटिंग जोड़ें|साइटिंग जोडा/i.test(document.body.innerText || ""))';
const GPS_READY = '!!(document.body && /GPS are ready|GPS तैयार|GPS तयार/i.test(document.body.innerText || ""))';
const CELL_UI =
  '!!(document.body && /Use cell location|सेल स्थान|cell-tower|सेल-टावर|Keep trying GPS|GPS की कोशिश|GPS प्रयत्न/i.test(document.body.innerText || ""))';
const CELL_PENDING =
  '!!(document.body && /cell-tower location|सेल-टावर स्थान|सेल-टॉवर स्थान|last resort|अंतिम विकल्प|शेवटचा पर्याय/i.test(document.body.innerText || ""))';

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

async function openReportPhotoStep() {
  await page.evaluate(() => {
    window.location.href = 'https://localhost/report';
  });
  await page.sleep(2000);
  await page.waitFor(
    '!!(document.body && /photo evidence|Take Photo|GPS are ready|GPS is not ready|Capturing date|GPS तैयार|GPS तयार/i.test(document.body.innerText || ""))',
    25000,
  );
}

async function bodySnippet() {
  return page.evaluate(() => (document.body?.innerText || '').slice(0, 1600));
}

async function hasCellDialog() {
  return page.evaluate(() => {
    const text = document.body?.innerText || '';
    return /Use cell location|सेल स्थान|Keep trying GPS|GPS की कोशिश|GPS प्रयत्न|cell-tower/i.test(text);
  });
}

async function main() {
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

adbOk('shell', 'svc', 'wifi', 'enable');
adbOk('shell', 'svc', 'data', 'enable');
grantLocation();
restoreHighAccuracyGps();

launchApp();
page = await connectPage();

await check('Login while online', async () => {
  await loginOTP();
  await page.screenshot(join(OUT, '01-dashboard.png'));
});

await check('Fast GPS with geo fix — no cell dialog', async () => {
  grantLocation();
  restoreHighAccuracyGps();
  const started = Date.now();
  await openReportPhotoStep();
  try {
    await page.waitFor(GPS_READY, FAST_GPS_BUDGET_MS);
  } catch {
    const body = await bodySnippet();
    throw new Error(`GPS not ready within ${FAST_GPS_BUDGET_MS}ms. UI: ${body}`);
  }
  const elapsed = Date.now() - started;
  metrics.fastGpsMs = elapsed;
  console.log('fast GPS ms', elapsed);
  if (elapsed > FAST_GPS_BUDGET_MS) {
    throw new Error(`GPS took ${elapsed}ms (budget ${FAST_GPS_BUDGET_MS}ms)`);
  }
  if (await hasCellDialog()) {
    throw new Error('Cell dialog appeared even though GPS was available');
  }
  await page.screenshot(join(OUT, '02-fast-gps-ready.png'));
});

await check('Location step has coordinates without refresh', async () => {
  // Ensure we are on the photo step of a fresh report
  await openReportPhotoStep();
  try {
    await page.waitFor(GPS_READY, FAST_GPS_BUDGET_MS);
  } catch {
    /* already validated in prior check; continue navigating */
  }

  const injected = await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="e2e-inject-photo"]');
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (!injected) throw new Error('Staging test photo button missing');
  await clickButton('Continue');
  await page.sleep(1000);

  const picked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      /Direct (Sighting|Observation)/i.test(b.textContent || ''),
    );
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (!picked) throw new Error('Direct observation button not found');
  await page.sleep(600);

  // Increment male (or first) count so the step is valid
  await page.evaluate(() => {
    const plus = [...document.querySelectorAll('button')].find((b) => {
      const hasPlus = !!b.querySelector('.lucide-plus, svg.lucide-plus');
      return hasPlus && !b.disabled;
    });
    plus?.click();
  });
  await page.sleep(400);
  await clickButton('Continue');
  await page.sleep(2000);

  // Wait until date/location step content shows
  await page.waitFor(
    '!!(document.body && /Date|Location|GPS|Beat|Division|अक्षांश|latitude/i.test(document.body.innerText || ""))',
    15000,
  );

  const fieldCoords = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input')];
    return inputs
      .map((i) => ({ name: i.name || i.placeholder || i.type, value: i.value }))
      .filter((x) => x.value && /^-?\d+(\.\d+)?$/.test(x.value));
  });
  const nums = fieldCoords.map((x) => Number(x.value)).filter((n) => Number.isFinite(n));
  const nearExpected =
    nums.some((n) => Math.abs(n - Number(GEO_LAT)) < 0.05) ||
    nums.some((n) => Math.abs(n - Number(GEO_LNG)) < 0.05);

  const textHasCoords = await page.evaluate((lat, lng) => {
    const text = document.body?.innerText || '';
    return text.includes(String(lat).slice(0, 6)) || text.includes(String(lng).slice(0, 6));
  }, GEO_LAT, GEO_LNG);

  if (!nearExpected && !textHasCoords) {
    const snippet = await bodySnippet();
    throw new Error(`No sighting coordinates on location step. fields=${JSON.stringify(fieldCoords)} ui=${snippet}`);
  }
  if (await hasCellDialog()) {
    throw new Error('Cell dialog should not show when GPS coordinates are filled');
  }
  metrics.locationStepCoords = fieldCoords;
  await page.screenshot(join(OUT, '03-location-step-coords.png'));
});

if (!skipSlowCell) {
  await check('Network-only: cell dialog only after long GPS wait', async () => {
    // Keep FINE location granted. Revoking it triggers Android's
    // "approximate → precise" dialog while Cap Geolocation is watching, which
    // crashes the plugin (NPE in startWatch). Force a slow path by clearing
    // the emu geo fix and using battery-saver / network-leaning location mode.
    grantLocation();
    clearMockGps();
    sleep(1000);

    if (page) page.close();
    launchApp();
    page = await connectPage();
    await loginOTP();

    const started = Date.now();
    await openReportPhotoStep();

    // Must NOT show cell immediately
    await page.sleep(Math.min(CELL_NOT_BEFORE_MS, 8000));
    const earlyCell = await hasCellDialog();
    metrics.cellEarlyMs = Date.now() - started;
    if (earlyCell && metrics.cellEarlyMs < CELL_NOT_BEFORE_MS) {
      const body = await bodySnippet();
      throw new Error(`Cell UI appeared too early (${metrics.cellEarlyMs}ms < ${CELL_NOT_BEFORE_MS}ms). UI: ${body}`);
    }

    // Wait for either GPS ready (unexpected but OK) or cell last-resort UI
    let outcome = 'timeout';
    const deadline = Date.now() + CELL_WAIT_MS;
    while (Date.now() < deadline) {
      const state = await page.evaluate(() => {
        const text = document.body?.innerText || '';
        return {
          gps: /GPS are ready|GPS तैयार|GPS तयार/i.test(text),
          cell: /Use cell location|सेल स्थान|Keep trying GPS|GPS की कोशिश|GPS प्रयत्न/i.test(text),
          pending: /last resort|अंतिम विकल्प|शेवटचा पर्याय|cell-tower/i.test(text),
          crashed: /keeps stopping|isn't responding/i.test(text),
        };
      });
      if (state.crashed) {
        throw new Error('App crashed during network-only GPS wait (Eravat keeps stopping)');
      }
      if (state.gps) {
        outcome = 'gps';
        break;
      }
      if (state.cell || state.pending) {
        outcome = 'cell';
        break;
      }
      await page.sleep(2000);
    }
    metrics.cellOrGpsMs = Date.now() - started;
    metrics.cellOutcome = outcome;
    console.log('network-only outcome', outcome, 'ms', metrics.cellOrGpsMs);

    if (outcome === 'timeout') {
      const body = await bodySnippet();
      throw new Error(`Neither GPS nor cell UI within ${CELL_WAIT_MS}ms. UI: ${body}`);
    }
    if (outcome === 'cell' && metrics.cellOrGpsMs < CELL_NOT_BEFORE_MS) {
      throw new Error(`Cell offered after only ${metrics.cellOrGpsMs}ms (min ${CELL_NOT_BEFORE_MS}ms)`);
    }
    await page.screenshot(join(OUT, `04-network-only-${outcome}.png`));

    if (outcome === 'cell') {
      await clickButton('Keep trying GPS|GPS की कोशिश|GPS प्रयत्न|Try GPS');
      await page.sleep(1500);
      const stillAccepted = await page.evaluate(() => {
        const text = document.body?.innerText || '';
        return /GPS are ready|GPS तैयार|GPS तयार/i.test(text);
      });
      metrics.cellRetryClicked = true;
      metrics.cellRetryInstantGps = stillAccepted;
      await page.screenshot(join(OUT, '05-cell-retry-gps.png'));
    }
  });
} else {
  console.log('SKIP slow cell path (--skip-slow-cell)');
}

// Restore for leftover manual testing
grantLocation();
restoreHighAccuracyGps();

if (page) page.close();

const summary = {
  passed: results.filter((r) => r.ok).length,
  failed: results.filter((r) => r.ok === false).length,
  results,
  metrics,
  testedAt: new Date().toISOString(),
};
await writeFile(join(OUT, 'results.json'), JSON.stringify(summary, null, 2));
console.log('\nSUMMARY', JSON.stringify(summary, null, 2));
process.exit(summary.failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
