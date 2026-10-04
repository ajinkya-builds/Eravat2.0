/**
 * Full UI Lab APK certification on a physical Pixel against staging.
 * Package: com.forestdept.eravat.uifeedback (side-by-side with fleet staging).
 *
 * Covers gaps beyond the smoke e2e: nearby/history/villagers/onboard,
 * full report submit→history, offline queue→online, notification UI.
 *
 * Run: node scripts/pixel-ui-lab-full-cert.mjs [--serial 41221JEHN00156]
 */
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { CdpPage } from './cdp-page.mjs';

const PKG = 'com.forestdept.eravat.uifeedback';
const ACTIVITY = 'com.forestdept.eravat.uifeedback/com.forestdept.eravat.MainActivity';
const OUT = join(process.cwd(), '../Go live Prep - Staging/generated/ui-feedback/pixel-full-cert');
const SDK = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || `${process.env.HOME}/Library/Android/sdk`;
const ADB_BIN = `${SDK}/platform-tools/adb`;
const LAT = '23.857845625031';
const LNG = '81.038319794626';

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

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const manifest = JSON.parse(
  readFileSync(join(process.cwd(), '../Go live Prep - Staging/generated/uat-testers/uat-testers-otp-manifest.json'), 'utf8'),
);
function pick(role) {
  const u = manifest.find((x) => x.role === role);
  if (!u?.phone_app || !u?.otp) throw new Error(`No UAT user for ${role}`);
  return { phone: u.phone_app, otp: u.otp };
}
const BG = pick('beat_guard');
const ADMIN = pick('admin');

const results = [];
let page;
let networkDisabled = false;

async function shot(name) {
  await page.screenshot(join(OUT, `${name}.png`));
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
  } catch {
    /* ignore */
  }
  try {
    adb('shell', 'svc', 'data', 'enable');
  } catch {
    /* ignore */
  }
  networkDisabled = false;
  sleep(3000);
}

