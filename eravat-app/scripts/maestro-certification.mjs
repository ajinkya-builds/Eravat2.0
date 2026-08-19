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

async function ensureDevice() {
  const devices = sh(`"${ADB}" devices`).split('\n').slice(1).filter((l) => l.includes('device'));
  if (devices.length) return devices[0].split('\t')[0];

  console.log('Starting Eravat_E2E emulator…');
  spawn(`"${EMULATOR}"`, ['-avd', 'Eravat_E2E', '-no-snapshot-save', '-no-boot-anim', '-gpu', 'swiftshader_indirect'], {
    detached: true,
    stdio: 'ignore',
    shell: true,
  }).unref();

  for (let i = 0; i < 45; i++) {
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

function runMaestro(flow, env) {
  const envArgs = Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]);
  const r = spawnSync(MAESTRO, ['test', ...envArgs, flow], { cwd: ROOT, encoding: 'utf8', stdio: 'inherit' });
  return r.status ?? 1;
}

mkdirSync(OUT, { recursive: true });

if (!existsSync(APK)) {
  console.error('APK missing — run: npm run build:android:staging && cd android && ./gradlew assembleDebug');
  process.exit(1);
}

const serial = await ensureDevice();
console.log('Device:', serial);
sh(`"${ADB}" -s ${serial} install -r -t "${APK}"`);

const env = { PHONE: bg.phone_app, OTP: bg.otp, VILLAGER_PHONE: villagerPhone };
const flows = [
  { id: 'login', file: 'maestro/flows/login-beat-guard.yaml' },
  { id: 'report-submit', file: 'maestro/flows/report-direct-submit.yaml' },
  { id: 'villager-onboard', file: 'maestro/flows/villager-onboard.yaml' },
  { id: 'offline-report', file: 'maestro/flows/offline-report.yaml' },
];

const results = [];
for (const f of flows) {
  console.log(`\n--- Maestro: ${f.id} ---`);
  ensureAdbHealthy(serial);
  sleep(2000);
  const code = runMaestro(join(ROOT, f.file), env);
  results.push({ id: f.id, ok: code === 0, exitCode: code });
}

const summary = {
  ranAt: new Date().toISOString(),
  device: serial,
  env,
  results,
  ok: results.every((r) => r.ok),
};
writeFileSync(join(OUT, 'results.json'), JSON.stringify(summary, null, 2));
console.log(`\nMaestro: ${results.filter((r) => r.ok).length}/${results.length} flows passed`);
process.exit(summary.ok ? 0 : 1);
