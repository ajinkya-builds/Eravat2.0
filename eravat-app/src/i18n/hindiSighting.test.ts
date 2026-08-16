import { describe, expect, it } from 'vitest';
import translations from './translations';

const SIGHTING_KEYS = [
  'dashboard.reportAction',
  'continue_btn',
  'dtl_division',
  'dtl_range',
  'dtl_beat',
  'dtl_get_location',
  'dtl_auto_locked',
  'ot_direct_sighting',
  'ot_indirect_sign',
  'ot_description',
  'it_pugmark',
  'it_dung',
  'share.share',
  'nearby.noneWithin',
];

describe('ERV-051 Hindi add-sighting vocabulary', () => {
  it('has Hindi values for every sighting-related key', () => {
    for (const key of SIGHTING_KEYS) {
      const hi = translations.hi[key];
      const en = translations.en[key];
      expect(hi, key).toBeTruthy();
      expect(hi).not.toBe(en);
      expect(hi).toMatch(/[\u0900-\u097F]/);
    }
  });

  it('uses field-review Hindi for Add Sighting and forest units', () => {
    expect(translations.hi['dashboard.reportAction']).toContain('\u0938\u093e\u0907\u091f\u093f\u0902\u0917');
    expect(translations.hi.dtl_division).toBe('\u0935\u0928 \u092e\u0902\u0921\u0932');
    expect(translations.hi.dtl_beat).toBe('\u092c\u0940\u091f');
  });

  it('English and Hindi dicts have the same key count', () => {
    expect(Object.keys(translations.hi).sort()).toEqual(Object.keys(translations.en).sort());
  });
});
