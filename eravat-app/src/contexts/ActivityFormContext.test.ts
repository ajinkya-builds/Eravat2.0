import { describe, expect, it } from 'vitest';
import { isDateTimeLocationComplete } from './ActivityFormContext';

describe('isDateTimeLocationComplete', () => {
  const valid = {
    activity_date: '2026-01-15',
    activity_time: '10:00',
    latitude: 24.154,
    longitude: 81.321,
  };

  it('allows GPS without division/range/beat', () => {
    expect(isDateTimeLocationComplete(valid)).toBe(true);
  });

  it('requires GPS coordinates', () => {
    expect(isDateTimeLocationComplete({ ...valid, latitude: null })).toBe(false);
    expect(isDateTimeLocationComplete({ ...valid, longitude: null })).toBe(false);
  });

  it('rejects coordinates outside WGS84', () => {
    expect(isDateTimeLocationComplete({ ...valid, latitude: 91 })).toBe(false);
    expect(isDateTimeLocationComplete({ ...valid, longitude: 181 })).toBe(false);
  });
});
