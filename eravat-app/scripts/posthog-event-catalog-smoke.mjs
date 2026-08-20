/**
 * Fires every curated PostHog event name once (plus ui.* helpers) via the live app.
 * Prereq: staging Vite on 127.0.0.1:5173 with PostHog configured.
 *
 * Usage: node scripts/posthog-event-catalog-smoke.mjs
 */
import { chromium } from '@playwright/test';

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:5173';
const PHONE = process.env.SMOKE_PHONE || '8889184712';
const OTP = process.env.SMOKE_OTP || '123456';

/** Every product event we expect ingest for (curated + ui helpers). */
const CATALOG = [
  // auth
  'auth.login_opened',
  'auth.phone_submitted',
  'auth.unenrolled_rejected',
  'auth.otp_sent',
  'auth.otp_failed',
  'auth.otp_verified',
  'auth.pin_setup_started',
  'auth.pin_setup_completed',
  'auth.pin_unlock_succeeded',
  'auth.pin_unlock_failed',
  // app / network / sync
  'app.screen_viewed',
  'network.went_offline',
  'network.came_online',
  'sync.started',
  'sync.completed',
  'sync.failed',
  'sync.media_failed',
  // report
  'report.wizard_opened',
  'report.step_viewed',
  'report.save_started',
  'report.save_succeeded',
  'report.save_failed',
  'activity_report_submitted',
  // ui granularity
  'ui.click',
  'ui.filter_changed',
  'ui.action_failed',
  // misc product
  'sos_sighting_submitted',
  'volunteer_onboarded',
  'profile_updated',
  'notification_marked_read',
  'notifications_marked_read',
  'privacy.analytics_opt_in',
  // exceptions
  '$exception',
  // probe
  'debug.event_catalog_smoke',
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const consoleLogs = [];
  page.on('console', (m) => {
    const t = m.text();
    if (/posthog|PostHog|token.*dropped|beforeSend/i.test(t)) consoleLogs.push(t.slice(0, 200));
  });

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);

  // Best-effort login (staging test OTP)
  try {
    const phone = page.locator('input[type="tel"], input[inputmode="tel"], input[name*="phone" i]').first();
    if (await phone.count()) {
      await phone.fill(PHONE);
      const send = page.getByRole('button', { name: /send|otp|continue|verify/i }).first();
      if (await send.count()) await send.click();
      await page.waitForTimeout(1200);
      const otp = page.locator('input[autocomplete="one-time-code"], input[name*="otp" i], input[inputmode="numeric"]').first();
      if (await otp.count()) {
        await otp.fill(OTP);
        const verify = page.getByRole('button', { name: /verify|continue|sign/i }).first();
        if (await verify.count()) await verify.click();
        await page.waitForTimeout(2500);
      }
    }
  } catch (e) {
    console.warn('login flow skipped/failed:', e.message);
  }

  const result = await page.evaluate(async (events) => {
    const ph = window.posthog;
    if (!ph) return { ok: false, error: 'posthog missing' };
    const warns = [];
    const orig = console.warn;
    console.warn = (...a) => {
      const s = a.map(String).join(' ');
      if (/dropped|beforeSend|token/i.test(s)) warns.push(s.slice(0, 180));
      return orig.apply(console, a);
    };

    const fired = [];
    for (const event of events) {
      const opts = { send_instantly: true };
      if (event === '$exception') {
        if (typeof ph.captureException === 'function') {
          ph.captureException(new Error('catalog_smoke_exception'), { source: 'event_catalog_smoke' });
        } else {
          ph.capture(
            '$exception',
            {
              $exception_message: 'catalog_smoke_exception',
              $exception_type: 'Error',
              source: 'event_catalog_smoke',
            },
            opts
          );
        }
      } else if (event === 'ui.click') {
        ph.capture(event, { action: 'catalog.smoke_click', screen: 'smoke', source: 'event_catalog_smoke' }, opts);
      } else if (event === 'ui.filter_changed') {
        ph.capture(event, { filter: 'catalog.smoke_filter', value: 'direct', screen: 'smoke', source: 'event_catalog_smoke' }, opts);
      } else if (event === 'ui.action_failed') {
        ph.capture(event, { action: 'catalog.smoke_action', error_code: 'smoke_fail', screen: 'smoke', source: 'event_catalog_smoke' }, opts);
      } else if (event === 'app.screen_viewed') {
        ph.capture(event, { screen: 'smoke_catalog', path: '/smoke', source: 'event_catalog_smoke' }, opts);
      } else {
        ph.capture(event, { source: 'event_catalog_smoke', catalog: true }, opts);
      }
      fired.push(event);
    }

    // Real UI gestures for autocapture + map filters if logged in
    try {
      document.querySelector('[data-ph-action="nav.map"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    } catch { /* ignore */ }

    await new Promise((r) => setTimeout(r, 4000));
    console.warn = orig;

    const resources = performance
      .getEntriesByType('resource')
      .filter((e) => String(e.name).includes('/i/v0/e/') || String(e.name).includes('/batch/'))
      .map((e) => ({ url: e.name.slice(0, 80), status: e.responseStatus }));

    return {
      ok: true,
      opted_out: ph.has_opted_out_capturing?.(),
      distinct_id: ph.get_distinct_id?.(),
      fired_count: fired.length,
      fired,
      warns,
      ingest_ok: resources.some((r) => r.status === 200 || r.status === 0),
      ingest_samples: resources.slice(-8),
    };
  }, CATALOG);

  // Navigate map/home for live ui.* if session exists
  try {
    await page.goto(`${BASE}/map`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: /direct/i }).first().click({ timeout: 3000 }).catch(() => {});
    await page.getByRole('button', { name: /Home|Dashboard/i }).first().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(1500);
  } catch { /* ignore */ }

  await page.evaluate(() => {
    window.posthog?.capture('debug.event_catalog_smoke', { phase: 'done', source: 'event_catalog_smoke' }, { send_instantly: true });
  });
  await page.waitForTimeout(3000);

  console.log(JSON.stringify({ result, consoleLogs: consoleLogs.slice(-20) }, null, 2));
  await browser.close();

  if (!result?.ok || result.opted_out || (result.warns && result.warns.length)) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
