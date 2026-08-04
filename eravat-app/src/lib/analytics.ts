import { captureEvent, getAppEnv, getPlatform } from './posthogClient';

export type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;

/**
 * Product analytics — curated events only (see docs/OBSERVABILITY_AND_ANALYTICS.md).
 * Never pass OTP, PIN, tokens, full phone numbers, or report media/text.
 */
export function track(event: string, properties?: AnalyticsProps): void {
  const cleaned: Record<string, string | number | boolean> = {
    app_env: getAppEnv(),
    platform: getPlatform(),
  };
  if (properties) {
    for (const [k, v] of Object.entries(properties)) {
      if (v === undefined || v === null) continue;
      cleaned[k] = v;
    }
  }
  captureEvent(event, cleaned);
}

/** Named UI control click (nav, CTA, toolbar). Prefer over relying only on $autocapture. */
export function trackClick(action: string, properties?: AnalyticsProps): void {
  track('ui.click', { action, ...properties });
}

/**
 * Filter / toggle / select change.
 * `filter` = stable id (e.g. map.pin_type); `value` = selected value (enums/ids/dates — no free text).
 */
export function trackFilter(
  filter: string,
  value: string | number | boolean,
  properties?: AnalyticsProps
): void {
  const normalized =
    typeof value === 'string' ? value.slice(0, 80) : value;
  track('ui.filter_changed', { filter, value: normalized, ...properties });
}

/** Failure tied to a named action/filter (same `action` as trackClick / trackFilter when possible). */
export function trackFailed(
  action: string,
  errorCode: string,
  properties?: AnalyticsProps
): void {
  track('ui.action_failed', { action, error_code: errorCode, ...properties });
}

/** Route → stable screen name for funnels */
export function trackScreen(pathname: string): void {
  const screen = pathnameToScreen(pathname);
  track('app.screen_viewed', { screen, path: pathname });
}

function pathnameToScreen(pathname: string): string {
  if (pathname === '/' || pathname === '') return 'dashboard';
  if (pathname.startsWith('/admin')) {
    const rest = pathname.replace(/^\/admin\/?/, '') || 'home';
    return `admin.${rest.replace(/\//g, '.')}`;
  }
  return pathname.replace(/^\//, '').replace(/\//g, '.') || 'dashboard';
}
