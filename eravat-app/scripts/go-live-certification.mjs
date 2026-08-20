/**
 * Go-live certification orchestrator — runs the full staging validation suite.
 *
 * Usage:
 *   node scripts/go-live-certification.mjs              # full run (build + preview + all suites)
 *   node scripts/go-live-certification.mjs --skip-build   # preview must already be on :4173
 *   node scripts/go-live-certification.mjs --quick        # auth + notifications + core e2e only
 *
 * Results: Go live Prep - Staging/generated/certification/report.json
 */
import { spawn, execSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import http from 'http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(__dirname, '../../Go live Prep - Staging/generated/certification');
const PREVIEW_PORT = 4173;
const PREVIEW_URL = `http://127.0.0.1:${PREVIEW_PORT}`;

const args = new Set(process.argv.slice(2));
const skipBuild = args.has('--skip-build');
const quick = args.has('--quick');
const withEmulator = args.has('--emulator');

const SUITES_FULL = [
  { id: 'verify-uat-otp', script: 'verify-uat-otp-login.mjs', needsPreview: false },
  { id: 'notification-alerts', script: 'staging-notification-alerts-e2e.mjs', needsPreview: false },
  { id: 'prod-readiness-pipeline', script: 'prod-readiness-pipeline.mjs', needsPreview: false },
  { id: 'staging-e2e', script: 'staging-e2e-playwright.mjs', needsPreview: true },
  { id: 'role-matrix', script: 'staging-role-matrix-e2e.mjs', needsPreview: true },
  { id: 'deep-journeys', script: 'staging-deep-journeys-e2e.mjs', needsPreview: true },
  { id: 'prod-readiness-ui', script: 'prod-readiness-e2e.mjs', needsPreview: true },
  { id: 'review-feedback', script: 'review-feedback-e2e.mjs', needsPreview: true },
  { id: 'perf-smoke', script: 'staging-perf-full-smoke.mjs', needsPreview: true },
  { id: 'load-50', script: 'staging-load-50.mjs', needsPreview: false },
];

const SUITES_QUICK = SUITES_FULL.filter((s) =>
  ['verify-uat-otp', 'notification-alerts', 'prod-readiness-pipeline', 'staging-e2e', 'role-matrix'].includes(s.id),
);

const suites = quick ? SUITES_QUICK : SUITES_FULL;

function waitForUrl(url, timeoutMs = 120000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      http
        .get(url, (res) => {
          res.resume();
          if (res.statusCode && res.statusCode < 500) resolve(true);
          else if (Date.now() - start > timeoutMs) reject(new Error(`Timeout waiting for ${url}`));
          else setTimeout(tick, 800);
        })
        .on('error', () => {
          if (Date.now() - start > timeoutMs) reject(new Error(`Timeout waiting for ${url}`));
          else setTimeout(tick, 800);
        });
    };
    tick();
  });
}

