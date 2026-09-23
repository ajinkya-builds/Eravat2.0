/**
 * Trimmed CDP perf smoke for older API AVDs (login → home → report open).
 * Prereq: emulator running with staging APK installed.
 *
 * Run: node scripts/emulator-perf-smoke.mjs [--baseline path/to/baseline.json]
 *
 * Budgets: absolute caps always; if --baseline provided, also ≤ 2× baseline timings.
 */
import { execSync, spawn } from 'child_process';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { CdpPage } from './cdp-page.mjs';

const PKG = 'com.forestdept.eravat';
const SDK = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || `${process.env.HOME}/Library/Android/sdk`;
const ADB = `${SDK}/platform-tools/adb`;
const EMULATOR = `${SDK}/emulator/emulator`;
const OUT = join(process.cwd(), '../Go live Prep - Staging/generated/emulator-perf-smoke');
const ABS_CAPS = { loginMs: 25000, reportOpenMs: 15000 };

const args = process.argv.slice(2);
const baselineIdx = args.indexOf('--baseline');
const baselinePath =
  baselineIdx >= 0
    ? args[baselineIdx + 1]
    : join(OUT, 'baseline-api36.json');
const writeBaseline = args.includes('--write-baseline');
const avdArgIdx = args.indexOf('--avd');
const onlyAvd = avdArgIdx >= 0 ? args[avdArgIdx + 1] : process.env.ERAVAT_PERF_AVD || null;
const skipBoot = args.includes('--skip-boot');

mkdirSync(OUT, { recursive: true });

const manifest = JSON.parse(
  readFileSync(join(process.cwd(), '../Go live Prep - Staging/generated/uat-testers/uat-testers-otp-manifest.json'), 'utf8'),
);
const bg =
  manifest.find((x) => x.role === 'beat_guard' && x.phone_app === '7415740750') ||
  manifest.find((x) => x.role === 'beat_guard');
if (!bg?.phone_app || !bg?.otp) throw new Error('No beat_guard in UAT OTP manifest');

function sh(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', ...opts }).trim();
}

