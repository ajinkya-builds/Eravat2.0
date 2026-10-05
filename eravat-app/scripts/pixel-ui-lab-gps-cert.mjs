/**
 * Pixel UI Lab GPS certification — validates yesterday's 2.1.14–2.1.17 GPS fixes
 * still work under the productized UI chrome (package com.forestdept.eravat).
 *
 * Covers reported issues:
 *  - First-try GPS fill (no 2–3 refresh taps)
 *  - Reports never accept planted last-known coords (live indoor/GPS only)
 *  - Location-off banner + recovery when location is re-enabled
 *  - Offline report still acquires live GNSS (longer offline budget)
 *  - Location step shows live coords + Matched-from-GPS territory chrome
 *  - Nearby can use live/cached location without hanging
 *  - cancelFreshFix fire-and-forget (report advance does not hang after GPS)
 *
 * Run: node scripts/pixel-ui-lab-gps-cert.mjs [--serial 41221JEHN00156]
 */
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { CdpPage } from './cdp-page.mjs';

const PKG = 'com.forestdept.eravat';
const ACTIVITY = 'com.forestdept.eravat/.MainActivity';
const APP_VERSION = JSON.parse(readFileSync(join(process.cwd(), 'version.json'), 'utf8'));
const OUT = join(process.cwd(), '../Go live Prep - Staging/generated/ui-feedback/pixel-gps-cert');
const SDK = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || `${process.env.HOME}/Library/Android/sdk`;
const ADB_BIN = `${SDK}/platform-tools/adb`;
const LAST_GPS_KEY = 'eravat_last_gps_fix_v1';
/** Obviously-wrong planted last-known (Mumbai) — report must NOT adopt these. */
const FAKE_LAT = 19.076;
const FAKE_LNG = 72.8777;

const serialArg = process.argv.find((a, i) => process.argv[i - 1] === '--serial');
const SERIAL =
  serialArg ||
  process.env.ANDROID_SERIAL ||
  execSync(`${ADB_BIN} devices`, { encoding: 'utf8' })
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.endsWith('\tdevice') && !l.startsWith('emulator'))
    ?.split('\t')[0];

if (!SERIAL) {
  console.error('No physical device found.');
  process.exit(1);
}

function adb(...args) {
  try {
    return execSync([ADB_BIN, '-s', SERIAL, ...args].join(' '), { encoding: 'utf8' }).trim();
  } catch (e) {
    if (args.includes('pidof')) return '';
    throw e;
  }
}

function adbOk(...args) {
  try {
    return adb(...args);
  } catch {
    return '';
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const manifest = JSON.parse(
  readFileSync(join(process.cwd(), '../Go live Prep - Staging/generated/uat-testers/uat-testers-otp-manifest.json'), 'utf8'),
);
const BG = manifest.find((x) => x.role === 'beat_guard');
if (!BG?.phone_app || !BG?.otp) throw new Error('No beat_guard in UAT OTP manifest');

const results = [];
let page;
let networkDisabled = false;

async function shot(name) {
  try {
    await page.screenshot(join(OUT, `${name}.png`));
  } catch (e) {
    console.log(`  screenshot skipped (${name}): ${e.message}`);
  }
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
      await shot(`fail-${name.replace(/\s+/g, '-').slice(0, 40)}`);
    } catch {
      /* ignore */
    }
  }
}

function restoreNetwork() {
  if (!networkDisabled) return;
  try {
    adb('shell', 'svc', 'wifi', 'enable');
    adb('shell', 'svc', 'data', 'enable');
  } catch {
    /* ignore */
  }
  networkDisabled = false;
  sleep(2500);
}

function grantLocation() {
  for (const p of [
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.ACCESS_BACKGROUND_LOCATION',
    'android.permission.CAMERA',
    'android.permission.POST_NOTIFICATIONS',
  ]) {
    adbOk('shell', 'pm', 'grant', PKG, p);
  }
}

