/**
 * Maestro APK certification — native UI automation on emulator/device.
 * Prereq: emulator running OR device connected, staging APK installed.
 * Run: node scripts/maestro-certification.mjs
 */
import { execSync, spawnSync, spawn } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..');
const OUT = join(ROOT, '../Go live Prep - Staging/generated/maestro-certification');
const APK = join(ROOT, 'android/app/build/outputs/apk/debug/app-debug.apk');
const PKG = 'com.forestdept.eravat';
const SDK = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || `${process.env.HOME}/Library/Android/sdk`;
const ADB = join(SDK, 'platform-tools/adb');
const EMULATOR = join(SDK, 'emulator/emulator');
const MAESTRO = process.env.MAESTRO_BIN || `${process.env.HOME}/.maestro/bin/maestro`;

const manifest = JSON.parse(
  readFileSync(join(ROOT, '../Go live Prep - Staging/generated/uat-testers/uat-testers-otp-manifest.json'), 'utf8'),
);
const ENROLLED_BEAT_GUARD_PHONE = '7415740750'; // Jamudi beat — has beat_id in UAT seed
const bg =
  manifest.find((u) => u.role === 'beat_guard' && u.phone_app === ENROLLED_BEAT_GUARD_PHONE) ||
  manifest.find((u) => u.role === 'beat_guard');
const villagerPhone = `99${String(Date.now()).slice(-8)}`;

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function listAvds() {
  try {
    return sh(`"${EMULATOR}" -list-avds`).split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function resolveAvd() {
  const preferred = process.env.ERAVAT_AVD || 'Eravat_E2E';
  const avds = listAvds();
  if (avds.includes(preferred)) return preferred;
  if (avds.length === 0) throw new Error('No Android AVDs installed');
  // Prefer API 36 cert AVD over older Eravat_API* when Eravat_E2E is missing
  const fallback =
    avds.find((a) => a === 'Medium_Phone_API_36.0') ||
    avds.find((a) => /API_?36/i.test(a)) ||
    avds.find((a) => a === 'Eravat_API35') ||
    avds[0];
  console.warn(`AVD ${preferred} not found; falling back to ${fallback} (have: ${avds.join(', ')})`);
  return fallback;
}

async function ensureDevice() {
  const devices = sh(`"${ADB}" devices`).split('\n').slice(1).filter((l) => l.includes('device'));
  if (devices.length) return devices[0].split('\t')[0];

  const avd = resolveAvd();
  console.log(`Starting ${avd} emulator…`);
  spawn(`"${EMULATOR}"`, ['-avd', avd, '-no-snapshot-save', '-no-boot-anim', '-gpu', 'auto'], {
    detached: true,
    stdio: 'ignore',
    shell: true,
  }).unref();

  for (let i = 0; i < 60; i++) {
    sleep(4000);
    const d = sh(`"${ADB}" devices`).split('\n').slice(1).filter((l) => l.includes('device'));
    if (d.length) {
      const serial = d[0].split('\t')[0];
      const boot = sh(`"${ADB}" -s ${serial} shell getprop sys.boot_completed`).replace(/\r/g, '');
      if (boot === '1') return serial;
    }
  }
  throw new Error('Emulator boot timeout');
}

function ensureAdbHealthy(serial) {
  try {
    sh(`"${ADB}" -s ${serial} shell echo ok`);
  } catch {
    console.log('adb reconnect…');
    sh(`"${ADB}" reconnect`);
    sleep(5000);
  }
}

function ensureNetworkAndPermissions(serial) {
  const adb = `"${ADB}" -s ${serial}`;
  // Prefer cmd connectivity (API 30+); avoid AIRPLANE_MODE broadcast (SecurityException on API 36)
  for (const cmd of [
    `${adb} shell cmd connectivity airplane-mode disable`,
    `${adb} shell settings put global airplane_mode_on 0`,
    `${adb} shell svc wifi enable`,
    `${adb} shell svc data enable`,
  ]) {
    try {
      sh(cmd);
    } catch {
      /* best effort */
    }
  }
  for (const perm of [
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.POST_NOTIFICATIONS',
    'android.permission.CAMERA',
  ]) {
    try {
      sh(`${adb} shell pm grant ${PKG} ${perm}`);
    } catch {
      /* older APIs may not have the permission */
    }
  }
}

function clearMaestroDriver(serial) {
  const adb = `"${ADB}" -s ${serial}`;
  for (const pkg of ['dev.mobile.maestro.test', 'dev.mobile.maestro']) {
    try {
      sh(`${adb} shell am force-stop ${pkg}`);
    } catch {
      /* ignore */
    }
  }
  // Reinstall happens automatically on next maestro test; force-stop is enough
  sleep(2000);
}

function runMaestro(flow, env) {
  const envArgs = Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]);
  const r = spawnSync(MAESTRO, ['test', '--no-reinstall-driver', ...envArgs, flow], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    env: {
      ...process.env,
      // Give the Android driver longer to attach on busy emulators
      MAESTRO_DRIVER_STARTUP_TIMEOUT: process.env.MAESTRO_DRIVER_STARTUP_TIMEOUT || '120000',
    },
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  return {
    code: r.status ?? 1,
    out: `${r.stdout || ''}\n${r.stderr || ''}`,
  };
}

function runMaestroWithRetry(serial, flow, env, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    ensureAdbHealthy(serial);
    ensureNetworkAndPermissions(serial);
    if (i > 1) {
      console.log(`  retry ${i}/${attempts} — clearing Maestro driver state…`);
      clearMaestroDriver(serial);
      // Re-allow driver reinstall on recovery attempts
      sleep(5000);
    } else {
      sleep(2500);
    }
    const useReinstall = true; // always allow driver install after cold boots / recovery
    const envArgs = Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]);
    const args = ['test', ...envArgs, flow];
    const r = spawnSync(MAESTRO, args, {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
      env: {
        ...process.env,
        MAESTRO_DRIVER_STARTUP_TIMEOUT: process.env.MAESTRO_DRIVER_STARTUP_TIMEOUT || '120000',
      },
    });
    if (r.stdout) process.stdout.write(r.stdout);
    if (r.stderr) process.stderr.write(r.stderr);
    const code = r.status ?? 1;
    const out = `${r.stdout || ''}\n${r.stderr || ''}`;
    if (code === 0) return { code: 0, out };
    const driverFlake = /AndroidDriverTimeout|did not start up in time|Maestro Android driver|instrumentation could not be initialized/i.test(out);
    if (driverFlake && i < attempts) {
      console.log('  Maestro driver flake — will retry');
      continue;
    }
    return { code, out };
  }
  return { code: 1, out: '' };
}

