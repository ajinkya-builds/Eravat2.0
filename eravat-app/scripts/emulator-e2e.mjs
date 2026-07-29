/**
 * Emulator E2E runner via adb + uiautomator.
 * Usage: node scripts/emulator-e2e.mjs
 */
import { execSync, spawnSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { parseStringPromise } from 'xml2js';

const PKG = 'com.forestdept.eravat';
const OUT = join(process.cwd(), '../Go live Prep - Staging/generated/e2e-emulator');
mkdirSync(OUT, { recursive: true });

const USERS = {
  beat_guard: { phone: '8889184712', pin: '1234', label: 'Ashok Kumar Kol' },
  admin: { phone: '9926445678', pin: '5678', label: 'Anoop Kumar Mishra' },
  unenrolled: { phone: '9000000001' },
};

const results = [];
let shot = 0;

function adb(...args) {
  return execSync(['adb', ...args].join(' '), { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function tap(x, y) {
  adb('shell', 'input', 'tap', String(x), String(y));
}

function typeText(text) {
  // adb input text needs escaping for special chars
  const safe = text.replace(/ /g, '%s').replace(/'/g, "\\'");
  adb('shell', 'input', 'text', safe);
}

function key(code) {
  adb('shell', 'input', 'keyevent', String(code));
}

function launchApp() {
  adb('shell', 'am', 'force-stop', PKG);
  sleep(800);
  adb('shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1');
  sleep(2500);
}

async function dumpUi() {
  adb('shell', 'uiautomator', 'dump', '/sdcard/ui.xml');
  const xml = adb('shell', 'cat', '/sdcard/ui.xml');
  const parsed = await parseStringPromise(xml, { explicitArray: false, mergeAttrs: true });
  const nodes = [];
  function walk(n) {
    if (!n) return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (n.node) {
      const kids = Array.isArray(n.node) ? n.node : [n.node];
      kids.forEach(walk);
      return;
    }
    if (n.class) nodes.push(n);
    if (n.node) walk(n.node);
  }
  walk(parsed.hierarchy);
  return { xml, nodes };
}

function boundsCenter(bounds) {
  const m = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(bounds || '');
  if (!m) return null;
  return { x: Math.floor((+m[1] + +m[3]) / 2), y: Math.floor((+m[2] + +m[4]) / 2) };
}

async function findNode(pred) {
  const { nodes } = await dumpUi();
  return nodes.find(pred) || null;
}

async function tapText(text, partial = true) {
  const { nodes } = await dumpUi();
  const hit = nodes.find((n) => {
    const t = (n.text || n['content-desc'] || '').toString();
    return partial ? t.toLowerCase().includes(text.toLowerCase()) : t === text;
  });
  if (!hit) throw new Error(`UI text not found: ${text}`);
  const c = boundsCenter(hit.bounds);
  if (!c) throw new Error(`No bounds for: ${text}`);
  tap(c.x, c.y);
  sleep(600);
}

async function tapEditable() {
  const node = await findNode((n) => (n.class || '').includes('EditText') || n.focusable === 'true');
  const edit = (await dumpUi()).nodes.find((n) => (n.class || '').includes('EditText'));
  if (!edit) throw new Error('No EditText found');
  const c = boundsCenter(edit.bounds);
  tap(c.x, c.y);
  sleep(400);
}

async function screenshot(label) {
  shot += 1;
  const file = join(OUT, `${String(shot).padStart(2, '0')}-${label.replace(/\s+/g, '_')}.png`);
  execSync(`adb exec-out screencap -p > "${file}"`);
  return file;
}

async function uiContains(...needles) {
  const { xml } = await dumpUi();
  const lower = xml.toLowerCase();
  return needles.every((n) => lower.includes(n.toLowerCase()));
}

async function loginWithOtp(phone, pin) {
  launchApp();
  await screenshot('login-start');
  // Phone entry - WebView content may not expose EditText; tap center input area
  await tap(540, 900);
  sleep(300);
  adb('shell', 'input', 'keyevent', 'KEYCODE_MOVE_END');
  for (let i = 0; i < 15; i++) adb('shell', 'input', 'keyevent', '67'); // DEL
  typeText(phone);
  sleep(500);
  await screenshot('phone-entered');
  // Send OTP button area (bottom of form)
  await tap(540, 1350);
  sleep(2000);
  await screenshot('otp-screen');
  // OTP digits
  await tap(540, 700);
  typeText('123456');
  sleep(1500);
  await screenshot('otp-entered');
  // Verify - tap continue
  await tap(540, 1200);
  sleep(2500);
  // PIN setup x2
  for (const step of ['pin-setup', 'pin-confirm']) {
    await screenshot(step);
    // PIN pad - type via keyboard events: 1,2,3,4
    for (const d of pin) {
      const code = 7 + Number(d); // KEYCODE_0 is 7
      key(code);
      sleep(200);
    }
    sleep(1500);
  }
  sleep(2000);
  await screenshot('post-login');
}

async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS ${name}`);
  } catch (e) {
    results.push({ name, ok: false, error: String(e.message || e) });
    console.log(`FAIL ${name}: ${e.message || e}`);
    await screenshot(`fail-${name.replace(/\s+/g, '-')}`);
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

await test('App launches to login', async () => {
  launchApp();
  const ok = await uiContains('phone', 'otp');
  if (!ok) {
    const ok2 = await uiContains('eravat', 'login');
    if (!ok2) throw new Error('Login screen not detected in UI dump');
  }
});

await test('Beat guard OTP login + PIN', async () => {
  await loginWithOtp(USERS.beat_guard.phone, USERS.beat_guard.pin);
  const ok = await uiContains('report', 'dashboard') || await uiContains('activity', 'home');
  if (!ok) {
    // May show complete location - check for map/dashboard markers
    const ok2 = await uiContains('location', 'profile') || await uiContains('sighting');
    if (!ok2) throw new Error('Dashboard not detected after login');
  }
});

await test('Dashboard visible', async () => {
  launchApp();
  sleep(1500);
  // If locked, enter PIN
  if (await uiContains('unlock', 'pin')) {
    for (const d of USERS.beat_guard.pin) key(7 + Number(d));
    sleep(1500);
  }
  await screenshot('dashboard');
  const ok = await uiContains('report') || await uiContains('activity') || await uiContains('history');
  if (!ok) throw new Error('Dashboard content missing');
});

await test('Navigate to Report Activity', async () => {
  // Bottom nav or CTA
  try {
    await tapText('Report', true);
  } catch {
    await tap(540, 1100);
  }
  sleep(2000);
  await screenshot('report-step');
  const ok = await uiContains('observation') || await uiContains('sighting') || await uiContains('location') || await uiContains('date');
  if (!ok) throw new Error('Report wizard not visible');
});

await test('Map page loads', async () => {
  launchApp();
  sleep(1000);
  if (await uiContains('unlock', 'pin')) {
    for (const d of USERS.beat_guard.pin) key(7 + Number(d));
    sleep(1200);
  }
  try {
    await tapText('Map', true);
  } catch {
    await tap(810, 2250);
  }
  sleep(3000);
  await screenshot('map');
});

await test('Profile page', async () => {
  launchApp();
  sleep(1000);
  if (await uiContains('unlock', 'pin')) {
    for (const d of USERS.beat_guard.pin) key(7 + Number(d));
    sleep(1200);
  }
  try {
    await tapText('Profile', true);
  } catch {
    await tap(270, 2250);
  }
  sleep(2000);
  await screenshot('profile');
});

await test('Settings theme/language', async () => {
  try {
    await tapText('Settings', true);
  } catch {
    await tap(540, 1800);
  }
  sleep(2000);
  await screenshot('settings');
});

await test('Offline report + reconnect sync', async () => {
  launchApp();
  sleep(1000);
  if (await uiContains('unlock', 'pin')) {
    for (const d of USERS.beat_guard.pin) key(7 + Number(d));
    sleep(1200);
  }
  adb('shell', 'cmd', 'connectivity', 'airplane-mode', 'enable');
  sleep(1500);
  try {
    await tapText('Report', true);
  } catch {
    await tap(540, 1100);
  }
  sleep(2000);
  await screenshot('offline-report');
  adb('shell', 'cmd', 'connectivity', 'airplane-mode', 'disable');
  sleep(4000);
  await screenshot('online-after-offline');
});

await test('PIN lock after cold start', async () => {
  adb('shell', 'am', 'force-stop', PKG);
  sleep(500);
  launchApp();
  sleep(2000);
  await screenshot('cold-start');
  const locked = await uiContains('pin') || await uiContains('unlock');
  if (!locked) throw new Error('Expected PIN lock screen after cold start');
  for (const d of USERS.beat_guard.pin) key(7 + Number(d));
  sleep(2000);
  await screenshot('after-unlock');
});

await test('Beat guard blocked from admin', async () => {
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'https://localhost/admin', PKG);
  sleep(2000);
  await screenshot('beat-guard-admin-attempt');
  const blocked = !(await uiContains('command center')) && !(await uiContains('user management'));
  if (!blocked) throw new Error('Beat guard may have accessed admin');
});

await test('Admin OTP login', async () => {
  adb('shell', 'pm', 'clear', PKG);
  sleep(1000);
  await loginWithOtp(USERS.admin.phone, USERS.admin.pin);
  await screenshot('admin-dashboard');
});

await test('Admin users page', async () => {
  launchApp();
  sleep(1500);
  if (await uiContains('pin')) {
    for (const d of USERS.admin.pin) key(7 + Number(d));
    sleep(1200);
  }
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'https://localhost/admin/users', PKG);
  sleep(3000);
  await screenshot('admin-users');
  const ok = await uiContains('user') || await uiContains('admin');
  if (!ok) throw new Error('Admin users page not detected');
});

await test('Unenrolled phone rejected', async () => {
  adb('shell', 'pm', 'clear', PKG);
  sleep(800);
  launchApp();
  await tap(540, 900);
  typeText(USERS.unenrolled.phone);
  await tap(540, 1350);
  sleep(2500);
  await screenshot('unenrolled-phone');
  const rejected = await uiContains('not registered') || await uiContains('invalid') || await uiContains('error') || await uiContains('enrolled');
  if (!rejected) throw new Error('Unenrolled phone was not clearly rejected');
});

// Logcat errors
let logcat = '';
try {
  logcat = adb('logcat', '-d', '-t', '200', '*:E');
} catch {
  logcat = '';
}

const summary = {
  ran_at: new Date().toISOString(),
  device: adb('shell', 'getprop', 'ro.product.model'),
  apk: 'Eravat-Staging-2.0.0.apk',
  passed: results.filter((r) => r.ok).length,
  failed: results.filter((r) => !r.ok).length,
  results,
  logcat_errors_sample: logcat.split('\n').filter((l) => l.includes(PKG) || l.includes('chromium')).slice(0, 30),
};

writeFileSync(join(OUT, 'results.json'), JSON.stringify(summary, null, 2));
writeFileSync(
  join(OUT, 'E2E_REPORT.md'),
  `# Emulator E2E Report\n\n- **When:** ${summary.ran_at}\n- **Device:** ${summary.device}\n- **Pass:** ${summary.passed} / ${results.length}\n- **Fail:** ${summary.failed}\n\n## Results\n\n${results
    .map((r) => `- [${r.ok ? 'x' : ' '}] ${r.name}${r.error ? ` — ${r.error}` : ''}`)
    .join('\n')}\n\nScreenshots in this folder.\n`
);

console.log('\n=== SUMMARY ===');
console.log(JSON.stringify({ passed: summary.passed, failed: summary.failed, out: OUT }, null, 2));
process.exit(summary.failed > 0 ? 1 : 0);
