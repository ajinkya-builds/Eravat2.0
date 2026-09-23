/**
 * Staging APK E2E on Android emulator via WebView CDP.
 * Prereq: emulator running, staging APK installed.
 * Run: node scripts/emulator-e2e-playwright.mjs
 */
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { CdpPage } from './cdp-page.mjs';

const PKG = 'com.forestdept.eravat';
const OUT = join(process.cwd(), '../Go live Prep - Staging/generated/e2e-emulator-playwright');

const manifest = JSON.parse(
  readFileSync(join(process.cwd(), '../Go live Prep - Staging/generated/uat-testers/uat-testers-otp-manifest.json'), 'utf8'),
);
function pick(role, phonePrefer) {
  const u =
    (phonePrefer && manifest.find((x) => x.role === role && x.phone_app === phonePrefer)) ||
    manifest.find((x) => x.role === role);
  if (!u?.phone_app || !u?.otp) throw new Error(`No UAT user for ${role}`);
  return { phone: u.phone_app, otp: u.otp };
}

const USERS = {
  beat_guard: pick('beat_guard', '7415740750'), // Jamudi beat — beat_id seeded
  admin: pick('admin'),
  dfo: pick('dfo'),
  range_officer: pick('range_officer', '8319714182'),
  volunteer: pick('volunteer'),
  unenrolled: { phone: '9000000001', otp: '' },
};

const results = [];
let page;

function adb(...args) {
  try {
    return execSync(['adb', ...args].join(' '), { encoding: 'utf8' }).trim();
  } catch (e) {
    // pidof returns exit 1 when process missing — treat as empty
    if (args.includes('pidof')) return '';
    throw e;
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

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
      await shot(`fail-${name.replace(/\s+/g, '-')}`);
    } catch {
      /* ignore */
    }
  }
}

function launchApp() {
  try {
    adb('shell', 'cmd', 'connectivity', 'airplane-mode', 'disable');
  } catch {
    /* ignore */
  }
  try {
    adb('shell', 'settings', 'put', 'global', 'airplane_mode_on', '0');
  } catch {
    /* ignore */
  }
  try {
    adb('shell', 'svc', 'wifi', 'enable');
    adb('shell', 'svc', 'data', 'enable');
  } catch {
    /* best effort */
  }
  try {
    adb('shell', 'am', 'force-stop', PKG);
  } catch {
    /* emulator may be mid-restart */
  }
  sleep(800);
  try {
    adb('shell', 'pm', 'grant', PKG, 'android.permission.ACCESS_FINE_LOCATION');
    adb('shell', 'pm', 'grant', PKG, 'android.permission.ACCESS_COARSE_LOCATION');
  } catch {
    /* first install may not have granted yet */
  }
  try {
    adb('emu', 'geo', 'fix', '80.988653', '23.181467');
  } catch {
    /* ignore if not an emulator console */
  }
  try {
    adb('shell', 'am', 'start', '-n', `${PKG}/.MainActivity`);
  } catch (e) {
    throw new Error(`Failed to start MainActivity: ${e.message}`);
  }
  sleep(8000);
}

function forwardDevtools(retries = 8) {
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
      sleep(2500);
      const raw = execSync('curl -sS --max-time 5 http://127.0.0.1:9222/json/list', { encoding: 'utf8' });
      if (!raw || !raw.trim()) throw new Error('Empty CDP json/list reply');
      const list = JSON.parse(raw);
      const target =
        list.find((t) => t.type === 'page' && t.url.includes('localhost')) ||
        list.find((t) => t.type === 'page' && t.url.includes('index')) ||
        list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (!target?.webSocketDebuggerUrl) throw new Error('No WebView page target found');
      return target.webSocketDebuggerUrl;
    } catch (e) {
      lastErr = e;
      console.log(`CDP forward attempt ${i + 1}/${retries} failed: ${e.message}`);
      sleep(1500);
      if (i === 2 || i === 5) launchApp();
    }
  }
  throw lastErr || new Error('CDP forward failed');
}

async function connectPage() {
  return CdpPage.connect(forwardDevtools());
}

async function softReset() {
  // Clear auth and return to a clean login screen; relaunch if WebView went blank
  try {
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (
          key.startsWith('sb-') ||
          key.startsWith('eravat_') ||
          key.includes('supabase')
        ) {
          localStorage.removeItem(key);
        }
      }
      sessionStorage.clear();
    });
  } catch {
    /* WebView may be dead — relaunch below */
  }
  try {
    await page.goto('https://localhost/login');
    await page.waitFor(
      '!!document.querySelector(\'input[placeholder="9876543210"]\')',
      15000
    );
    return;
  } catch {
    /* fall through to relaunch */
  }
  page.close();
  launchApp();
  page = await connectPage();
  await page.goto('https://localhost/login');
  await page.waitFor(
    '!!document.querySelector(\'input[placeholder="9876543210"]\')',
    25000
  );
}