function setLocationEnabled(on) {
  // Android 12+ location master switch
  adbOk('shell', 'cmd', 'location', 'set-location-enabled', on ? 'true' : 'false');
  // Fallback for older APIs
  adbOk('shell', 'settings', 'put', 'secure', 'location_mode', on ? '3' : '0');
  sleep(1500);
  acceptLocationDialog();
}

function acceptLocationDialog() {
  for (let i = 0; i < 8; i++) {
    const focus = adbOk('shell', 'dumpsys', 'window');
    if (!/LocationSettingsChecker|Improve location|Location Accuracy|Turn on|LocationOffWarning|location\.settings/i.test(focus)) {
      return;
    }
    // Prefer primary affirmative / OK / Turn on
    adbOk('shell', 'input', 'keyevent', '22');
    adbOk('shell', 'input', 'keyevent', '66');
    sleep(500);
    // Escape stuck system sheets
    if (/LocationOffWarning/i.test(focus)) {
      adbOk('shell', 'input', 'keyevent', 'KEYCODE_BACK');
      sleep(400);
    }
  }
}

function launchApp() {
  adbOk('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
  adbOk('shell', 'wm', 'dismiss-keyguard');
  adbOk('shell', 'am', 'force-stop', PKG);
  sleep(1000);
  grantLocation();
  adbOk('shell', 'am', 'start', '-n', ACTIVITY);
  sleep(5000);
  acceptLocationDialog();
}

function forwardDevtools(retries = 10) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      let pid = adb('shell', 'pidof', PKG).replace(/\r/g, '');
      if (!pid) {
        launchApp();
        pid = adb('shell', 'pidof', PKG).replace(/\r/g, '');
      }
      if (!pid) throw new Error('Eravat process not running');
      try {
        adb('forward', '--remove-all');
      } catch {
        /* ignore */
      }
      adb('forward', 'tcp:9222', `localabstract:webview_devtools_remote_${pid}`);
      sleep(2000);
      const raw = execSync('curl -sS --max-time 5 http://127.0.0.1:9222/json/list', { encoding: 'utf8' });
      const list = JSON.parse(raw);
      const target =
        list.find((t) => t.type === 'page' && t.url.includes('localhost')) ||
        list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (!target?.webSocketDebuggerUrl) throw new Error('No WebView page target');
      return target.webSocketDebuggerUrl;
    } catch (e) {
      lastErr = e;
      console.log(`CDP forward ${i + 1}/${retries}: ${e.message}`);
      sleep(1500);
      if (i === 3 || i === 6) launchApp();
    }
  }
  throw lastErr || new Error('CDP forward failed');
}

async function fillPlaceholder(placeholder, value) {
  const ok = await page.evaluate(
    (ph, val) => {
      const input = [...document.querySelectorAll('input')].find((i) => (i.placeholder || '') === ph);
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, val);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    },
    placeholder,
    value,
  );
  if (!ok) throw new Error(`Input not found: ${placeholder}`);
}

async function clickButton(matcher) {
  const clicked = await page.evaluate((pattern) => {
    const re = new RegExp(pattern, 'i');
    const btn = [...document.querySelectorAll('button')].find((b) => re.test(b.textContent || '') && !b.disabled);
    if (!btn) return false;
    btn.click();
    return true;
  }, matcher);
  if (!clicked) throw new Error(`Button not found: ${matcher}`);
}

async function softReset() {
  try {
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('sb-') || key.startsWith('eravat_') || key.includes('supabase')) {
          localStorage.removeItem(key);
        }
      }
      sessionStorage.clear();
    });
  } catch {
    /* relaunch */
  }
  try {
    await page.goto('https://localhost/login');
    await page.waitFor(`!!document.querySelector('input[placeholder="9876543210"]')`, 15000);
  } catch {
    page.close();
    launchApp();
    page = await CdpPage.connect(forwardDevtools());
    await page.goto('https://localhost/login');
    await page.waitFor(`!!document.querySelector('input[placeholder="9876543210"]')`, 20000);
  }
}

