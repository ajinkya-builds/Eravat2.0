import { describe, expect, it } from 'vitest';
import { fromE164India, normalisePhoneDigits, toE164India } from './phone';

describe('phone helpers', () => {
  it('strips country code and leading zero to 10 digits', () => {
    expect(normalisePhoneDigits('9876543210')).toBe('9876543210');
    expect(normalisePhoneDigits('+919876543210')).toBe('9876543210');
    expect(normalisePhoneDigits('09876543210')).toBe('9876543210');
  });

  it('round-trips Indian mobiles', () => {
    expect(toE164India('9876543210')).toBe('+919876543210');
    expect(toE164India('+91 98765 43210')).toBe('+919876543210');
    expect(fromE164India('+919876543210')).toBe('9876543210');
    expect(fromE164India('919876543210')).toBe('9876543210');
  });

  it('rejects non-10-digit locals for E.164', () => {
    expect(toE164India('123')).toBeNull();
  });
});