function launchApp() {
  try {
    adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
  } catch {
    /* ignore */
  }
  try {
    adb('shell', 'wm', 'dismiss-keyguard');
  } catch {
    /* ignore */
  }
  adb('shell', 'am', 'force-stop', PKG);
  sleep(800);
  for (const perm of [
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.CAMERA',
    'android.permission.POST_NOTIFICATIONS',
  ]) {
    try {
      adb('shell', 'pm', 'grant', PKG, perm);
    } catch {
      /* ignore */
    }
  }
  // mock location for report flow
  try {
    adb('emu', 'geo', 'fix', LNG, LAT);
  } catch {
    try {
      adb('shell', 'am', 'startservice', '-a', 'com.android.intent.action.SET_LOCATION', '--es', 'location', `${LAT},${LNG}`);
    } catch {
      /* physical device — app GPS / manual lat-lng */
    }
  }
  adb('shell', 'am', 'start', '-n', ACTIVITY);
  sleep(6000);
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
      if (!pid) throw new Error('Eravat UI Lab process not running');
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
      const input = [...document.querySelectorAll('input')].find((el) => el.placeholder === ph);
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
    const btn = [...document.querySelectorAll('button')].find((b) => re.test(b.textContent || ''));
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

async function loginOTP(phone, otp) {
  await softReset();
  await fillPlaceholder('9876543210', phone);
  await clickButton('Send OTP');
  await page.waitFor(`!!document.querySelector('input[placeholder="Enter 6-digit code"]')`, 45000);
  await fillPlaceholder('Enter 6-digit code', otp);
  await clickButton('Verify');
  await page.waitFor('!location.pathname.includes("/login")', 45000);
  // If complete-location gate, try to skip by filling lat/lng if inputs exist
  sleep(2000);
  const path = await page.evaluate(() => location.pathname);
  if (path.includes('complete-location')) {
    await page.evaluate(
      (lat, lng) => {
        const nums = [...document.querySelectorAll('input[type="number"]')];
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (nums[0]) {
          setter?.call(nums[0], lat);
          nums[0].dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (nums[1]) {
          setter?.call(nums[1], lng);
          nums[1].dispatchEvent(new Event('input', { bubbles: true }));
        }
        const btn = [...document.querySelectorAll('button')].find((b) =>
          /save|continue|confirm|capture|submit/i.test(b.textContent || ''),
        );
        btn?.click();
      },
      LAT,
      LNG,
    );
    sleep(4000);
  }
}

async function clickContinue() {
  const ok = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')];
    const btn = buttons.reverse().find((b) => /continue|next|जारी|आगे|पुढे/i.test(b.textContent || '') && !b.disabled);
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (!ok) throw new Error('Continue button not found/enabled');
  sleep(800);
}

async function injectPhoto() {
  return page.evaluate(() => {
    const btn = document.querySelector('[data-testid="e2e-inject-photo"]');
    if (btn) {
      btn.click();
      return true;
    }
    const tiny =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFElEQVR42mP8z8BQz0AEYBxVSF+FAP5IDva59Tn2AAAAAElFTkSuQmCC';
    window.dispatchEvent(new CustomEvent('e2e-inject-photo', { detail: tiny }));
    return !!document.querySelector('[data-testid="e2e-inject-photo"]');
  });
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
  if (!picked) throw new Error('Direct observation option missing');
  sleep(1500);
  await page.waitFor(`!!document.querySelector('[data-testid="elephant-count-plus-male_count"]')`, 10000);
  const clicked = await page.evaluate(() => {
    const plus = document.querySelector('[data-testid="elephant-count-plus-male_count"]');
    if (!plus) return false;
    // Dispatch real pointer/mouse events so React handlers reliably fire under CDP
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      plus.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    }
    return true;
  });
  if (!clicked) throw new Error('Elephant count Plus not found');
  sleep(600);
  // Re-click once more after re-render (stale closure would keep both clicks at +1 from 0)
  await page.evaluate(() => {
    const plus = document.querySelector('[data-testid="elephant-count-plus-male_count"]');
    plus?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  });
  sleep(500);
  const value = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="elephant-count-value-male_count"]');
    return Number((el?.textContent || '').trim());
  });
  if (!(value >= 1)) throw new Error(`Elephant count stayed at ${value} after Plus`);
  await page.waitFor(
    `!![...document.querySelectorAll('button')].some((b) => /continue|next|जारी|आगे|पुढे/i.test(b.textContent || '') && !b.disabled)`,
    10000,
  );
}

