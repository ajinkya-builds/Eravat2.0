/** Strip PostgREST `.or()` / LIKE metacharacters from user search text. */
export function sanitiseIlikeTerm(raw: string): string {
  return raw.replace(/[%_,.()\\]/g, ' ').replace(/\s+/g, ' ').trim();
}