mkdirSync(OUT, { recursive: true });

if (!existsSync(APK)) {
  console.error('APK missing — run: npm run build:android:staging && cd android && ./gradlew assembleDebug');
  process.exit(1);
}

if (!bg?.phone_app || !bg?.otp) {
  console.error('UAT beat_guard phone/otp missing from uat-testers-otp-manifest.json');
  process.exit(1);
}
const env = { PHONE: bg.phone_app, OTP: bg.otp, VILLAGER_PHONE: villagerPhone };

const serial = await ensureDevice();
console.log('Device:', serial);
sh(`"${ADB}" -s ${serial} install -r -t "${APK}"`);
ensureNetworkAndPermissions(serial);
ensureAdbHealthy(serial);
clearMaestroDriver(serial);
sleep(2000);

// Single-session suite avoids per-flow Android driver reconnect flakes
console.log('\n--- Maestro: suite-certification (single session) ---');
const suiteFlow = join(ROOT, 'maestro/flows/suite-certification.yaml');
const { code: suiteCode, out: suiteOut } = runMaestroWithRetry(serial, suiteFlow, env, 3);
ensureNetworkAndPermissions(serial);

const flowIds = ['login', 'report-submit', 'villager-onboard', 'offline-report'];
const results = flowIds.map((id) => {
  if (suiteCode === 0) return { id, ok: true, exitCode: 0 };
  return { id, ok: false, exitCode: suiteCode };
});
// Attribute from Maestro nested flow completion markers when possible
const markers = [
  { id: 'login', re: /Run login-beat-guard\.yaml\.\.\. COMPLETED/ },
  { id: 'report-submit', re: /Run report-from-home\.yaml\.\.\. COMPLETED|Run report-direct-submit\.yaml\.\.\. COMPLETED/ },
  { id: 'villager-onboard', re: /Run villager-from-home\.yaml\.\.\. COMPLETED|Run villager-onboard\.yaml\.\.\. COMPLETED/ },
  { id: 'offline-report', re: /Run offline-from-home\.yaml\.\.\. COMPLETED|Run offline-report\.yaml\.\.\. COMPLETED/ },
];
for (const m of markers) {
  const row = results.find((r) => r.id === m.id);
  if (row && m.re.test(suiteOut)) {
    row.ok = true;
    row.exitCode = 0;
  }
}

const summary = {
  ranAt: new Date().toISOString(),
  device: serial,
  env,
  mode: 'suite-certification',
  suiteExitCode: suiteCode,
  results,
  ok: suiteCode === 0,
};
writeFileSync(join(OUT, 'results.json'), JSON.stringify(summary, null, 2));
console.log(`\nMaestro suite: ${summary.ok ? 'PASS' : 'FAIL'} (${results.filter((r) => r.ok).length}/${results.length} flows attributed)`);
process.exit(summary.ok ? 0 : 1);