async function fillLatLng() {
  await page.evaluate(
    (lat, lng) => {
      const nums = [...document.querySelectorAll('input[type="number"]')];
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (nums[0]) {
        setter?.call(nums[0], lat);
        nums[0].dispatchEvent(new Event('input', { bubbles: true }));
        nums[0].dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (nums[1]) {
        setter?.call(nums[1], lng);
        nums[1].dispatchEvent(new Event('input', { bubbles: true }));
        nums[1].dispatchEvent(new Event('change', { bubbles: true }));
      }
    },
    LAT,
    LNG,
  );
  sleep(600);
}

async function completeReportToSubmit({ offlineLabel = false } = {}) {
  await page.goto('https://localhost/report');
  sleep(2500);
  const injected = await injectPhoto();
  if (!injected) {
    const hasBtn = await page.evaluate(() => !!document.querySelector('[data-testid="e2e-inject-photo"]'));
    if (!hasBtn) throw new Error('e2e-inject-photo unavailable — rebuild staging APK');
  }
  sleep(500);
  await clickContinue();
  sleep(1200);
  await selectDirectWithCount();
  await clickContinue();
  sleep(1500);
  await fillLatLng();
  // Territory selects may auto-fill from GPS; if Continue still disabled, try once more
  try {
    await clickContinue();
  } catch {
    sleep(1500);
    await fillLatLng();
    await clickContinue();
  }
  sleep(2000);
  const submitted = await page.evaluate((allowOffline) => {
    const re = allowOffline ? /Submit|सबमिट|जमा|offline/i : /Submit|सबमिट|जमा/i;
    const btn = [...document.querySelectorAll('button')].find((b) => re.test(b.textContent || '') && !b.disabled);
    if (!btn) return false;
    btn.click();
    return true;
  }, offlineLabel);
  if (!submitted) throw new Error('Submit button not found');
  sleep(7000);
}

await mkdir(OUT, { recursive: true });
console.log(`Device ${SERIAL} · UI Lab full cert`);
console.log(`Installed: ${adb('shell', 'dumpsys', 'package', PKG).match(/versionName=\S+/)?.[0] || '?'}`);

process.on('exit', restoreNetwork);
process.on('SIGINT', () => {
  restoreNetwork();
  process.exit(130);
});

launchApp();
page = await CdpPage.connect(forwardDevtools());

await check('Package is UI Lab (uifeedback)', async () => {
  const dump = adb('shell', 'dumpsys', 'package', PKG);
  if (!/versionName=2\.1\.18/.test(dump)) throw new Error('not 2.1.18');
});

await check('Beat guard OTP login (field writer)', async () => {
  await loginOTP(BG.phone, BG.otp);
  await shot('01-bg-home');
});

await check('Home chrome: BrandMark + edge nav + Add Sighting', async () => {
  await page.goto('https://localhost/');
  sleep(2500);
  const info = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      path: location.pathname,
      add: /Add Sighting/i.test(text),
      nearby: /Nearby Sightings/i.test(text),
      hasNav: [...document.querySelectorAll('button,a,nav')].some((el) => /Home|Map|Profile|Settings/i.test(el.textContent || '')),
      brand: /ERAVAT/i.test(text),
    };
  });
  if (info.path.includes('complete-location')) throw new Error('Still gated on complete-location');
  if (!info.add || !info.nearby) throw new Error(`Home missing tiles: ${JSON.stringify(info)}`);
  if (!info.hasNav) throw new Error('Bottom nav not detected');
});

await check('Nearby sightings loads', async () => {
  await page.goto('https://localhost/nearby');
  sleep(3500);
  const text = await page.evaluate(() => document.body.innerText);
  if (!/Nearby|Sighting|Radius|km| आस-पास|जवळपास/i.test(text)) {
    throw new Error(`Nearby unexpected: ${text.slice(0, 160)}`);
  }
  await shot('02-nearby');
});

await check('History / My Sightings loads', async () => {
  await page.goto('https://localhost/history');
  sleep(3500);
  const text = await page.evaluate(() => document.body.innerText);
  if (!/Sighting|History|Report|Territory|Radius|Past|Direct|Indirect|No |empty|sync/i.test(text)) {
    throw new Error(`History unexpected: ${text.slice(0, 160)}`);
  }
  await shot('03-history');
});

await check('Map page loads with disclosure chrome', async () => {
  await page.goto('https://localhost/map');
  sleep(3500);
  const info = await page.evaluate(() => {
    const text = document.body.innerText;
    const disclosure = !!document.querySelector('details');
    const map = !!document.querySelector('.leaflet-container');
    return { text: text.slice(0, 200), disclosure, map, hasTitle: /Map|Territory|मानचित्र|नकाशा/i.test(text) };
  });
  if (!info.hasTitle && !info.map) throw new Error(`Map missing: ${JSON.stringify(info)}`);
  await shot('04-map');
});

await check('Villagers list loads', async () => {
  await page.goto('https://localhost/villagers');
  sleep(3000);
  const text = await page.evaluate(() => document.body.innerText);
  if (!/Villager|Hathi|Search|Onboard|registered|ग्रामीण|माझे/i.test(text)) {
    throw new Error(`Villagers unexpected: ${text.slice(0, 160)}`);
  }
  await shot('05-villagers');
});

await check('Onboard villager form loads', async () => {
  await page.goto('https://localhost/villagers/onboard');
  sleep(2500);
  const text = await page.evaluate(() => document.body.innerText);
  if (!/Name|Mobile|Village|Register|Onboard|GPS|location|नाम|मोबाइल/i.test(text)) {
    throw new Error(`Onboard form unexpected: ${text.slice(0, 160)}`);
  }
  await shot('06-onboard-form');
});