function adb(...parts) {
  try {
    return execSync([ADB, ...parts].join(' '), { encoding: 'utf8' }).trim();
  } catch (e) {
    if (parts.includes('pidof')) return '';
    throw e;
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function listPerfAvds() {
  const all = sh(`"${EMULATOR}" -list-avds`).split('\n').filter(Boolean);
  if (onlyAvd) return all.filter((a) => a === onlyAvd);
  // Full CDP only where System WebView is new enough (minWebViewVersion 69).
  // API 27 is covered by compat outdated-webview gate, not login perf.
  return all.filter((a) => a === 'Eravat_API31' || a === 'Eravat_API35');
}

function killEmulators() {
  const devices = sh(`"${ADB}" devices`).split('\n').slice(1);
  for (const line of devices) {
    const serial = line.split(/\s+/)[0];
    if (serial?.startsWith('emulator-')) {
      try {
        sh(`"${ADB}" -s ${serial} emu kill`);
      } catch {
        /* ignore */
      }
    }
  }
  for (let i = 0; i < 25; i++) {
    const left = sh(`"${ADB}" devices`)
      .split('\n')
      .slice(1)
      .some((l) => l.includes('emulator-'));
    if (!left) return;
    sleep(1000);
  }
}

function bootAvd(name) {
  console.log(`Booting ${name}…`);
  spawn(EMULATOR, ['-avd', name, '-no-snapshot-load', '-no-snapshot-save', '-no-boot-anim', '-gpu', 'auto'], {
    detached: true,
    stdio: 'ignore',
  }).unref();
  for (let i = 0; i < 150; i++) {
    sleep(4000);
    const serial = sh(`"${ADB}" devices`)
      .split('\n')
      .slice(1)
      .map((l) => l.split(/\s+/))
      .find((p) => p[0]?.startsWith('emulator-') && p[1] === 'device')?.[0];
    if (!serial) continue;
    const boot = adb('-s', serial, 'shell', 'getprop', 'sys.boot_completed').replace(/\r/g, '');
    if (boot !== '1') continue;
    try {
      const act = adb('-s', serial, 'shell', 'service', 'check', 'activity');
      if (/found/i.test(act)) return serial;
    } catch {
      /* retry */
    }
  }
  throw new Error(`Emulator ${name} did not boot`);
}

function installApk(serial) {
  const apk = join(process.cwd(), 'android/app/build/outputs/apk/debug/app-debug.apk');
  if (!existsSync(apk)) throw new Error(`APK missing: ${apk}`);
  sh(`"${ADB}" -s ${serial} install -r -t ${JSON.stringify(apk)}`);
  for (const perm of [
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.POST_NOTIFICATIONS',
  ]) {
    try {
      adb('-s', serial, 'shell', 'pm', 'grant', PKG, perm);
    } catch {
      /* older APIs may lack POST_NOTIFICATIONS */
    }
  }
}

function launchApp(serial) {
  try {
    adb('-s', serial, 'shell', 'cmd', 'connectivity', 'airplane-mode', 'disable');
  } catch {
    /* ignore */
  }
  try {
    adb('-s', serial, 'shell', 'svc', 'wifi', 'enable');
    adb('-s', serial, 'shell', 'svc', 'data', 'enable');
  } catch {
    /* ignore */
  }
  adb('-s', serial, 'shell', 'am', 'force-stop', PKG);
  sleep(800);
  try {
    adb('-s', serial, 'emu', 'geo', 'fix', '80.988653', '23.181467');
  } catch {
    /* ignore */
  }
  adb('-s', serial, 'shell', 'am', 'start', '-n', `${PKG}/.MainActivity`);
  sleep(8000);
}

function forwardDevtools(serial, retries = 10) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      let pid = adb('-s', serial, 'shell', 'pidof', PKG).replace(/\r/g, '');
      if (!pid) {
        launchApp(serial);
        pid = adb('-s', serial, 'shell', 'pidof', PKG).replace(/\r/g, '');
      }
      if (!pid) throw new Error('process not running');
      try {
        sh(`"${ADB}" -s ${serial} forward --remove-all`);
      } catch {
        /* ignore */
      }
      sh(`"${ADB}" -s ${serial} forward tcp:9222 localabstract:webview_devtools_remote_${pid}`);
      sleep(2500);
      const raw = sh('curl -sS --max-time 5 http://127.0.0.1:9222/json/list');
      if (!raw?.trim()) throw new Error('Empty CDP json/list');
      const list = JSON.parse(raw);
      const target =
        list.find((t) => t.type === 'page' && t.url.includes('localhost')) ||
        list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (!target?.webSocketDebuggerUrl) throw new Error('No WebView page target');
      return target.webSocketDebuggerUrl;
    } catch (e) {
      lastErr = e;
      console.log(`CDP attempt ${i + 1}/${retries}: ${e.message}`);
      sleep(1500);
      if (i === 3 || i === 6) launchApp(serial);
    }
  }
  throw lastErr || new Error('CDP forward failed');
}

async function fillPlaceholder(page, placeholder, value) {
  await page.waitFor(`!!document.querySelector('input[placeholder="${placeholder}"]')`, 20000);
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
  if (!ok) throw new Error(`Input not set: ${placeholder}`);
}

async function clickButton(page, matcher) {
  const clicked = await page.evaluate((pattern) => {
    const re = new RegExp(pattern, 'i');
    const btn = [...document.querySelectorAll('button')].find((b) => re.test(b.textContent || ''));
    if (!btn) return false;
    btn.click();
    return true;
  }, matcher);
  if (!clicked) throw new Error(`Button not found: ${matcher}`);
}

async function runPerfOnSerial(avd, serial) {
  installApk(serial);
  launchApp(serial);
  const page = await CdpPage.connect(forwardDevtools(serial));
  const timings = {};

  // Clean login
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
    /* ignore */
  }
  await page.goto('https://localhost/login');
  await page.waitFor(`!!document.querySelector('input[placeholder="9876543210"]')`, 25000);

  const tLogin0 = Date.now();
  await fillPlaceholder(page, '9876543210', bg.phone_app);
  await clickButton(page, 'Send OTP');
  await page.waitFor(`!!document.querySelector('input[placeholder="Enter 6-digit code"]')`, 45000);
  await fillPlaceholder(page, 'Enter 6-digit code', bg.otp);
  await clickButton(page, 'Verify');
  await page.waitFor(`!location.pathname.includes("/login")`, 45000);
  await page.waitFor(
    `!!(document.body && /Add Sighting|Nearby Sightings|What would you like/i.test(document.body.innerText || ""))`,
    25000,
  );
  timings.loginMs = Date.now() - tLogin0;

  const tReport0 = Date.now();
  await page.goto('https://localhost/report');
  await page.sleep(1500);
  await page.waitFor(
    `!!(document.body && /Use test photo|Photo Evidence|Continue|Add Sighting/i.test(document.body.innerText || ""))`,
    20000,
  );
  timings.reportOpenMs = Date.now() - tReport0;

  page.close();
  return timings;
}

