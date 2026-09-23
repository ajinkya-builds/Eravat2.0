/**
 * Android emulator certification — boot AVD, install staging APK, run CDP E2E.
 * Run: node scripts/emulator-certification.mjs [--skip-build] [--avd Eravat_E2E]
 */
import { spawn, execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(process.cwd());
const OUT = join(ROOT, '../Go live Prep - Staging/generated/emulator-certification');
mkdirSync(OUT, { recursive: true });
const SDK = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || `${process.env.HOME}/Library/Android/sdk`;
const ADB = `${SDK}/platform-tools/adb`;
const EMULATOR = `${SDK}/emulator/emulator`;
const PKG = 'com.forestdept.eravat';
const APK = join(ROOT, 'android/app/build/outputs/apk/debug/app-debug.apk');

const args = new Set(process.argv.slice(2));
const skipBuild = args.has('--skip-build');
const requestedAvd = process.argv.find((a, i) => process.argv[i - 1] === '--avd') || process.env.ERAVAT_AVD || 'Eravat_E2E';

function resolveAvd(preferred) {
  const avds = sh(`${EMULATOR} -list-avds`, { quiet: true }).split('\n').filter(Boolean);
  if (avds.includes(preferred)) return preferred;
  if (avds.length === 0) return null;
  console.warn(`AVD ${preferred} not found; falling back to ${avds[0]} (have: ${avds.join(', ')})`);
  return avds[0];
}

const avdName = resolveAvd(requestedAvd);

function sh(cmd, opts = {}) {
  const out = execSync(cmd, {
    encoding: 'utf8',
    stdio: opts.quiet ? ['pipe', 'pipe', 'pipe'] : 'inherit',
  });
  return (out ?? '').trim();
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function devices() {
  return sh(`${ADB} devices`, { quiet: true })
    .split('\n')
    .slice(1)
    .filter((l) => /\tdevice\b/.test(l));
}

function anyEmulator() {
  return sh(`${ADB} devices`, { quiet: true })
    .split('\n')
    .slice(1)
    .filter((l) => l.startsWith('emulator-'));
}

async function waitBoot(maxSec = 300) {
  for (let i = 0; i < maxSec / 4; i++) {
    const pending = anyEmulator();
    if (pending.some((l) => l.includes('unauthorized')) && i > 0 && i % 5 === 0) {
      console.log('adb unauthorized — reconnecting (no kill-server)…');
      try {
        sh(`${ADB} reconnect`, { quiet: true });
      } catch {
        /* ignore */
      }
    }
    const list = devices();
    if (list.length) {
      const serial = list[0].split('\t')[0];
      try {
        const boot = sh(`${ADB} -s ${serial} shell getprop sys.boot_completed`, { quiet: true }).replace(/\r/g, '');
        if (boot === '1') return serial;
      } catch {
        /* still booting */
      }
    }
    sleep(4000);
  }
  throw new Error('Emulator boot timeout');
}

let emuProc = null;

async function main() {
  mkdirSync(OUT, { recursive: true });
  const log = [];

  if (!existsSync(EMULATOR)) {
    log.push({ step: 'emulator', ok: false, detail: 'Android emulator not installed' });
    writeResults(log, false);
    process.exit(1);
  }

  if (!avdName) {
    log.push({ step: 'avd', ok: false, detail: 'No AVDs installed' });
    writeResults(log, false);
    process.exit(1);
  }

  const avds = sh(`${EMULATOR} -list-avds`, { quiet: true }).split('\n').filter(Boolean);
  if (!avds.includes(avdName)) {
    log.push({ step: 'avd', ok: false, detail: `${avdName} not found; have: ${avds.join(', ')}` });
    writeResults(log, false);
    process.exit(1);
  }

  if (!skipBuild) {
    console.log('Building staging web + Android debug APK…');
    sh('VITE_BASE_PATH=/ npx vite build --mode staging', { cwd: ROOT });
    sh('npx cap sync android', { cwd: ROOT });
    sh('./gradlew assembleDebug', { cwd: join(ROOT, 'android') });
  }

  if (!existsSync(APK)) {
    log.push({ step: 'apk', ok: false, detail: `Missing ${APK}` });
    writeResults(log, false);
    process.exit(1);
  }

  let serial = devices()[0]?.split('\t')[0];
  if (!serial) {
    console.log(`Starting ${avdName}…`);
    emuProc = spawn(EMULATOR, ['-avd', avdName, '-no-snapshot-save', '-no-boot-anim', '-gpu', 'auto'], {
      stdio: 'ignore',
      detached: true,
    });
    serial = await waitBoot();
  }
  log.push({ step: 'emulator boot', ok: true, detail: serial });

  sh(`${ADB} -s ${serial} install -r -t "${APK}"`);
  log.push({ step: 'apk install', ok: true });

  // Emulator often boots unauthorized/offline and shows location permission dialogs.
  try {
    sh(`${ADB} -s ${serial} shell svc wifi enable`, { quiet: true });
    sh(`${ADB} -s ${serial} shell svc data enable`, { quiet: true });
  } catch {
    /* best effort */
  }
  for (const perm of [
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.POST_NOTIFICATIONS',
    'android.permission.CAMERA',
  ]) {
    try {
      sh(`${ADB} -s ${serial} shell pm grant ${PKG} ${perm}`, { quiet: true });
    } catch {
      /* ignore */
    }
  }

  console.log('Running emulator Playwright E2E…');
  let e2eCode = 1;
  try {
    e2eCode = execSync('node scripts/emulator-e2e-playwright.mjs', { cwd: ROOT, stdio: 'inherit' });
  } catch (e) {
    e2eCode = e.status ?? 1;
  }
  log.push({ step: 'emulator-e2e-playwright', ok: e2eCode === 0, detail: `exit ${e2eCode}` });

  if (emuProc) {
    try {
      sh(`${ADB} -s ${serial} emu kill`, { quiet: true });
    } catch {
      /* ignore */
    }
  }

  writeResults(log, log.every((x) => x.ok));
  process.exit(log.every((x) => x.ok) ? 0 : 1);
}

function writeResults(log, ok) {
  writeFileSync(
    join(OUT, 'results.json'),
    JSON.stringify({ ranAt: new Date().toISOString(), ok, steps: log }, null, 2),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