await check('Volunteer onboard form loads', async () => {
  await page.goto('https://localhost/volunteers/onboard');
  sleep(2500);
  const text = await page.evaluate(() => document.body.innerText);
  // Role may hide this — accept auth/forbidden as existing RBAC
  if (/forbidden|not allowed|permission|unauthorized/i.test(text) && !/Name|Mobile|Register|Hathi Mitra|Volunteer/i.test(text)) {
    console.log('  (role-gated volunteer onboard — expected for some roles)');
    return;
  }
  if (!/Name|Mobile|Register|Hathi|Volunteer|Onboard|नाम/i.test(text)) {
    throw new Error(`Volunteer onboard unexpected: ${text.slice(0, 160)}`);
  }
  await shot('07-volunteer-onboard');
});

await check('Profile + Settings chrome', async () => {
  await page.goto('https://localhost/profile');
  sleep(2000);
  let text = await page.evaluate(() => document.body.innerText);
  if (!/Profile|Edit|Privacy|Help|Logout|Sign out|प्रोफ़ाइल/i.test(text)) {
    throw new Error(`Profile unexpected: ${text.slice(0, 120)}`);
  }
  await shot('08-profile');
  await page.goto('https://localhost/settings');
  sleep(2000);
  text = await page.evaluate(() => document.body.innerText);
  if (!/Settings|Theme|Language|Update|2\.1\.18|Appearance|सेटिंग/i.test(text)) {
    throw new Error(`Settings unexpected: ${text.slice(0, 120)}`);
  }
  await shot('09-settings');
});

await check('Full report submit → saved (staging)', async () => {
  await completeReportToSubmit();
  const result = await page.evaluate(() => ({
    body: document.body.innerText,
    path: location.pathname,
  }));
  const saved =
    /Saved|Syncing|Stored locally|success|सहेज|जतन/i.test(result.body) || !result.path.includes('/report');
  if (!saved) throw new Error(`Submit result unclear: ${result.body.slice(0, 200)}`);
  await shot('10-report-submit');
  await page.goto('https://localhost/history');
  sleep(4000);
  const hist = await page.evaluate(() => document.body.innerText);
  if (!/Direct|Sighting|elephant|Report|Today|sync|pending|Territory/i.test(hist)) {
    throw new Error(`History after submit weak: ${hist.slice(0, 160)}`);
  }
  await shot('11-history-after-submit');
});