function loadBaseline() {
  if (writeBaseline) return null;
  if (!existsSync(baselinePath)) return null;
  return JSON.parse(readFileSync(baselinePath, 'utf8'));
}

function assertBudgets(avd, timings, baseline) {
  const failures = [];
  if (timings.loginMs > ABS_CAPS.loginMs) {
    failures.push(`login ${timings.loginMs}ms > cap ${ABS_CAPS.loginMs}ms`);
  }
  if (timings.reportOpenMs > ABS_CAPS.reportOpenMs) {
    failures.push(`reportOpen ${timings.reportOpenMs}ms > cap ${ABS_CAPS.reportOpenMs}ms`);
  }
  const baseTimings =
    baseline?.timings ||
    baseline?.baseline ||
    baseline?.results?.find?.((r) => r.ok && r.timings)?.timings;
  if (baseTimings?.loginMs && timings.loginMs > baseTimings.loginMs * 2) {
    failures.push(`login ${timings.loginMs}ms > 2× baseline ${baseTimings.loginMs}ms`);
  }
  if (baseTimings?.reportOpenMs && timings.reportOpenMs > baseTimings.reportOpenMs * 2) {
    failures.push(`reportOpen ${timings.reportOpenMs}ms > 2× baseline ${baseTimings.reportOpenMs}ms`);
  }
  return failures;
}

function maybeWriteBaseline(avd, timings) {
  if (!writeBaseline) return;
  const payload = {
    wroteAt: new Date().toISOString(),
    avd,
    timings,
  };
  writeFileSync(baselinePath, JSON.stringify(payload, null, 2));
  console.log(`Wrote baseline → ${baselinePath}`);
}

const baseline = loadBaseline();
const avds = listPerfAvds();
if (avds.length === 0) {
  console.error('No target AVDs (need Eravat_API27 and/or Eravat_API31). Run create-android-compat-avds.sh');
  process.exit(1);
}

const results = [];
let failed = 0;

if (!skipBoot) killEmulators();

for (const avd of avds) {
  let serial;
  try {
    if (skipBoot) {
      serial = sh(`"${ADB}" devices`)
        .split('\n')
        .slice(1)
        .map((l) => l.split(/\s+/))
        .find((p) => p[0]?.startsWith('emulator-') && p[1] === 'device')?.[0];
      if (!serial) throw new Error('No running emulator (--skip-boot)');
    } else {
      serial = bootAvd(avd);
    }
    console.log(`=== perf ${avd} (${serial}) ===`);
    const timings = await runPerfOnSerial(avd, serial);
    const failures = assertBudgets(avd, timings, baseline);
    const ok = failures.length === 0;
    console.log(
      `${ok ? 'PASS' : 'FAIL'} ${avd}: login=${timings.loginMs}ms reportOpen=${timings.reportOpenMs}ms` +
        (failures.length ? ` (${failures.join('; ')})` : ''),
    );
    results.push({ avd, ok, timings, failures });
    if (ok) maybeWriteBaseline(avd, timings);
    if (!ok) failed = 1;
  } catch (e) {
    console.log(`FAIL ${avd}: ${e.message}`);
    results.push({ avd, ok: false, error: e.message });
    failed = 1;
  }
  if (!skipBoot) killEmulators();
}

const summary = {
  ranAt: new Date().toISOString(),
  ok: failed === 0,
  absoluteCaps: ABS_CAPS,
  baselinePath: existsSync(baselinePath) ? baselinePath : null,
  writeBaseline,
  results,
};

writeFileSync(join(OUT, 'results.json'), JSON.stringify(summary, null, 2));
console.log(`\nPerf smoke: ${summary.ok ? 'PASS' : 'FAIL'} → ${join(OUT, 'results.json')}`);
process.exit(failed);