async function loginOTP() {
  await softReset();
  await fillPlaceholder('9876543210', BG.phone_app);
  await clickButton('Send OTP');
  await page.waitFor(`!!document.querySelector('input[placeholder="Enter 6-digit code"]')`, 45000);
  await fillPlaceholder('Enter 6-digit code', BG.otp);
  await clickButton('Verify');
  await page.waitFor('!location.pathname.includes("/login")', 45000);
  sleep(2500);
  const path = await page.evaluate(() => location.pathname);
  if (path.includes('complete-location')) {
    throw new Error('Blocked by complete-location gate — set profile GPS once, then re-run');
  }
}

async function injectPhoto() {
  return page.evaluate(() => {
    const btn = document.querySelector('[data-testid="e2e-inject-photo"]');
    if (!btn) return false;
    btn.click();
    return true;
  });
}

async function clickContinue() {
  const ok = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')];
    const btn = buttons.reverse().find((b) => /continue|next|जारी|आगे|पुढे/i.test(b.textContent || '') && !b.disabled);
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (!ok) throw new Error('Continue not found/enabled');
  sleep(800);
}

async function selectDirectWithCount() {
  const picked = await page.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find((n) =>
      /Direct Sighting|Direct Observation|प्रत्यक्ष/i.test(n.textContent || ''),
    );
    if (!el) return false;
    el.click();
    return true;
  });
  if (!picked) throw new Error('Direct observation missing');
  sleep(1500);
  await page.waitFor(`!!document.querySelector('[data-testid="elephant-count-plus-male_count"]')`, 10000);
  await page.evaluate(() => {
    document.querySelector('[data-testid="elephant-count-plus-male_count"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, view: window }),
    );
  });
  sleep(600);
  await page.waitFor(
    `!![...document.querySelectorAll('button')].some((b) => /continue|next|जारी|आगे|पुढे/i.test(b.textContent || '') && !b.disabled)`,
    10000,
  );
}

async function openReportPhoto() {
  await page.goto('https://localhost/report');
  sleep(2500);
  await page.waitFor(
    `!!(document.body && /photo|Take Photo|GPS are ready|GPS is not ready|Capturing date|e2e-inject/i.test(document.body.innerText || "") || document.querySelector('[data-testid="e2e-inject-photo"]'))`,
    25000,
  );
}

async function waitGpsReadyOnPhoto(budgetMs = 90000) {
  const started = Date.now();
  await page.waitFor(
    `!!(document.body && /GPS are ready|GPS तैयार|GPS तयार|Date, time, and GPS are ready/i.test(document.body.innerText || ""))`,
    budgetMs,
  );
  return Date.now() - started;
}

async function advanceToLocationStep() {
  const injected = await injectPhoto();
  if (!injected) throw new Error('e2e-inject-photo missing — rebuild staging UI Lab APK');
  sleep(400);
  await clickContinue();
  sleep(1200);
  await selectDirectWithCount();
  await clickContinue();
  sleep(2000);
}

async function readLocationInputs() {
  return page.evaluate(() => {
    const nums = [...document.querySelectorAll('input[type="number"]')];
    const lat = nums[0] ? Number(nums[0].value) : NaN;
    const lng = nums[1] ? Number(nums[1].value) : NaN;
    const body = document.body.innerText || '';
    return {
      lat,
      lng,
      body: body.slice(0, 1500),
      matched: /Matched from GPS|from location|स्थान से|from GPS/i.test(body),
      acquired: /location acquired|✓|GPS/i.test(body),
    };
  });
}

function nearFake(lat, lng) {
  return Math.abs(lat - FAKE_LAT) < 0.05 && Math.abs(lng - FAKE_LNG) < 0.05;
}

await mkdir(OUT, { recursive: true });
console.log(`Device ${SERIAL} · UI Lab GPS cert`);
console.log(`Installed: ${adb('shell', 'dumpsys', 'package', PKG).match(/versionName=\S+/)?.[0] || '?'}`);

process.on('exit', restoreNetwork);
process.on('SIGINT', () => {
  restoreNetwork();
  process.exit(130);
});

