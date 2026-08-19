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
const avdName = process.argv.find((a, i) => process.argv[i - 1] === '--avd') || 'Eravat_E2E';

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
    .filter((l) => l.includes('device') && !l.includes('devices'));
}

async function waitBoot(maxSec = 180) {
  for (let i = 0; i < maxSec / 4; i++) {
    const list = devices();
    if (list.length) {
      const serial = list[0].split('\t')[0];
      const boot = sh(`${ADB} -s ${serial} shell getprop sys.boot_completed`, { quiet: true }).replace(/\r/g, '');
      if (boot === '1') return serial;
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
    emuProc = spawn(EMULATOR, ['-avd', avdName, '-no-snapshot-save', '-no-boot-anim', '-gpu', 'swiftshader_indirect'], {
      stdio: 'ignore',
      detached: true,
    });
    serial = await waitBoot();
  }
  log.push({ step: 'emulator boot', ok: true, detail: serial });

  sh(`${ADB} -s ${serial} install -r -t "${APK}"`);
  log.push({ step: 'apk install', ok: true });

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
