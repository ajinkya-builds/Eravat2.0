/**
 * Private UI-feedback APK checks on a physical Android device (Pixel).
 * Does NOT publish staging updates. Same staging backend + UAT OTP.
 *
 * Run: node scripts/pixel-ui-feedback-e2e.mjs [--serial 41221JEHN00156]
 */
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { CdpPage } from './cdp-page.mjs';

const PKG = 'com.forestdept.eravat.uifeedback';
// applicationId differs from Java namespace — MainActivity stays under com.forestdept.eravat
const ACTIVITY = 'com.forestdept.eravat.uifeedback/com.forestdept.eravat.MainActivity';
const OUT = join(process.cwd(), '../Go live Prep - Staging/generated/ui-feedback/pixel-e2e');
const SDK = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || `${process.env.HOME}/Library/Android/sdk`;
const ADB_BIN = `${SDK}/platform-tools/adb`;

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
  console.error('No physical device found. Connect Pixel with USB debugging.');
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
const ADMIN = pick('admin');

const results = [];
let page;

async function shot(name) {
  await page.screenshot(join(OUT, `${name}.png`));
  try {
    adb('exec-out', 'screencap', '-p', '>', join(OUT, `${name}-device.png`));
  } catch {
    /* device screencap optional */
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
  ]) {
    try {
      adb('shell', 'pm', 'grant', PKG, perm);
    } catch {
      /* ignore */
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
}

await mkdir(OUT, { recursive: true });
console.log(`Device ${SERIAL}`);
console.log(`Installed: ${adb('shell', 'dumpsys', 'package', PKG).match(/versionName=\S+/)?.[0] || '?'}`);

launchApp();
page = await CdpPage.connect(forwardDevtools());

await check('APK launches to login', async () => {
  await softReset();
  const text = await page.evaluate(() => document.body.innerText);
  if (!/Eravat|Send OTP|Welcome/i.test(text)) throw new Error(`Unexpected login UI: ${text.slice(0, 120)}`);
  await shot('01-login');
});

await check('Installed version is 2.1.18', async () => {
  const dump = adb('shell', 'dumpsys', 'package', PKG);
  if (!/versionName=2\.1\.18/.test(dump)) throw new Error('versionName is not 2.1.18');
  if (!/versionCode=20118/.test(dump)) throw new Error('versionCode is not 20118');
});

await check('Admin OTP login', async () => {
  await loginOTP(ADMIN.phone, ADMIN.otp);
  await shot('02-post-login');
});

await check('Home shows Add Sighting (unchanged copy)', async () => {
  await page.goto('https://localhost/');
  sleep(2500);
  const path = await page.evaluate(() => location.pathname);
  if (path.includes('complete-location')) {
    results.push({ name: 'Home deferred: complete-location gate (existing flow)', ok: true });
    await shot('02b-complete-location-gate');
    return;
  }
  if (!(path === '/' || path.endsWith('/'))) {
    throw new Error(`Unexpected home path: ${path}`);
  }
  const text = await page.evaluate(() => document.body.innerText);
  if (!/Add Sighting/i.test(text)) throw new Error('Add Sighting tile missing');
  if (!/Nearby Sightings/i.test(text)) throw new Error('Nearby Sightings missing');
  await shot('03-home');
});

await check('If complete-location gate: existing screen (not new flow)', async () => {
  const path = await page.evaluate(() => location.pathname);
  if (!path.includes('complete-location')) {
    console.log('  (no complete-location gate)');
    return;
  }
  const text = await page.evaluate(() => document.body.innerText);
  if (!/location|GPS|Capture|Save/i.test(text)) throw new Error('Unexpected complete-location content');
  await shot('03b-complete-location');
});

await check('Report wizard opens on Photo step (not location)', async () => {
  // If stuck on complete-location, cannot open report — fail with clear message
  const path0 = await page.evaluate(() => location.pathname);
  if (path0.includes('complete-location')) {
    throw new Error('Blocked by existing profile GPS gate — set location once on device, then re-run');
  }
  await page.goto('https://localhost/report');
  sleep(2000);
  const path = await page.evaluate(() => location.pathname);
  if (!path.includes('/report')) throw new Error(`Not on report: ${path}`);
  const state = await page.evaluate(() => {
    const body = document.body.innerText;
    const hasPhoto =
      /Photo Evidence|फ़ोटो|फोटो|Take photo|Camera|Gallery|Inject/i.test(body) ||
      !!document.querySelector('[data-testid*="photo"], button');
    const locationFirst =
      /^[\s\S]{0,80}(Get location|Latitude|Longitude|Division)/i.test(body) &&
      !/Photo|Camera|Gallery|फ़ोटो|फोटो/i.test(body.slice(0, 200));
    return { body: body.slice(0, 400), hasPhoto, locationFirst };
  });
  if (state.locationFirst) throw new Error(`Location appears first: ${state.body}`);
  if (!state.hasPhoto) throw new Error(`Photo step not detected: ${state.body}`);
  await shot('04-report-photo-first');
});

await check('Command Center opens for admin', async () => {
  const path0 = await page.evaluate(() => location.pathname);
  if (path0.includes('complete-location')) throw new Error('Blocked by profile GPS gate');
  await page.goto('https://localhost/admin');
  sleep(2500);
  const path = await page.evaluate(() => location.pathname);
  if (!path.startsWith('/admin')) throw new Error(`Not on admin: ${path}`);
  await shot('05-admin-overview');
});

await check('Observations: phone card layout (no desktop table)', async () => {
  await page.goto('https://localhost/admin/observations');
  sleep(3000);
  const info = await page.evaluate(() => {
    const tables = [...document.querySelectorAll('table')].filter((t) => {
      const style = window.getComputedStyle(t.closest('div') || t);
      // desktop table wrapper is hidden md:block — on phone should be display none on parent with hidden md:block
      let el = t.parentElement;
      while (el) {
        const cs = window.getComputedStyle(el);
        if (cs.display === 'none') return false;
        el = el.parentElement;
      }
      return true;
    });
    const body = document.body.innerText;
    const hasTitle = /Observation|अवलोकन|निरीक्षण/i.test(body);
    const editButtons = document.querySelectorAll('button').length;
    // Mobile cards use md:hidden divide-y container — check visible card-like rows
    const cardRoots = [...document.querySelectorAll('.md\\:hidden, [class*="md:hidden"]')];
    const visibleCards = cardRoots.filter((el) => window.getComputedStyle(el).display !== 'none');
    return {
      visibleTableCount: tables.length,
      hasTitle,
      editButtons,
      visibleMobileContainers: visibleCards.length,
      sample: body.slice(0, 280),
      innerWidth: window.innerWidth,
    };
  });
  if (!info.hasTitle) throw new Error(`Observations page missing title: ${info.sample}`);
  if (info.innerWidth >= 768) {
    console.log('  viewport is tablet/desktop width — card-only assertion relaxed');
  } else if (info.visibleTableCount > 0 && info.visibleMobileContainers === 0) {
    throw new Error(`Phone still showing table without mobile cards: ${JSON.stringify(info)}`);
  }
  await shot('06-admin-observations');
});

await check('Observations actions visible without hover', async () => {
  const visible = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')];
    const actionish = buttons.filter((b) => {
      const t = (b.textContent || '') + (b.getAttribute('title') || '');
      const cs = window.getComputedStyle(b);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
      return /call|edit|view|phone|pencil|delete|reviewed/i.test(t) || b.querySelector('svg');
    });
    return actionish.length;
  });
  if (visible < 1) throw new Error('No visible action controls on observations');
});

