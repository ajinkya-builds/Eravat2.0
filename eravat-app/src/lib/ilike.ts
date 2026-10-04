/** Strip PostgREST `.or()` / LIKE metacharacters from user search text. */
export function sanitiseIlikeTerm(raw: string): string {
  return raw.replace(/[%_,.()\\]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * One PostgREST `.or()` filter per word. Apply every filter so words are ANDed
 * and each word may match any of the columns (split first/last name, or phone).
 */
export function tokenOrFilters(columns: readonly string[], raw: string): string[] {
  const safe = sanitiseIlikeTerm(raw);
  if (!safe || columns.length === 0) return [];
  return safe.split(' ').filter(Boolean).map((part) =>
    columns.map((col) => `${col}.ilike.%${part}%`).join(','),
  );
}
