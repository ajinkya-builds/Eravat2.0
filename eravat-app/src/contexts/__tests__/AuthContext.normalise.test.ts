/**
 * Unit tests for AuthContext utility functions.
 *
 * normalisePhone is the shared phone-normalisation logic used by every login
 * path (password, OTP send, OTP verify). Bugs here break login for real users.
 */

import { describe, it, expect } from 'vitest';
import { normalisePhone } from '../AuthContext';

describe('normalisePhone', () => {
  // ─── Standard Indian 10-digit formats ────────────────────────────────────

  it('returns a plain 10-digit number unchanged', () => {
    expect(normalisePhone('9876543210')).toBe('9876543210');
  });

  it('strips spaces from a spaced 10-digit number', () => {
    expect(normalisePhone('98765 43210')).toBe('9876543210');
  });

  it('strips dashes from a dashed 10-digit number', () => {
    expect(normalisePhone('9876-543210')).toBe('9876543210');
  });

  it('strips dots from a dotted 10-digit number', () => {
    expect(normalisePhone('98.765.43210')).toBe('9876543210');
  });

  // ─── Country-code (+91 / 91) variants ────────────────────────────────────

  it('strips leading +91 prefix (E.164)', () => {
    expect(normalisePhone('+919876543210')).toBe('9876543210');
  });

  it('strips leading 91 prefix without plus (12-digit)', () => {
    expect(normalisePhone('919876543210')).toBe('9876543210');
  });

  it('strips +91 with space separator', () => {
    expect(normalisePhone('+91 9876543210')).toBe('9876543210');
  });

  it('strips +91- with dash separator', () => {
    expect(normalisePhone('+91-9876543210')).toBe('9876543210');
  });

  // ─── Leading zero (0XXXXXXXXXX) ──────────────────────────────────────────

  it('strips leading 0 from 11-digit number', () => {
    expect(normalisePhone('09876543210')).toBe('9876543210');
  });

  it('strips leading 0 with country code (+91-0XXXXXXXXXX should not be valid but handles gracefully)', () => {
    // +91 + 0XXXXXXXXXX would produce 13 digits after stripping non-digits; not matched by any rule
    // The function returns the raw digit string, which will fail downstream validation — acceptable.
    const result = normalisePhone('+91-09876543210');
    // digits = '91' + '09876543210' = 13 digits; no rule fires → returned as-is
    expect(result).toHaveLength(13); // Documents the boundary behaviour
  });

  // ─── Numbers that start with 91 but are genuinely 10-digit ───────────────

  it('does NOT strip 91 from a 10-digit number that starts with 91', () => {
    // A valid Airtel/Idea number starting with 91XXXXXXXX (only 10 digits)
    expect(normalisePhone('9100000000')).toBe('9100000000');
  });

  // ─── Mixed separators ─────────────────────────────────────────────────────

  it('handles mixed separators in a realistic user-typed string', () => {
    expect(normalisePhone('+91 98765-43210')).toBe('9876543210');
  });

  it('handles parentheses (non-Indian convention but typed by some users)', () => {
    expect(normalisePhone('+91 (987) 654-3210')).toBe('9876543210');
  });

  // ─── Edge / adversarial inputs ────────────────────────────────────────────

  it('returns empty string for empty input', () => {
    expect(normalisePhone('')).toBe('');
  });

  it('returns empty string for a string with no digits', () => {
    expect(normalisePhone('abc def')).toBe('');
  });

  it('handles very long garbage input (does not throw)', () => {
    const long = 'aaa'.repeat(200) + '9876543210';
    expect(normalisePhone(long)).toBe('9876543210');
  });

  it('handles null-ish coerced string gracefully', () => {
    // TypeScript prevents null, but test defensive runtime behavior
    expect(() => normalisePhone(String(undefined))).not.toThrow();
  });

  // ─── Idempotency ─────────────────────────────────────────────────────────

  it('is idempotent — calling twice on the same input returns the same result', () => {
    const once = normalisePhone('+91-9876543210');
    const twice = normalisePhone(once);
    expect(twice).toBe(once);
  });
});
