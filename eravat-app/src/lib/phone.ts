const INDIA_MOBILE = /^[6-9]\d{9}$/;

/** Strip to digits and drop a leading 91 / 0 when the rest is a 10-digit Indian mobile. */
export function normalisePhoneDigits(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length >= 12) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0') && digits.length >= 11) {
    digits = digits.slice(1);
  }
  if (digits.length > 10) digits = digits.slice(-10);
  return digits;
}

/** Normalize Indian mobile input to E.164 (+91XXXXXXXXXX). */
export function toE164India(raw: string): string | null {
  const local = normalisePhoneDigits(raw);
  if (!INDIA_MOBILE.test(local)) return null;
  return `+91${local}`;
}

/** Strip +91 for editing in a 10-digit input. */
export function fromE164India(raw: string): string {
  return normalisePhoneDigits(raw);
}

/**
 * Keep a 10-digit field correct when the user pastes +91 / 0-prefix / spaced numbers.
 * Extra typed digits are ignored (first 10 after stripping country code), not shifted.
 */
export function digitsForMobileInput(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length >= 12) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0') && digits.length >= 11) {
    digits = digits.slice(1);
  }
  return digits.slice(0, 10);
}
