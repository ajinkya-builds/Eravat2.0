/** Normalize Indian mobile input to E.164 (+91XXXXXXXXXX). */
export function toE164India(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  let local = digits;
  if (local.length === 12 && local.startsWith('91')) local = local.slice(2);
  if (local.length === 11 && local.startsWith('0')) local = local.slice(1);
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
