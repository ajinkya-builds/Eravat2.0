#!/usr/bin/env node
/**
 * Verify and install test tooling for full Eravat coverage.
 * Run: node scripts/setup-test-tooling.mjs [--install]
 */
import { execSync, spawnSync } from 'child_process';
import { existsSync, copyFileSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const ROOT = join(import.meta.dirname, '..');
const INSTALL = process.argv.includes('--install');
const checks = [];
const TOOLS = join(homedir(), '.local', 'bin');

function run(cmd, quiet = true) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: quiet ? ['pipe', 'pipe', 'pipe'] : 'inherit' }).trim();
  } catch (e) {
    return e.stdout?.toString()?.trim() || null;
  }
}

function record(name, ok, detail, fix = '') {
  checks.push({ name, ok, detail, fix });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok && fix) console.log(`  → ${fix}`);
}

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

function stagingServiceRoleFromCli() {
  const out = run('supabase projects api-keys --project-ref ttjtyvxfiqhjdngkgdkf');
  if (!out) return null;
  const line = out.split('\n').find((l) => /service_role/.test(l));
  if (!line) return null;
  const parts = line.split('|').map((s) => s.trim());
  return parts[1] || null;
}

function upsertEnvKey(file, key, value) {
  let txt = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const re = new RegExp(`^${key}=.*$`, 'm');
  const line = `${key}=${value}`;
  txt = re.test(txt) ? txt.replace(re, line) : `${txt.replace(/\n?$/, '\n')}${line}\n`;
  writeFileSync(file, txt);
}

// Output dirs used by certification scripts
for (const d of [
  '../Go live Prep - Staging/generated/maestro-certification',
  '../Go live Prep - Staging/generated/certification',
  '../Go live Prep - Staging/generated/setup-test-tooling.json',
].slice(0, 2)) {
  ensureDir(join(ROOT, d));
}
record('Certification output dirs', true, 'created if missing');

// Node / Playwright
record('Node.js', !!run('node -v'), run('node -v') || 'missing');
const pw = run('npx playwright --version');
record('Playwright', !!pw, pw || 'missing');
if (INSTALL && pw) {
  console.log('Installing Playwright Chromium…');
  spawnSync('npx', ['playwright', 'install', 'chromium'], { cwd: ROOT, stdio: 'inherit' });
}

// Android SDK
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || `${homedir()}/Library/Android/sdk`;
const adb = join(sdk, 'platform-tools/adb');
const emulator = join(sdk, 'emulator/emulator');
record('Android SDK', existsSync(adb), existsSync(adb) ? sdk : 'not found', 'Install Android Studio + SDK');
record('adb', existsSync(adb), existsSync(adb) ? 'ok' : 'missing');
record('emulator', existsSync(emulator), existsSync(emulator) ? 'ok' : 'missing');

const avds = existsSync(emulator) ? run(`"${emulator}" -list-avds`)?.split('\n').filter(Boolean) : [];
record('Android AVDs', avds.length > 0, avds.join(', ') || 'none', 'Create Eravat_E2E AVD in Android Studio');

// Maestro
const maestroBin = `${homedir()}/.maestro/bin/maestro`;
let maestro = run('maestro --version') || run(`"${maestroBin}" --version`);
if (!maestro && INSTALL) {
  console.log('Installing Maestro…');
  run('curl -Ls "https://get.maestro.mobile.dev" | bash', false);
  maestro = run(`"${maestroBin}" --version`);
}
record('Maestro', !!maestro, maestro || 'missing', 'node scripts/setup-test-tooling.mjs --install');

// Supabase CLI
record('Supabase CLI', !!run('supabase --version'), run('supabase --version') || 'optional');

// Staging env
const stagingEnv = join(ROOT, '.env.staging.local');
const example = join(ROOT, '.env.staging.local.example');
if (!existsSync(stagingEnv) && existsSync(example)) {
  copyFileSync(example, stagingEnv);
  record('.env.staging.local', false, 'created from example — fill in keys', 'Edit eravat-app/.env.staging.local');
} else {
  const hasUrl = existsSync(stagingEnv) && readFileSync(stagingEnv, 'utf8').includes('ttjtyvxfiqhjdngkgdkf');
  record('.env.staging.local', hasUrl, hasUrl ? 'staging URL present' : 'missing or incomplete');
}

