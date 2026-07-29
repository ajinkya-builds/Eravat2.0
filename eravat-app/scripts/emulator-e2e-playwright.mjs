/**
 * Staging APK E2E on Android emulator via WebView CDP.
 * Prereq: emulator running, staging APK installed.
 * Run: node scripts/emulator-e2e-playwright.mjs
 */
import { execSync } from 'child_process';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { CdpPage } from './cdp-page.mjs';

const PKG = 'com.forestdept.eravat';
const OUT = join(process.cwd(), '../Go live Prep - Staging/generated/e2e-emulator-playwright');
const USERS = {
  beat_guard: { phone: '8889184712', pin: '1234' },
  admin: { phone: '9926445678', pin: '5678' },
  unenrolled: { phone: '9000000001' },
};

const results = [];
let page;

function adb(...args) {
  return execSync(['adb', ...args].join(' '), { encoding: 'utf8' }).trim();
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
  adb('shell', 'am', 'force-stop', PKG);
  sleep(800);
  adb('shell', 'am', 'start', '-n', `${PKG}/.MainActivity`);
  sleep(3500);
}

function forwardDevtools() {
  const pid = adb('shell', 'pidof', PKG).replace(/\r/g, '');
  if (!pid) throw new Error('Eravat process not running');
  try {
    adb('forward', '--remove-all');
  } catch {
    /* ignore */
  }
  adb('forward', 'tcp:9222', `localabstract:webview_devtools_remote_${pid}`);
  sleep(500);
  const list = JSON.parse(execSync('curl -s http://127.0.0.1:9222/json/list', { encoding: 'utf8' }));
  const target = list.find((t) => t.type === 'page' && t.url.includes('localhost'));
  if (!target?.webSocketDebuggerUrl) throw new Error('No WebView page target found');
  return target.webSocketDebuggerUrl;
}

async function connectPage() {
  return CdpPage.connect(forwardDevtools());
}

async function softReset() {
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
  await page.goto('https://localhost/login');
}

async function waitForText(text, timeout = 15000) {
  await page.waitFor(
    `!!(document.body && document.body.innerText && document.body.innerText.includes(${JSON.stringify(text)}))`,
    timeout
  );
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

async function tapPinDigit(digit) {
  const clicked = await page.evaluate((d) => {
    const btn = [...document.querySelectorAll('button')].find(
      (b) => (b.textContent || '').trim() === d
    );
    if (!btn) return false;
    btn.click();
    return true;
  }, digit);
  if (!clicked) throw new Error(`PIN key not found: ${digit}`);
}

async function loginOTP(phone) {
  await page.goto('https://localhost/login');
  await fillPlaceholder('9876543210', phone);
  await clickButton('Send OTP');
  await page.waitFor('!!document.querySelector(\'input[placeholder="Enter 6-digit code"]\')', 20000);
  await fillPlaceholder('Enter 6-digit code', '123456');
  await clickButton('Verify');
  await waitForText('PIN', 20000);
}

async function setPIN(pin) {
  for (const d of pin) await tapPinDigit(d);
  await page.sleep(500);
  for (const d of pin) await tapPinDigit(d);
  await page.waitFor('!location.pathname.includes("/login")', 25000);
}

async function unlockPIN(pin) {
  const locked = await page.evaluate(() =>
    /Enter.*PIN|Unlock/i.test(document.body?.innerText || '')
  );
  if (!locked) return;
  for (const d of pin) await tapPinDigit(d);
  await page.sleep(1500);
}

await mkdir(OUT, { recursive: true });
launchApp();
page = await connectPage();

await check('APK launches to login', async () => {
  await page.goto('https://localhost/login');
  await waitForText('Welcome Back');
  await shot('01-login');
});

await check('Unenrolled phone rejected', async () => {
  await softReset();
  await fillPlaceholder('9876543210', USERS.unenrolled.phone);
  await clickButton('Send OTP');
  await waitForText('Invalid credentials', 10000);
  await shot('02-unenrolled');
});

await check('Beat guard OTP login + PIN', async () => {
  await softReset();
  await loginOTP(USERS.beat_guard.phone);
  await setPIN(USERS.beat_guard.pin);
  await shot('03-dashboard');
});

await check('Dashboard content', async () => {
  await page.goto('https://localhost/');
  await unlockPIN(USERS.beat_guard.pin);
  await page.waitFor('document.body?.innerText?.includes("What would you like to do today")', 15000);
  await shot('04-dashboard');
});

await check('Report wizard opens', async () => {
  await page.goto('https://localhost/report');
  await unlockPIN(USERS.beat_guard.pin);
  const body = await page.content();
  if (!/location|observation|date|time|sighting|activity/i.test(body)) {
    throw new Error('Report wizard missing expected fields');
  }
  await shot('05-report');
});

await check('Map loads Leaflet', async () => {
  await page.goto('https://localhost/map');
  await unlockPIN(USERS.beat_guard.pin);
  await page.waitFor('!!document.querySelector(".leaflet-container")', 25000);
  await shot('06-map');
});

await check('Profile page', async () => {
  await page.goto('https://localhost/profile');
  await unlockPIN(USERS.beat_guard.pin);
  await page.sleep(2000);
  await shot('07-profile');
});

await check('Settings page', async () => {
  await page.goto('https://localhost/settings');
  await unlockPIN(USERS.beat_guard.pin);
  await page.sleep(2000);
  await shot('08-settings');
});

await check('History page with seeded data', async () => {
  await page.goto('https://localhost/history');
  await unlockPIN(USERS.beat_guard.pin);
  await page.sleep(3000);
  await shot('09-history');
});

await check('Beat guard blocked from admin', async () => {
  await page.goto('https://localhost/admin');
  await unlockPIN(USERS.beat_guard.pin);
  await page.sleep(2500);
  const body = (await page.content()).toLowerCase();
  if (body.includes('command center') || body.includes('user management')) {
    throw new Error('Beat guard reached admin UI');
  }
  await shot('10-beat-guard-admin');
});

await check('Admin login + admin routes', async () => {
  await softReset();
  await loginOTP(USERS.admin.phone);
  await setPIN(USERS.admin.pin);
  await page.goto('https://localhost/admin/users');
  await unlockPIN(USERS.admin.pin);
  await page.sleep(3000);
  const body = await page.content();
  if (!/user|phone|role|search/i.test(body)) throw new Error('Admin users page missing');
  await shot('11-admin-users');
  await page.goto('https://localhost/admin/observations');
  await unlockPIN(USERS.admin.pin);
  await page.sleep(3000);
  await shot('12-admin-observations');
  await page.goto('https://localhost/admin/map');
  await unlockPIN(USERS.admin.pin);
  await page.waitFor('!!document.querySelector(".leaflet-container")', 35000);
  await shot('13-admin-map');
});

await check('PIN lock after cold start', async () => {
  page.close();
  launchApp();
  page = await connectPage();
  await page.sleep(2000);
  const locked = await page.evaluate(() =>
    /Enter.*PIN|Unlock/i.test(document.body?.innerText || '')
  );
  if (!locked) throw new Error('PIN lock screen not shown after cold start');
  await unlockPIN(USERS.beat_guard.pin);
  await shot('14-pin-unlock');
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

page.close();

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
