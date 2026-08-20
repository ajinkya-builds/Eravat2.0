import { describe, expect, it } from 'vitest';
import { digitsForMobileInput, fromE164India, normalisePhoneDigits, toE164India } from './phone';

describe('phone helpers', () => {
  it('strips country code and leading zero to 10 digits', () => {
    expect(normalisePhoneDigits('9876543210')).toBe('9876543210');
    expect(normalisePhoneDigits('+919876543210')).toBe('9876543210');
    expect(normalisePhoneDigits('09876543210')).toBe('9876543210');
    expect(normalisePhoneDigits('+91 98765 43210')).toBe('9876543210');
  });

  it('does not strip a 10-digit mobile that itself starts with 91', () => {
    expect(normalisePhoneDigits('9198765432')).toBe('9198765432');
    expect(toE164India('9198765432')).toBe('+919198765432');
  });

  it('round-trips Indian mobiles', () => {
    expect(toE164India('9876543210')).toBe('+919876543210');
    expect(toE164India('+91 98765 43210')).toBe('+919876543210');
    expect(fromE164India('+919876543210')).toBe('9876543210');
    expect(fromE164India('919876543210')).toBe('9876543210');
  });

  it('rejects non-Indian and incomplete locals for E.164', () => {
    expect(toE164India('123')).toBeNull();
    expect(toE164India('0123456789')).toBeNull();
    expect(toE164India('1234567890')).toBeNull();
  });

  it('recovers the local number when pasting E.164 into a 10-digit field', () => {
    expect(digitsForMobileInput('+919876543210')).toBe('9876543210');
    expect(digitsForMobileInput('919876543210')).toBe('9876543210');
    expect(digitsForMobileInput('09876543210')).toBe('9876543210');
    expect(digitsForMobileInput('9876543210')).toBe('9876543210');
    expect(digitsForMobileInput('98765432109')).toBe('9876543210');
  });
});