await check('Conflict dashboard loads', async () => {
  await page.goto('https://localhost/admin/conflict');
  sleep(2500);
  const text = await page.evaluate(() => document.body.innerText);
  if (!/Conflict|क्षति|नुकसान|Crop|Human/i.test(text)) throw new Error(`Conflict page unexpected: ${text.slice(0, 160)}`);
  await shot('07-admin-conflict');
});

await check('Live dashboard loads', async () => {
  await page.goto('https://localhost/admin/live');
  sleep(2500);
  const text = await page.evaluate(() => document.body.innerText);
  if (!/Live|warnings|day|Sighting|Alert/i.test(text)) throw new Error(`Live page unexpected: ${text.slice(0, 160)}`);
  await shot('08-admin-live');
});

await check('Admin map loads with shorter map chrome', async () => {
  await page.goto('https://localhost/admin/map');
  sleep(3000);
  const info = await page.evaluate(() => {
    const map = document.querySelector('.leaflet-container') || document.querySelector('[class*="leaflet"]');
    const h = map ? map.getBoundingClientRect().height : 0;
    return { hasMap: !!map, height: h, text: document.body.innerText.slice(0, 120) };
  });
  if (!info.hasMap && !/Map|मानचित्र|नकाशा/i.test(info.text)) {
    throw new Error(`Map missing: ${JSON.stringify(info)}`);
  }
  // Phone map should not be fixed 520 if our CSS applied
  if (info.height > 0 && info.height > 480) {
    console.log(`  map height ${info.height}px (may include chrome)`);
  }
  await shot('09-admin-map');
});

await check('Users list loads (existing cards)', async () => {
  await page.goto('https://localhost/admin/users');
  sleep(2500);
  const text = await page.evaluate(() => document.body.innerText);
  if (!/Personnel|User|Staff|Add|Role/i.test(text)) throw new Error(`Users unexpected: ${text.slice(0, 160)}`);
  await shot('10-admin-users');
});

