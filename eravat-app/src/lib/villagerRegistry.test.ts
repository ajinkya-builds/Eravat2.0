import { describe, expect, it } from 'vitest';
import {
  csvEscape,
  emptyVillagerForm,
  isUuid,
  nestedName,
  onboarderLabel,
  validateVillagerForm,
  villageNameOf,
  villagerToCsvRow,
} from './villagerRegistry';

describe('villagerRegistry', () => {
  it('does not seed onboarder beat into empty form (Review 3 §7)', () => {
    const form = emptyVillagerForm({
      division_id: 'div-guard',
      range_id: 'rng-guard',
      beat_id: 'beat-guard',
    });
    expect(form.territory).toEqual({
      division_id: null,
      range_id: null,
      beat_id: null,
    });
  });

  it('requires name, phone, and village', () => {
    const result = validateVillagerForm({
      name: ' ',
      phone: '9876543210',
      villageName: 'Pali',
      location: { latitude: 23.7, longitude: 80.9 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorKey).toBe('hathiMitra.onboardRequired');
  });

  it('rejects invalid phone numbers', () => {
    const result = validateVillagerForm({
      name: 'Sita Devi',
      phone: '123',
      villageName: 'Pali',
      location: { latitude: 23.7, longitude: 80.9 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorKey).toBe('hathiMitra.invalidPhone');
  });

  it('accepts pasted +91 mobiles and rejects non-mobile series', () => {
    const ok = validateVillagerForm({
      name: 'Sita Devi',
      phone: '+91 98765 43210',
      villageName: 'Pali',
      location: { latitude: 23.7, longitude: 80.9 },
    });
    expect(ok).toEqual({ ok: true, mobile: '+919876543210' });

    const bad = validateVillagerForm({
      name: 'Sita Devi',
      phone: '1234567890',
      villageName: 'Pali',
      location: { latitude: 23.7, longitude: 80.9 },
    });
    expect(bad.ok).toBe(false);
  });

  it('requires GPS', () => {
    const result = validateVillagerForm({
      name: 'Sita Devi',
      phone: '9876543210',
      villageName: 'Pali',
      location: { latitude: null, longitude: 80.9 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorKey).toBe('hathiMitra.onboardGpsRequired');
  });

  it('normalizes a valid Indian mobile to E.164', () => {
    const result = validateVillagerForm({
      name: 'Sita Devi',
      phone: '9876543210',
      villageName: 'Pali',
      location: { latitude: 23.7, longitude: 80.9 },
    });
    expect(result).toEqual({ ok: true, mobile: '+919876543210' });
  });

  it('reads nested village names from object or array joins', () => {
    expect(villageNameOf({ villages: { name: 'Pali' } })).toBe('Pali');
    expect(villageNameOf({ villages: [{ name: 'Pali' }] })).toBe('Pali');
    expect(nestedName(null)).toBeNull();
  });

  it('formats onboarder names and CSV cells', () => {
    expect(onboarderLabel({ first_name: 'Ashok', last_name: 'Kumar' })).toBe('Ashok Kumar');
    expect(csvEscape('hello, "world"')).toBe('"hello, ""world"""');
    const csv = villagerToCsvRow({
      id: '1',
      name: 'Sita',
      mobile: '+919876543210',
      latitude: 23.1,
      longitude: 80.2,
      village_id: 'v',
      division_id: null,
      range_id: null,
      created_by: null,
      is_active: true,
      alert_opt_in: false,
      notes: 'line\nbreak',
      villages: { name: 'Pali' },
    });
    expect(csv).toContain('Sita');
    expect(csv).toContain('opted_out');
    expect(csv).toContain('"line\nbreak"');
  });

  it('accepts UUID ids and rejects garbage paths', () => {
    expect(isUuid('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid('')).toBe(false);
  });
});
