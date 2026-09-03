import { describe, it, expect } from 'vitest';
import { APP_VERSION, formatAppVersionLabel } from '../appVersion';
import { APP_VERSION_META } from '../../version.meta';

describe('appVersion', () => {
  it('exposes the synced version.json meta', () => {
    expect(APP_VERSION.versionName).toBe(APP_VERSION_META.versionName);
    expect(APP_VERSION.versionCode).toBe(APP_VERSION_META.versionCode);
    expect(APP_VERSION.versionCode).toBeGreaterThanOrEqual(20100);
    expect(APP_VERSION.changes.length).toBeGreaterThan(0);
  });

  it('formats label with versionCode', () => {
    expect(formatAppVersionLabel()).toBe(
      `${APP_VERSION_META.versionName} (${APP_VERSION_META.versionCode})`,
    );
  });
});
