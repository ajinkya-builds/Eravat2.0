/** Normalize Indian mobile input to E.164 (+91XXXXXXXXXX). */
export function toE164India(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  let local = digits;
  if (local.length === 12 && local.startsWith('91')) local = local.slice(2);
  if (local.length === 11 && local.startsWith('0')) local = local.slice(1);
  if (local.length !== 10) return null;
  return `+91${local}`;
}