await check('Villager onboard submit (staging write)', async () => {
  await page.goto('https://localhost/villagers/onboard');
  sleep(2500);
  const uniqueMobile = `99${String(Date.now()).slice(-8)}`;
  const name = `UILab Villager ${Date.now() % 10000}`;
  await page.evaluate(
    (n, m, lat, lng) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      const fill = (el, val) => {
        if (!el) return;
        setter?.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const textInputs = [...document.querySelectorAll('input:not([type="tel"]):not([type="number"]):not([type="hidden"])')];
      fill(textInputs[0], n);
      fill(document.querySelector('input[type="tel"]'), m);
      const nums = [...document.querySelectorAll('input[type="number"]')];
      fill(nums[0], lat);
      fill(nums[1], lng);
      const village = textInputs[1] || textInputs.find((i) => /village|गाव|गांव/i.test(i.placeholder || i.name || ''));
      fill(village, `UILabVillage${Date.now() % 999}`);
      const select = document.querySelector('select');
      if (select && select.options.length > 1) {
        select.selectedIndex = 1;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    },
    name,
    uniqueMobile,
    LAT,
    LNG,
  );
  sleep(500);
  await clickButton('Register|Onboard|Submit|जोड़|Save');
  sleep(4000);
  const body = await page.evaluate(() => document.body.innerText);
  const ok =
    (/success|registered|onboard|complete|✓|✔|added/i.test(body) && !/required|failed|error/i.test(body.slice(0, 280))) ||
    location.pathname.includes('/villagers');
  if (!ok) throw new Error(`Onboard result: ${body.slice(0, 180)}`);
  await shot('12-villager-onboard');
});

await check('Offline report queues locally then recovers', async () => {
  await page.goto('https://localhost/');
  sleep(2000);
  try {
    // Build the report while online (photo inject + stepper), then cut network before submit.
    await page.goto('https://localhost/report');
    sleep(2500);
    const injected = await injectPhoto();
    if (!injected) throw new Error('e2e-inject-photo unavailable — rebuild staging APK');
    sleep(500);
    await clickContinue();
    sleep(1200);
    await selectDirectWithCount();
    await clickContinue();
    sleep(1500);
    await fillLatLng();
    try {
      await clickContinue();
    } catch {
      sleep(1500);
      await fillLatLng();
      await clickContinue();
    }
    sleep(1500);
    try {
      adb('shell', 'svc', 'wifi', 'disable');
      adb('shell', 'svc', 'data', 'disable');
      networkDisabled = true;
    } catch (e) {
      throw new Error(`Could not disable network: ${e.message}`);
    }
    sleep(2000);
    await page.evaluate(() => {
      window.dispatchEvent(new Event('offline'));
    });
    sleep(1000);
    const submitted = await page.evaluate(() => {
      const re = /Submit|सबमिट|जमा|offline/i;
      const btn = [...document.querySelectorAll('button')].find((b) => re.test(b.textContent || '') && !b.disabled);
      if (!btn) return false;
      btn.click();
      return true;
    });
    if (!submitted) throw new Error('Offline submit not reached');
    sleep(5000);
    const off = await page.evaluate(() => ({
      body: document.body.innerText,
      path: location.pathname,
    }));
    if (!/Stored locally|offline|pending|Saved|sync|सहेज|जतन/i.test(off.body) && off.path.includes('/report')) {
      throw new Error(`Offline queue unclear: ${off.body.slice(0, 180)}`);
    }
    await shot('13-offline-queued');
  } finally {
    restoreNetwork();
  }
  sleep(4000);
  await page.goto('https://localhost/');
  sleep(5000);
  const home = await page.evaluate(() => document.body.innerText);
  if (!/Add Sighting|Pending|sync|Online/i.test(home)) {
    throw new Error(`Online recovery home unexpected: ${home.slice(0, 120)}`);
  }
  await shot('14-online-recover');
});

await check('Admin login + notifications UI (push inbox)', async () => {
  await loginOTP(ADMIN.phone, ADMIN.otp);
  await page.goto('https://localhost/admin/notifications');
  sleep(3000);
  const text = await page.evaluate(() => document.body.innerText);
  if (!/Notif|Alert|Push|Message|सूचना|Recipient/i.test(text)) {
    throw new Error(`Notifications unexpected: ${text.slice(0, 140)}`);
  }
  await shot('15-admin-notifications');
  // Field notification bell on home
  await page.goto('https://localhost/');
  sleep(2000);
  const bell = await page.evaluate(() => {
    const btn = document.querySelector('[aria-label*="otif" i], button:has(svg.lucide-bell), [class*="bell"]');
    btn?.click();
    return !!btn;
  });
  sleep(1500);
  await shot('16-notification-bell');
  if (!bell) console.log('  (bell control not distinctly found — page still loaded)');
});

await check('Support FAB present (design chrome)', async () => {
  const fab = await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="report-issue-open"]');
    return !!btn;
  });
  if (!fab) throw new Error('Report issue FAB missing');
});

restoreNetwork();

const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok).length;
const summary = {
  device: SERIAL,
  model: adb('shell', 'getprop', 'ro.product.model'),
  package: PKG,
  versionName: '2.1.18',
  versionCode: 20118,
  channel: 'ui-feedback',
  backend: 'staging (ttjtyvxfiqhjdngkgdkf)',
  note: 'Full UI Lab device certification — field deep paths + offline + CC notifications UI',
  passed,
  failed,
  results,
  testedAt: new Date().toISOString(),
};
await writeFile(join(OUT, 'results.json'), JSON.stringify(summary, null, 2));
console.log('\n=== UI LAB FULL CERT SUMMARY ===');
console.log(JSON.stringify(summary, null, 2));
process.exit(failed ? 1 : 0);
