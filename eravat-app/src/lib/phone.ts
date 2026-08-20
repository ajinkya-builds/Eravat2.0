/** Strip to digits and drop a leading 91 / 0 when the rest is a 10-digit Indian mobile. */
export function normalisePhoneDigits(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

/** Normalize Indian mobile input to E.164 (+91XXXXXXXXXX). */
export function toE164India(raw: string): string | null {
  const local = normalisePhoneDigits(raw);
  if (local.length !== 10) return null;
  return `+91${local}`;
}

/** Strip +91 for editing in a 10-digit input. */
export function fromE164India(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length > 10) return digits.slice(-10);
  return digits;
}