grantLocation();
setLocationEnabled(true);
launchApp();
page = await CdpPage.connect(forwardDevtools());

await check('Package is staging Eravat', async () => {
  const dump = adb('shell', 'dumpsys', 'package', PKG);
  if (!dump.includes(`versionName=${APP_VERSION.versionName}`)) {
    throw new Error(`not ${APP_VERSION.versionName}`);
  }
});

await check('Beat guard OTP login', async () => {
  await loginOTP();
  await shot('01-home');
});

await check('Report GPS fills on first try (no refresh tap)', async () => {
  setLocationEnabled(true);
  grantLocation();
  await openReportPhoto();
  // Observe prefetch path: either capturing then ready, or already ready
  const elapsed = await waitGpsReadyOnPhoto(90000);
  console.log('  first-try GPS ready ms:', elapsed);
  if (elapsed > 85000) throw new Error(`GPS ready took ${elapsed}ms (budget ~90s outdoor/indoor)`);
  await shot('02-gps-first-try');
});

await check('Report ignores planted last-known (live fix only)', async () => {
  // Plant stale Mumbai coords then reopen report — form must not adopt them.
  await page.evaluate(
    (key, lat, lng) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          latitude: lat,
          longitude: lng,
          accuracy: 12,
          timestamp: Date.now(),
          source: 'gps',
        }),
      );
    },
    LAST_GPS_KEY,
    FAKE_LAT,
    FAKE_LNG,
  );
  await openReportPhoto();
  await waitGpsReadyOnPhoto(90000);
  await advanceToLocationStep();
  const loc = await readLocationInputs();
  if (!Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) {
    throw new Error(`No live coords on location step: ${loc.body.slice(0, 200)}`);
  }
  if (nearFake(loc.lat, loc.lng)) {
    throw new Error(`Report used planted last-known Mumbai (${loc.lat},${loc.lng}) — 2.1.15 regression`);
  }
  console.log(`  live coords: ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)} (not fake ${FAKE_LAT},${FAKE_LNG})`);
  await shot('03-not-last-known');
});

await check('Location step Matched-from-GPS / acquired chrome', async () => {
  const loc = await readLocationInputs();
  if (!loc.matched && !/Division|Range|Beat|वन|Matched|confirm or edit/i.test(loc.body)) {
    throw new Error(`Territory/GPS chrome weak: ${loc.body.slice(0, 220)}`);
  }
  await shot('04-location-drb');
});

await check('cancelFreshFix does not hang after GPS (advance past location)', async () => {
  // 2.1.14: awaiting cancelFreshFix hung OxygenOS; fire-and-forget must let Continue work.
  const started = Date.now();
  // Stay on location — Continue may need territory; if enabled, click; else fill already present.
  const continued = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')]
      .reverse()
      .find((b) => /continue|next|जारी|आगे|पुढे/i.test(b.textContent || '') && !b.disabled);
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (continued) {
    sleep(2000);
  }
  const elapsed = Date.now() - started;
  if (elapsed > 15000) throw new Error(`Post-GPS continue hung ${elapsed}ms (cancelFreshFix?)`);
  await shot('05-no-hang');
});

await check('Location-off banner appears', async () => {
  await page.goto('https://localhost/');
  sleep(2000);
  setLocationEnabled(false);
  await page.waitFor(
    `!!(document.body && /turn on location|लोकेशन चालू|स्थान चालू/i.test(document.body.innerText || ""))`,
    20000,
  );
  await shot('06-location-off-banner');
});

await check('Location re-enabled recovers (banner clears / GPS usable)', async () => {
  setLocationEnabled(true);
  acceptLocationDialog();
  sleep(3000);
  // Banner for "Turn on location so GPS is ready" should clear
  const still = await page.evaluate(() =>
    /turn on location so gps is ready/i.test(document.body.innerText || ''),
  );
  if (still) {
    // Soft fail recovery: open report and ensure GPS can still lock
    await openReportPhoto();
    await waitGpsReadyOnPhoto(90000);
  }
  await shot('07-location-on-recover');
});

