#!/usr/bin/env node
/**
 * Staging web + Capacitor sync using version.json for VITE_APP_VERSION*.
 * APK assemble is separate (`./gradlew assembleDebug -PversionCode=...`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8'));

const env = {
  ...process.env,
  VITE_BASE_PATH: '/',
  VITE_APP_ENV: process.env.VITE_APP_ENV || 'staging',
  VITE_APP_VERSION: String(version.versionName),
  VITE_APP_VERSION_CODE: String(version.versionCode),
  VITE_UPDATE_MANIFEST_URL:
    process.env.VITE_UPDATE_MANIFEST_URL ||
    'https://ttjtyvxfiqhjdngkgdkf.supabase.co/storage/v1/object/public/app-updates/staging/latest.json',
};

function run(cmd, args) {
  const res = spawnSync(cmd, args, { cwd: root, env, stdio: 'inherit', shell: process.platform === 'win32' });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

console.log(`Building staging web ${version.versionName} (${version.versionCode})…`);
run('npx', ['vite', 'build', '--mode', 'staging']);
run('npx', ['cap', 'sync', 'android']);
console.log('Done. Assemble APK with:');
console.log(
  `  cd android && ./gradlew assembleDebug -PversionCode=${version.versionCode} -PversionName=${version.versionName}`,
);