function runNode(script) {
  return new Promise((resolve) => {
    const child = spawn('node', [`scripts/${script}`], {
      cwd: ROOT,
      env: { ...process.env, E2E_BASE: PREVIEW_URL },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += d;
      process.stdout.write(d);
    });
    child.stderr.on('data', (d) => {
      stderr += d;
      process.stderr.write(d);
    });
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

function readSuiteResults(id) {
  const paths = {
    'verify-uat-otp': null,
    'notification-alerts': join(OUT, '../notification-alerts-e2e/results.json'),
    'prod-readiness-pipeline': join(OUT, '../prod-readiness-e2e/pipeline.json'),
    'staging-e2e': join(OUT, '../e2e-playwright/results.json'),
    'role-matrix': join(OUT, '../e2e-role-matrix/results.json'),
    'deep-journeys': join(OUT, '../deep-journeys-e2e/results.json'),
    'prod-readiness-ui': join(OUT, '../prod-readiness-e2e/results.json'),
    'review-feedback': join(OUT, '../review-feedback-e2e/results.json'),
    'perf-smoke': join(OUT, '../e2e-perf-full/results.json'),
    'load-50': join(OUT, '../load-50/results.json'),
    'emulator-certification': join(OUT, '../emulator-certification/results.json'),
    'maestro-certification': join(OUT, '../maestro-certification/results.json'),
  };
  const p = paths[id];
  if (!p || !existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

let previewProc = null;

async function main() {
  mkdirSync(OUT, { recursive: true });
  const startedAt = new Date().toISOString();
  console.log(`\n=== Eravat Go-Live Certification (${quick ? 'quick' : 'full'}) ===\n`);

  if (!skipBuild) {
    console.log('Building staging bundle…');
    execSync('VITE_BASE_PATH=/ npx vite build --mode staging', { cwd: ROOT, stdio: 'inherit' });
  }

  const needsPreview = suites.some((s) => s.needsPreview);
  if (needsPreview) {
    let up = false;
    try {
      await waitForUrl(PREVIEW_URL, 3000);
      up = true;
      console.log(`Preview already running at ${PREVIEW_URL}`);
    } catch {
      /* start preview */
    }
    if (!up) {
      console.log(`Starting preview on ${PREVIEW_URL}…`);
      previewProc = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort', '--host', '127.0.0.1'], {
        cwd: ROOT,
        env: { ...process.env, VITE_BASE_PATH: '/' },
        stdio: 'ignore',
        detached: false,
      });
      await waitForUrl(PREVIEW_URL);
    }
  }

  const suiteResults = [];

  for (const suite of suites) {
    console.log(`\n--- ${suite.id} ---`);
    const run = await runNode(suite.script);
    const artifact = readSuiteResults(suite.id);
    suiteResults.push({
      id: suite.id,
      exitCode: run.code,
      ok: run.code === 0,
      artifact,
    });
  }

  if (withEmulator) {
    console.log('\n--- emulator-certification ---');
    const run = await runNode('emulator-certification.mjs');
    suiteResults.push({
      id: 'emulator-certification',
      exitCode: run.code,
      ok: run.code === 0,
      artifact: readSuiteResults('emulator-certification'),
    });
    console.log('\n--- maestro-certification ---');
    const maestro = await runNode('maestro-certification.mjs');
    suiteResults.push({
      id: 'maestro-certification',
      exitCode: maestro.code,
      ok: maestro.code === 0,
      artifact: readSuiteResults('maestro-certification'),
    });
  }

  if (previewProc) previewProc.kill();

  const passed = suiteResults.filter((s) => s.ok).length;
  const report = {
    startedAt,
    finishedAt: new Date().toISOString(),
    environment: 'staging',
    previewUrl: PREVIEW_URL,
    stagingWeb: 'https://eravat.netlify.app',
    stagingSupabase: 'ttjtyvxfiqhjdngkgdkf',
    mode: quick ? 'quick' : withEmulator ? 'full+emulator' : 'full',
    suites: suiteResults,
    summary: {
      total: suiteResults.length,
      passed,
      failed: suiteResults.length - passed,
      certified: passed === suiteResults.length,
    },
  };

  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  writeFileSync(
    join(OUT, 'report.md'),
    [
      `# Go-Live Certification — ${report.finishedAt.slice(0, 10)}`,
      '',
      `**Environment:** Staging (${report.stagingWeb})`,
      `**Mode:** ${report.mode}`,
      `**Result:** ${report.summary.certified ? '✅ CERTIFIED' : '❌ NOT CERTIFIED'} (${passed}/${suiteResults.length} suites)`,
      '',
      '| Suite | Status |',
      '|-------|--------|',
      ...suiteResults.map((s) => `| ${s.id} | ${s.ok ? 'PASS' : 'FAIL'} |`),
      '',
      'Re-run: `cd eravat-app && node scripts/go-live-certification.mjs`',
    ].join('\n'),
  );

  console.log(`\n=== ${report.summary.certified ? 'CERTIFIED' : 'NOT CERTIFIED'}: ${passed}/${suiteResults.length} suites ===`);
  console.log(`Report → ${join(OUT, 'report.json')}`);
  process.exit(report.summary.certified ? 0 : 1);
}

main().catch((e) => {
  if (previewProc) previewProc.kill();
  console.error(e);
  process.exit(1);
});
