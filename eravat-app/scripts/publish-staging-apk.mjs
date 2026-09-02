#!/usr/bin/env node
/**
 * Upload staging APK + latest.json to Supabase Storage bucket `app-updates`.
 *
 * Env:
 *   STAGE_SUPABASE_URL or VITE_SUPABASE_URL
 *   STAGE_SUPABASE_SERVICE_ROLE (required — service role key, never ship in the app)
 *   APK_PATH (default: android debug APK path)
 *   VERSION_CODE, VERSION_NAME, RELEASE_NOTES (optional — defaults from version.json)
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const versionFile = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8'));

const url = (process.env.STAGE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const serviceKey = process.env.STAGE_SUPABASE_SERVICE_ROLE || '';
const versionCode = Number(process.env.VERSION_CODE || versionFile.versionCode || '0');
const versionName = process.env.VERSION_NAME || versionFile.versionName || `2.0.${versionCode || '0'}`;
const changes = Array.isArray(versionFile.changes) ? versionFile.changes : [];
const notes =
  process.env.RELEASE_NOTES ||
  (changes.length ? changes.map((c) => `• ${c}`).join('\n') : `Staging build ${versionName}`);
const apkPath =
  process.env.APK_PATH ||
  path.resolve(process.cwd(), 'android/app/build/outputs/apk/debug/app-debug.apk');

if (!url || !serviceKey) {
  console.error('Missing STAGE_SUPABASE_URL / VITE_SUPABASE_URL or STAGE_SUPABASE_SERVICE_ROLE');
  process.exit(1);
}
if (!versionCode || !Number.isFinite(versionCode)) {
  console.error('VERSION_CODE / version.json.versionCode required');
  process.exit(1);
}
if (!fs.existsSync(apkPath)) {
  console.error('APK not found:', apkPath);
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const apkObject = 'staging/eravat-staging.apk';
const manifestObject = 'staging/latest.json';
const historyObject = `staging/history/${versionName}.json`;
const apkBytes = fs.readFileSync(apkPath);

console.log(`Uploading ${apkPath} (${apkBytes.length} bytes) as ${apkObject}…`);
const { error: apkErr } = await supabase.storage.from('app-updates').upload(apkObject, apkBytes, {
  contentType: 'application/vnd.android.package-archive',
  upsert: true,
});
if (apkErr) {
  console.error('APK upload failed:', apkErr.message);
  process.exit(1);
}

const { data: pub } = supabase.storage.from('app-updates').getPublicUrl(apkObject);
const manifest = {
  versionCode,
  versionName,
  apkUrl: pub.publicUrl,
  releasedAt: new Date().toISOString(),
  channel: versionFile.channel || 'staging',
  notes,
  changes,
};

for (const objectPath of [manifestObject, historyObject]) {
  const { error: manErr } = await supabase.storage
    .from('app-updates')
    .upload(objectPath, JSON.stringify(manifest, null, 2), {
      contentType: 'application/json',
      upsert: true,
    });
  if (manErr) {
    console.error(`Manifest upload failed (${objectPath}):`, manErr.message);
    process.exit(1);
  }
}

const { data: manPub } = supabase.storage.from('app-updates').getPublicUrl(manifestObject);
console.log('Published staging update:');
console.log('  manifest:', manPub.publicUrl);
console.log('  apk:', pub.publicUrl);
console.log('  version:', versionName, `(${versionCode})`);
console.log('  changes:', changes.length);