// Service role — auto-fetch from Supabase CLI when installing
let hasStagingSvc = false;
if (existsSync(stagingEnv)) {
  const txt = readFileSync(stagingEnv, 'utf8');
  hasStagingSvc = /SUPABASE_SERVICE_ROLE_KEY=sb_/.test(txt) || /SUPABASE_SERVICE_ROLE_KEY=eyJ/.test(txt);
}
if (!hasStagingSvc && INSTALL) {
  const key = stagingServiceRoleFromCli();
  if (key) {
    upsertEnvKey(stagingEnv, 'SUPABASE_SERVICE_ROLE_KEY', key);
    hasStagingSvc = true;
    console.log('✓ Staging service role key — fetched via Supabase CLI → .env.staging.local');
  }
}
record(
  'Staging service role key',
  hasStagingSvc,
  hasStagingSvc ? 'in .env.staging.local' : 'missing from .env.staging.local',
  'node scripts/setup-test-tooling.mjs --install  (or Supabase Dashboard → ttjtyvxfiqhjdngkgdkf → API)',
);

// FCM / Push
const gservices = join(ROOT, 'android/app/google-services.json');
record(
  'google-services.json (FCM)',
  existsSync(gservices),
  existsSync(gservices) ? 'push enabled in APK' : 'missing — push disabled in builds',
  'See docs/testing/FCM_AND_DEVICE_SETUP.md — download from Firebase console',
);

// APK
const apk = join(ROOT, 'android/app/build/outputs/apk/debug/app-debug.apk');
record('Staging debug APK', existsSync(apk), existsSync(apk) ? 'built' : 'not built', 'npm run build:android:staging && cd android && ./gradlew assembleDebug');

// UAT manifest
const manifest = join(ROOT, '../Go live Prep - Staging/generated/uat-testers/uat-testers-otp-manifest.json');
record('UAT OTP manifest', existsSync(manifest), existsSync(manifest) ? 'ok' : 'run seed-uat-testers-from-sheet.mjs');

// Maestro flows
const flows = join(ROOT, 'maestro/flows/login-beat-guard.yaml');
record('Maestro flows', existsSync(flows), existsSync(flows) ? '4 flows' : 'missing');

// scrcpy — install to ~/.local/bin when brew unavailable
let scrcpy = run('which scrcpy') || (existsSync(join(TOOLS, 'scrcpy')) ? join(TOOLS, 'scrcpy') : null);
if (!scrcpy && INSTALL && existsSync(adb)) {
  ensureDir(TOOLS);
  const arch = run('uname -m');
  const tag = run('curl -fsSL https://api.github.com/repos/Genymobile/scrcpy/releases/latest | node -pe "JSON.parse(require(\'fs\').readFileSync(0)).tag_name"') || 'v4.1';
  const asset = arch === 'arm64' ? `scrcpy-macos-aarch64-${tag}.tar.gz` : `scrcpy-macos-x86_64-${tag}.tar.gz`;
  const url = `https://github.com/Genymobile/scrcpy/releases/download/${tag}/${asset}`;
  const tgz = join(TOOLS, asset);
  console.log(`Downloading scrcpy (${asset})…`);
  if (!existsSync(join(TOOLS, 'scrcpy'))) {
    try {
      run(`curl -fsSL "${url}" -o "${tgz}"`, false);
      run(`tar -xzf "${tgz}" -C "${TOOLS}"`, false);
      const bin = run(`find "${TOOLS}" -maxdepth 3 -name scrcpy -type f 2>/dev/null`)?.split('\n').find(Boolean);
      if (bin) {
        run(`cp "${bin}" "${join(TOOLS, 'scrcpy')}"`);
        chmodSync(join(TOOLS, 'scrcpy'), 0o755);
      }
    } catch {
      console.log('  scrcpy download skipped (optional)');
    }
  }
  scrcpy = existsSync(join(TOOLS, 'scrcpy')) ? join(TOOLS, 'scrcpy') : null;
}
record(
  'scrcpy (optional visual)',
  !!scrcpy,
  scrcpy ? scrcpy : 'not installed',
  'node scripts/setup-test-tooling.mjs --install',
);

const ok = checks.filter((c) => c.ok).length;
const out = join(ROOT, '../Go live Prep - Staging/generated/setup-test-tooling.json');
writeFileSync(out, JSON.stringify({ checkedAt: new Date().toISOString(), installMode: INSTALL, ok: ok === checks.length, checks }, null, 2));
console.log(`\n${ok}/${checks.length} tooling checks passed`);
console.log(`Report → ${out}`);

const blockers = checks.filter((c) => !c.ok && /UAT OTP manifest/.test(c.name));
process.exit(blockers.length === 0 ? 0 : 1);