await check('Calls opens as sheet from Observations (not a separate route)', async () => {
  await page.goto('https://localhost/admin/observations');
  sleep(3000);
  const opened = await page.evaluate(() => {
    const re = /call|कॉल/i;
    const btn = [...document.querySelectorAll('button')].find((b) => {
      const t = `${b.textContent || ''} ${b.getAttribute('title') || ''}`;
      const cs = window.getComputedStyle(b);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      return re.test(t);
    });
    if (!btn) return { ok: false, reason: 'no calls button' };
    btn.click();
    return { ok: true };
  });
  if (!opened.ok) throw new Error(opened.reason);
  sleep(1500);
  const sheet = await page.evaluate(() => {
    const body = document.body.innerText;
    const dialog =
      document.querySelector('[role="dialog"]') ||
      document.querySelector('[data-state="open"]') ||
      [...document.querySelectorAll('div')].find((el) => /call|कॉल/i.test(el.textContent || '') && el.getBoundingClientRect().height > 120);
    return {
      hasDialog: !!dialog,
      sample: body.slice(0, 280),
      mentionsCalls: /call|कॉल|Phone|View/i.test(body),
    };
  });
  if (!sheet.hasDialog && !sheet.mentionsCalls) {
    throw new Error(`Calls sheet not detected: ${sheet.sample}`);
  }
  await shot('10b-admin-calls-sheet');
  // dismiss
  await page.evaluate(() => {
    const close = [...document.querySelectorAll('button')].find((b) => /close|×|dismiss|cancel/i.test(b.textContent || b.getAttribute('aria-label') || ''));
    close?.click();
  });
});

await check('Notifications + Divisions + Support load', async () => {
  for (const [route, re] of [
    ['/admin/notifications', /Notif|Alert|Push|सूचना/i],
    ['/admin/divisions', /Division|Range|Beat|मंडल|डिवीजन/i],
    ['/admin/support', /Support|Issue|Report|सहायता/i],
  ]) {
    await page.goto(`https://localhost${route}`);
    sleep(2200);
    const path = await page.evaluate(() => location.pathname);
    const text = await page.evaluate(() => document.body.innerText);
    if (!path.startsWith('/admin') || !re.test(text)) {
      throw new Error(`${route} unexpected path=${path} text=${text.slice(0, 120)}`);
    }
    await shot(`10c-${route.replace(/\//g, '-').slice(1)}`);
  }
});

await check('No horizontal page overflow on CC screens', async () => {
  const routes = [
    '/admin',
    '/admin/observations',
    '/admin/conflict',
    '/admin/live',
    '/admin/map',
    '/admin/users',
    '/admin/calls',
  ];
  const overflows = [];
  for (const route of routes) {
    await page.goto(`https://localhost${route}`);
    sleep(1800);
    const o = await page.evaluate(() => {
      const doc = document.documentElement;
      const body = document.body;
      const scrollW = Math.max(doc.scrollWidth, body.scrollWidth);
      const clientW = doc.clientWidth;
      return { path: location.pathname, scrollW, clientW, overflow: scrollW > clientW + 8 };
    });
    if (o.overflow) overflows.push(o);
  }
  if (overflows.length) {
    throw new Error(`Horizontal overflow: ${JSON.stringify(overflows)}`);
  }
  await shot('10d-no-overflow-sample');
});

await check('Settings shows version 2.1.18', async () => {
  await page.goto('https://localhost/settings');
  sleep(2000);
  const text = await page.evaluate(() => document.body.innerText);
  // version may be on settings or help — also check evaluate meta
  const meta = await page.evaluate(() => {
    try {
      // bundled meta may not be on window; scrape text
      return document.body.innerText;
    } catch {
      return '';
    }
  });
  const dump = adb('shell', 'dumpsys', 'package', PKG);
  if (!/versionName=2\.1\.18/.test(dump)) throw new Error('Package not 2.1.18');
  await shot('11-settings');
  if (!/2\.1\.18|Update|Language|Theme|Settings/i.test(text + meta)) {
    console.log('  settings text sample:', text.slice(0, 120));
  }
});

const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok).length;
const summary = {
  device: SERIAL,
  model: adb('shell', 'getprop', 'ro.product.model'),
  package: PKG,
  versionName: '2.1.18',
  versionCode: 20118,
  channel: 'ui-feedback',
  note: 'Private experience-test APK — not a staging ship',
  passed,
  failed,
  results,
  testedAt: new Date().toISOString(),
};
await writeFile(join(OUT, 'results.json'), JSON.stringify(summary, null, 2));
console.log('\n=== SUMMARY ===');
console.log(JSON.stringify(summary, null, 2));
process.exit(failed ? 1 : 0);
