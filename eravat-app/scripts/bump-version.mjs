#!/usr/bin/env node
/**
 * Bump eravat-app/version.json, prepend CHANGELOG.md, sync generated files.
 *
 * Usage:
 *   npm run version:bump -- patch "Fix offline sync race"
 *   npm run version:bump -- minor "In-app updates" "Session persistence"
 *   npm run version:bump -- major "Breaking auth rewrite"
 *
 * Options:
 *   --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const versionPath = path.join(root, 'version.json');
const changelogPath = path.join(root, 'CHANGELOG.md');

const args = process.argv.slice(2).filter((a) => a !== '--dry-run');
const dryRun = process.argv.includes('--dry-run');
const bump = (args[0] || '').toLowerCase();
const changes = args.slice(1).map((c) => c.trim()).filter(Boolean);

if (!['major', 'minor', 'patch'].includes(bump)) {
  console.error('Usage: npm run version:bump -- <major|minor|patch> "change 1" ["change 2" ...]');
  process.exit(1);
}
if (changes.length === 0) {
  console.error('Provide at least one change description for this version.');
  process.exit(1);
}

const current = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
const [maj, min, pat] = String(current.versionName).split('.').map((n) => Number(n));
if (![maj, min, pat].every((n) => Number.isFinite(n))) {
  console.error('version.json versionName must be MAJOR.MINOR.PATCH');
  process.exit(1);
}

let nextMaj = maj;
let nextMin = min;
let nextPat = pat;
if (bump === 'major') {
  nextMaj += 1;
  nextMin = 0;
  nextPat = 0;
} else if (bump === 'minor') {
  nextMin += 1;
  nextPat = 0;
} else {
  nextPat += 1;
}

const versionName = `${nextMaj}.${nextMin}.${nextPat}`;
// versionCode: MMMNNPP (2.1.0 → 20100, 2.1.3 → 20103) — always increases with semver.
const versionCode = nextMaj * 10000 + nextMin * 100 + nextPat;
const releasedAt = new Date().toISOString().slice(0, 10);

if (versionCode <= Number(current.versionCode)) {
  console.error(
    `Computed versionCode ${versionCode} is not greater than current ${current.versionCode}. Adjust manually.`,
  );
  process.exit(1);
}

const next = {
  versionName,
  versionCode,
  channel: current.channel || 'staging',
  releasedAt,
  changes,
};

const section = [
  `## [${versionName}] — ${releasedAt} (versionCode ${versionCode})`,
  '',
  ...changes.map((c) => `- ${c}`),
  '',
  '---',
  '',
].join('\n');

let changelog = fs.existsSync(changelogPath)
  ? fs.readFileSync(changelogPath, 'utf8')
  : '# Eravat app changelog\n\n';

const anchor = '---\n\n';
const insertAt = changelog.indexOf(anchor);
if (insertAt === -1) {
  changelog = `${changelog.trimEnd()}\n\n${section}`;
} else {
  const pos = insertAt + anchor.length;
  changelog = `${changelog.slice(0, pos)}${section}${changelog.slice(pos)}`;
}

console.log(`Bump ${current.versionName} (${current.versionCode}) → ${versionName} (${versionCode})`);
for (const c of changes) console.log(`  - ${c}`);

if (dryRun) {
  console.log('(dry-run — no files written)');
  process.exit(0);
}

fs.writeFileSync(versionPath, `${JSON.stringify(next, null, 2)}\n`);
fs.writeFileSync(changelogPath, changelog);

const sync = spawnSync(process.execPath, [path.join(__dirname, 'sync-version.mjs')], {
  cwd: root,
  stdio: 'inherit',
});
if (sync.status !== 0) process.exit(sync.status ?? 1);

console.log('Updated version.json, CHANGELOG.md, version.meta.ts, package.json');
