import { describe, it, expect } from 'vitest';
import { APP_VERSION, formatAppVersionLabel } from '../appVersion';

describe('appVersion', () => {
  it('exposes starting tracked release 2.1.0', () => {
    expect(APP_VERSION.versionName).toBe('2.1.0');
    expect(APP_VERSION.versionCode).toBe(20100);
    expect(APP_VERSION.changes.length).toBeGreaterThan(0);
  });

  it('formats label with versionCode', () => {
    expect(formatAppVersionLabel()).toBe('2.1.0 (20100)');
  });
});
