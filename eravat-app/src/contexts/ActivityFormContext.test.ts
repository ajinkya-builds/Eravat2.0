import { describe, expect, it } from 'vitest';
import { getActiveSteps, isDateTimeLocationComplete } from './ActivityFormContext';

describe('getActiveSteps', () => {
  it('starts with photo, then observation, location, review', () => {
    expect(getActiveSteps({ observation_type: null, report_damage_manually: false })).toEqual([
      'photo',
      'observationType',
      'dateTimeLocation',
      'review',
    ]);
  });

  it('inserts damage after observation when requested', () => {
    expect(getActiveSteps({ observation_type: 'direct', report_damage_manually: true })).toEqual([
      'photo',
      'observationType',
      'damage',
      'dateTimeLocation',
      'review',
    ]);
  });

  it('does not include a compass step', () => {
    expect(getActiveSteps({ observation_type: 'direct', report_damage_manually: false })).toEqual([
      'photo',
      'observationType',
      'dateTimeLocation',
      'review',
    ]);
  });
});

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
