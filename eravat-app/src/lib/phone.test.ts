import { describe, expect, it } from 'vitest';
import { fromE164India, toE164India } from './phone';

describe('phone helpers', () => {
  it('round-trips Indian mobiles', () => {
    expect(toE164India('9876543210')).toBe('+919876543210');
    expect(fromE164India('+919876543210')).toBe('9876543210');
    expect(fromE164India('919876543210')).toBe('9876543210');
  });
});