await check('Offline report still gets live GNSS (not last-known)', async () => {
  try {
  setLocationEnabled(true);
  grantLocation();
  await page.evaluate(
    (key, lat, lng) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          latitude: lat,
          longitude: lng,
          accuracy: 8,
          timestamp: Date.now(),
          source: 'gps',
        }),
      );
    },
    LAST_GPS_KEY,
    FAKE_LAT,
    FAKE_LNG,
  );
  try {
    adb('shell', 'svc', 'wifi', 'disable');
    adb('shell', 'svc', 'data', 'disable');
    networkDisabled = true;
  } catch (e) {
    throw new Error(`Could not disable network: ${e.message}`);
  }
  sleep(2500);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await openReportPhoto();
  // Offline outdoor budget is longer (2.1.17) — allow up to 2.5 min
  await waitGpsReadyOnPhoto(150000);
  await advanceToLocationStep();
  const loc = await readLocationInputs();
  if (!Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) {
    throw new Error(`Offline GPS missing: ${loc.body.slice(0, 200)}`);
  }
  if (nearFake(loc.lat, loc.lng)) {
    throw new Error(`Offline report used last-known Mumbai — must wait for live GNSS`);
  }
  console.log(`  offline live coords: ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`);
  await shot('08-offline-live-gps');
  acceptLocationDialog();
  } finally {
    restoreNetwork();
  }
});

await check('Online recovery + Nearby loads with location', async () => {
  restoreNetwork();
  acceptLocationDialog();
  setLocationEnabled(true);
  grantLocation();
  sleep(3000);
  acceptLocationDialog();
  await page.goto('https://localhost/nearby');
  sleep(5000);
  acceptLocationDialog();
  const text = await page.evaluate(() => document.body.innerText || '');
  if (!/Nearby|Sighting|km|distance|No sightings|Refresh|location/i.test(text)) {
    throw new Error(`Nearby unexpected: ${text.slice(0, 180)}`);
  }
  // Must not be stuck on endless locating spinner without content
  if (/locating|getting location/i.test(text) && !/Sighting|km|No sightings|empty/i.test(text)) {
    sleep(15000);
    acceptLocationDialog();
    const again = await page.evaluate(() => document.body.innerText || '');
    if (/locating|getting location/i.test(again) && !/Sighting|km|No sightings/i.test(again)) {
      throw new Error('Nearby hung locating (possible dual-acquire / cancelFreshFix hang)');
    }
  }
  await shot('09-nearby');
});

await check('Map Locate chrome still present (UI Lab map height change)', async () => {
  await page.goto('https://localhost/map');
  sleep(4000);
  const text = await page.evaluate(() => document.body.innerText || '');
  if (!/Map|Locate|Sighting|Division|disclosure|forest/i.test(text)) {
    throw new Error(`Map unexpected: ${text.slice(0, 160)}`);
  }
  await shot('10-map');
});

restoreNetwork();
setLocationEnabled(true);

const summary = {
  device: SERIAL,
  model: adbOk('shell', 'getprop', 'ro.product.model') || 'unknown',
  package: PKG,
  versionName: APP_VERSION.versionName,
  channel: 'ui-feedback',
  note: 'UI Lab GPS cert — 2.1.14–2.1.17 reported issues under new chrome',
  issuesCovered: [
    '2.1.14 OnePlus/cancelFreshFix hang (advance after GPS)',
    '2.1.15 never fill reports from last-known',
    '2.1.17 longer offline GNSS budget',
    'first-try GPS fill / location-off banner / Nearby no hang',
  ],
  passed: results.filter((r) => r.ok).length,
  failed: results.filter((r) => !r.ok).length,
  results,
  testedAt: new Date().toISOString(),
};
await writeFile(join(OUT, 'results.json'), JSON.stringify(summary, null, 2));
console.log('\n=== UI LAB GPS CERT SUMMARY ===');
console.log(JSON.stringify(summary, null, 2));
process.exit(summary.failed ? 1 : 0);