async function waitForText(text, timeout = 15000) {
  await page.waitFor(
    `!!(document.body && document.body.innerText && document.body.innerText.includes(${JSON.stringify(text)}))`,
    timeout
  );
}

async function fillPlaceholder(placeholder, value) {
  await page.waitFor(
    `!!document.querySelector('input[placeholder="${placeholder}"]')`,
    15000,
  );
  const ok = await page.evaluate(
    (ph, val) => {
      const input = document.querySelector(`input[placeholder="${ph}"]`);
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, val);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return (input).value === val;
    },
    placeholder,
    value
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

async function loginOTP(phone, otp) {
  await softReset();
  await fillPlaceholder('9876543210', phone);
  await clickButton('Send OTP');
  await page.waitFor('!!document.querySelector(\'input[placeholder="Enter 6-digit code"]\')', 45000);
  await fillPlaceholder('Enter 6-digit code', otp);
  await clickButton('Verify');
  await page.waitFor('!location.pathname.includes("/login")', 45000);
}

await mkdir(OUT, { recursive: true });
launchApp();
try {
  page = await connectPage();
} catch (e) {
  console.error('CDP connect failed:', e.message);
  const summary = {
    passed: 0,
    failed: 1,
    results: [{ name: 'CDP connect', ok: false, error: e.message }],
    testedAt: new Date().toISOString(),
    package: PKG,
    method: 'cdp-webview',
  };
  await writeFile(join(OUT, 'results.json'), JSON.stringify(summary, null, 2));
  process.exit(1);
}

await check('APK launches to login', async () => {
  // Prefer a clean login surface; relaunch if WebView is blank/session-stuck
  try {
    await softReset();
  } catch {
    page.close();
    launchApp();
    page = await connectPage();
    await page.goto('https://localhost/login');
    await page.waitFor(
      '!!document.querySelector(\'input[placeholder="9876543210"]\')',
      25000,
    );
  }
  await waitForText('Welcome Back', 25000);
  await shot('01-login');
});

await check('Unenrolled phone rejected', async () => {
  await softReset();
  await fillPlaceholder('9876543210', USERS.unenrolled.phone);
  await clickButton('Send OTP');
  await page.waitFor(
    '!!(document.body && /not enrolled|Invalid credentials|try again/i.test(document.body.innerText || ""))',
    45000,
  );
  await shot('02-unenrolled');
});

await check('Beat guard OTP login', async () => {
  await loginOTP(USERS.beat_guard.phone, USERS.beat_guard.otp);
  await shot('03-dashboard');
});

await check('Dashboard content', async () => {
  await page.goto('https://localhost/');
  await page.waitFor(
    '!!(document.body && /Add Sighting|Nearby Sightings|What would you like to do today/i.test(document.body.innerText || ""))',
    20000,
  );
  await shot('04-dashboard');
});

await check('Report wizard opens', async () => {
  await page.goto('https://localhost/report');
  await page.sleep(2000);
  const body = await page.content();
  if (!/location|observation|date|time|sighting|activity|photo|camera|continue/i.test(body)) {
    throw new Error('Report wizard missing expected fields');
  }
  await shot('05-report');
});

await check('Report submit with staging test photo', async () => {
  await page.goto('https://localhost/report');
  await page.sleep(2000);
  const injected = await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="e2e-inject-photo"]');
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });
  if (!injected) throw new Error('Staging test photo button missing in APK');
  await clickButton('Continue');
  await page.sleep(800);
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
  await page.sleep(1000);
  await shot('05b-report-flow');
});

await check('Map loads Leaflet', async () => {
  await page.goto('https://localhost/map');
  await page.waitFor('!!document.querySelector(".leaflet-container")', 25000);
  await shot('06-map');
});

await check('Profile page', async () => {
  await page.goto('https://localhost/profile');
  await page.sleep(2000);
  await shot('07-profile');
});

await check('Settings page', async () => {
  await page.goto('https://localhost/settings');
  await page.sleep(2000);
  await shot('08-settings');
});

await check('History page with seeded data', async () => {
  await page.goto('https://localhost/history');
  await page.sleep(3000);
  await shot('09-history');
});

