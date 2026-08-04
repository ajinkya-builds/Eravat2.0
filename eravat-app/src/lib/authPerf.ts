/** Auth events that warrant a profile refetch (not silent token refresh). */
export function shouldLoadProfileOnAuthEvent(event: string): boolean {
  return event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'INITIAL_SESSION';
}

/** Push registration only on fresh sign-in, not TOKEN_REFRESHED. */
export function shouldRegisterPushOnAuthEvent(event: string): boolean {
  return event === 'SIGNED_IN';
}

export const PROFILE_CACHE_TTL_MS = 10 * 60 * 1000;

export function isProfileCacheFresh(
  cachedUserId: string | null | undefined,
  userId: string,
  fetchedAt: number | null | undefined,
  now = Date.now(),
  ttlMs = PROFILE_CACHE_TTL_MS,
): boolean {
  if (!cachedUserId || cachedUserId !== userId) return false;
  if (fetchedAt == null) return false;
  return now - fetchedAt < ttlMs;
}
