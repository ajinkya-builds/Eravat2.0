import { describe, expect, it } from 'vitest';
import {
  csvEscape,
  nestedName,
  onboarderLabel,
  validateVillagerForm,
  villageNameOf,
  villagerToCsvRow,
} from './villagerRegistry';

describe('villagerRegistry', () => {
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
});