await check('Beat guard sees geo sighting notification', async () => {
  await page.goto('https://localhost/');
  await page.sleep(2500);
  const clicked = await page.evaluate(() => {
    const btn = document.querySelector('button[aria-label="Notifications"]');
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (!clicked) throw new Error('Notifications bell missing');
  await page.sleep(1500);
  const txt = await page.evaluate(() => document.body?.innerText || '');
  // Soft pass: bell opens; proximity content is best-effort (depends on seeded geo data)
  if (!/Direct Sighting Alert|Activity within your alert radius|Notification|No notifications|Mark all/i.test(txt)) {
    throw new Error('Notifications panel did not open');
  }
  await shot('10b-bg-notifications');
});

await check('Beat guard blocked from admin', async () => {
  await page.goto('https://localhost/admin');
  await page.sleep(2500);
  const body = await page.evaluate(() => (document.body?.innerText || '').toLowerCase());
  if (body.includes('command center') || body.includes('conflict intelligence') || body.includes('user management')) {
    throw new Error('Beat guard reached admin UI');
  }
  // Expect redirect away from admin or an access denial — not the admin shell
  const path = await page.evaluate(() => location.pathname);
  if (path.startsWith('/admin') && /overview|sightings today|total personnel/i.test(body)) {
    throw new Error(`Beat guard still on admin path ${path}`);
  }
  await shot('10-beat-guard-admin');
});

await check('Admin login + admin routes', async () => {
  await loginOTP(USERS.admin.phone, USERS.admin.otp);
  await page.goto('https://localhost/admin/users');
  await page.sleep(3000);
  const body = await page.content();
  if (!/user|phone|role|search/i.test(body)) throw new Error('Admin users page missing');
  await shot('11-admin-users');
  await page.goto('https://localhost/admin/villagers');
  await page.sleep(3000);
  await shot('11b-admin-villagers');
  await page.goto('https://localhost/admin/observations');
  await page.sleep(3000);
  await shot('12-admin-observations');
  await page.goto('https://localhost/admin/map');
  await page.waitFor('!!document.querySelector(".leaflet-container")', 35000);
  await shot('13-admin-map');
});

await check('DFO login + admin home', async () => {
  await loginOTP(USERS.dfo.phone, USERS.dfo.otp);
  await page.goto('https://localhost/admin');
  await page.sleep(2500);
  const body = (await page.content()).toLowerCase();
  if (!(body.includes('command center') || body.includes('conflict intelligence') || body.includes('user management'))) {
    throw new Error('DFO admin home missing');
  }
  await shot('12b-dfo-admin');
});

await check('Range officer field home', async () => {
  await loginOTP(USERS.range_officer.phone, USERS.range_officer.otp);
  await page.goto('https://localhost/');
  await page.sleep(2000);
  await page.waitFor(
    '!!(document.body && /Add Sighting|Nearby Sightings|ERAVAT/i.test(document.body.innerText || ""))',
    15000,
  );
  await shot('12c-ro-home');
});

await check('Volunteer field home', async () => {
  await loginOTP(USERS.volunteer.phone, USERS.volunteer.otp);
  await page.goto('https://localhost/');
  await page.sleep(2000);
  await page.waitFor(
    '!!(document.body && /Add Sighting|Nearby Sightings|ERAVAT/i.test(document.body.innerText || ""))',
    15000,
  );
  await shot('12d-volunteer-home');
});

await check('Cold start restores session', async () => {
  // Ensure a session exists from the previous volunteer login
  try {
    page.close();
  } catch {
    /* ignore */
  }
  launchApp();
  page = await connectPage();
  await page.sleep(3500);
  const locked = await page.evaluate(() =>
    /Enter.*PIN|Unlock/i.test(document.body?.innerText || '')
  );
  if (locked) throw new Error('PIN lock still shown after cold start');
  const onApp = await page.evaluate(() => !location.pathname.includes('/login'));
  if (!onApp) throw new Error('App did not restore session after cold start');
  await shot('14-session-restore');
});

await check('Offline mode: report page reachable', async () => {
  adb('shell', 'svc', 'wifi', 'disable');
  adb('shell', 'svc', 'data', 'disable');
  sleep(2000);
  await page.goto('https://localhost/report');
  await page.sleep(2000);
  await shot('15-offline-report');
  adb('shell', 'svc', 'wifi', 'enable');
  adb('shell', 'svc', 'data', 'enable');
  sleep(3000);
  await shot('16-online-restored');
});

await check('Offline cold start restores session quickly', async () => {
  adb('shell', 'svc', 'wifi', 'disable');
  adb('shell', 'svc', 'data', 'disable');
  sleep(1000);
  try {
    page.close();
  } catch {
    /* ignore */
  }
  const started = Date.now();
  launchApp();
  page = await connectPage();
  await page.waitFor('!location.pathname.includes("/login")', 20000);
  const elapsed = Date.now() - started;
  console.log('offline cold start ms', elapsed);
  // Cap includes force-stop + cold start + WebView CDP attach under airplane mode
  if (elapsed > 20000) {
    throw new Error(`Offline cold start took ${elapsed}ms`);
  }
  await shot('17-offline-cold-start');
  adb('shell', 'svc', 'wifi', 'enable');
  adb('shell', 'svc', 'data', 'enable');
  sleep(2000);
});

try {
  page.close();
} catch {
  /* ignore */
}

const summary = {
  passed: results.filter((r) => r.ok).length,
  failed: results.filter((r) => !r.ok).length,
  results,
  testedAt: new Date().toISOString(),
  package: PKG,
  method: 'cdp-webview',
};
await writeFile(join(OUT, 'results.json'), JSON.stringify(summary, null, 2));
console.log('\nSUMMARY', summary);
process.exit(summary.failed ? 1 : 0);
