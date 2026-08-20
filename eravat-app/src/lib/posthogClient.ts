import posthog from 'posthog-js';
import { Capacitor } from '@capacitor/core';
import { getAnalyticsConsent } from './analyticsConsent';

/** Prefer wizard env name; keep VITE_POSTHOG_KEY as alias. */
const KEY = (
  (import.meta.env.VITE_POSTHOG_PROJECT_TOKEN as string | undefined) ||
  (import.meta.env.VITE_POSTHOG_KEY as string | undefined) ||
  ''
).trim();
const HOST = (
  (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ||
  'https://us.i.posthog.com'
).trim();
const ENV_NAME =
  (import.meta.env.VITE_APP_ENV as string | undefined) ||
  (import.meta.env.DEV ? 'development' : 'production');

let initialized = false;
let identifiedUserId: string | null = null;

export function isPostHogConfigured(): boolean {
  return Boolean(KEY);
}

export function getAppEnv(): string {
  return ENV_NAME;
}

export function getPlatform(): 'android' | 'ios' | 'web' {
  const p = Capacitor.getPlatform();
  if (p === 'android' || p === 'ios') return p;
  return 'web';
}

/**
 * Init once at app boot. Safe no-op when key missing (local/dev without PostHog).
 * Does not throw — missing keys must not break field builds or local work.
 */
export function initPostHog(): void {
  if (initialized) return;
  if (!isPostHogConfigured()) {
    if (import.meta.env.DEV) {
      console.info(
        '[PostHog] Skipped init — set VITE_POSTHOG_PROJECT_TOKEN (or VITE_POSTHOG_KEY)'
      );
    }
    return;
  }

  posthog.init(KEY, {
    api_host: HOST,
    person_profiles: 'identified_only',
    // Manual screen tracking via ScreenAnalytics; still capture leave for session length
    capture_pageview: false,
    capture_pageleave: true,
    // Granular UI: clicks, form submits, changes
    autocapture: {
      dom_event_allowlist: ['click', 'submit', 'change'],
      element_allowlist: ['a', 'button', 'form', 'input', 'select', 'textarea', 'label'],
      css_selector_ignorelist: [
        '.ph-no-autocapture',
        '[data-ph-no-autocapture]',
        'input[type="password"]',
        'input[name*="pin" i]',
        'input[name*="otp" i]',
        'input[autocomplete="one-time-code"]',
        'input[inputmode="numeric"]',
      ],
      element_attribute_ignorelist: ['value', 'data-value'],
    },
    before_send: (event) => {
      if (!event) return event;
      const props = { ...event.properties };
      for (const k of Object.keys(props)) {
        // PostHog requires `token` (project key) on every event — never strip it.
        // Also leave $ system properties alone.
        if (k === 'token' || k.startsWith('$')) continue;
        const key = k.toLowerCase();
        if (
          key.includes('password') ||
          key.includes('pin') ||
          key.includes('otp') ||
          key.includes('token') ||
          key.includes('phone') ||
          key.includes('secret')
        ) {
          delete props[k];
        }
      }
      if (typeof props.$el_text === 'string' && props.$el_text.length > 80) {
        props.$el_text = `${props.$el_text.slice(0, 80)}…`;
      }
      event.properties = props;
      return event;
    },
    persistence: 'localStorage+cookie',
    loaded: (ph) => {
      if (!getAnalyticsConsent()) {
        ph.opt_out_capturing();
      }
    },
  });

  // Unhandled errors / promise rejections (wizard also enabled this)
  if (typeof posthog.startExceptionAutocapture === 'function') {
    posthog.startExceptionAutocapture();
  }

  posthog.register({
    app_env: ENV_NAME,
    app_version: import.meta.env.VITE_APP_VERSION || '2.0.0',
    platform: getPlatform(),
  });

  initialized = true;

  if (typeof window !== 'undefined') {
    (window as unknown as { posthog?: typeof posthog }).posthog = posthog;
  }
}

export function applyAnalyticsConsent(enabled: boolean): void {
  if (!initialized || !isPostHogConfigured()) return;
  if (enabled) {
    posthog.opt_in_capturing();
  } else {
    posthog.opt_out_capturing();
  }
}

export function identifyUser(
  userId: string,
  traits?: Record<string, string | number | boolean | null | undefined>
): void {
  if (!initialized || !isPostHogConfigured() || !getAnalyticsConsent()) return;

  if (identifiedUserId && identifiedUserId !== userId) {
    posthog.reset();
    identifiedUserId = null;
  }
  if (identifiedUserId === userId) return;

  const clean: Record<string, string | number | boolean> = {};
  if (traits) {
    for (const [k, v] of Object.entries(traits)) {
      if (v === undefined || v === null) continue;
      clean[k] = v;
    }
  }
  posthog.identify(userId, clean);
  identifiedUserId = userId;
}

export function resetUser(): void {
  if (!initialized || !isPostHogConfigured()) return;
  posthog.reset();
  identifiedUserId = null;
}

export function captureEvent(event: string, properties?: Record<string, unknown>): void {
  if (!initialized || !isPostHogConfigured() || !getAnalyticsConsent()) return;
  posthog.capture(event, properties);
}

export function captureException(error: unknown, additional?: Record<string, unknown>): void {
  if (!initialized || !isPostHogConfigured() || !getAnalyticsConsent()) return;
  const err = error instanceof Error ? error : new Error(String(error));
  if (
    typeof (posthog as { captureException?: (e: Error, p?: Record<string, unknown>) => void })
      .captureException === 'function'
  ) {
    (posthog as { captureException: (e: Error, p?: Record<string, unknown>) => void }).captureException(
      err,
      additional
    );
  } else {
    posthog.capture('$exception', {
      $exception_message: err.message,
      $exception_type: err.name,
      $exception_stack_trace_raw: err.stack,
      ...additional,
    });
  }
}

export { posthog };
