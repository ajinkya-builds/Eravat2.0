#!/usr/bin/env node
/**
 * Sync eravat-app/version.json → src/version.meta.ts and package.json version.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const versionPath = path.join(root, 'version.json');
const metaPath = path.join(root, 'src/version.meta.ts');
const pkgPath = path.join(root, 'package.json');

const version = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
const changes = Array.isArray(version.changes) ? version.changes : [];

const meta = `/** AUTO-GENERATED from ../version.json — run \`npm run version:bump\` or \`npm run version:sync\`. Do not edit by hand. */
export const APP_VERSION_META = {
  versionName: ${JSON.stringify(version.versionName)},
  versionCode: ${Number(version.versionCode)},
  channel: ${JSON.stringify(version.channel || 'staging')},
  releasedAt: ${JSON.stringify(version.releasedAt || '')},
  changes: ${JSON.stringify(changes, null, 2).replace(/\n/g, '\n  ')},
} as const;
`;

fs.writeFileSync(metaPath, meta);

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.version = version.versionName;
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

console.log(`Synced version ${version.versionName} (${version.versionCode}) → src/version.meta.ts + package.json`);
