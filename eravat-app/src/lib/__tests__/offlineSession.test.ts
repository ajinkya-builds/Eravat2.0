import { describe, it, expect, beforeEach } from 'vitest';
import { hasPersistedSupabaseSession } from '../../lib/offlineSession';

describe('hasPersistedSupabaseSession', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns false when no supabase auth key exists', () => {
    expect(hasPersistedSupabaseSession()).toBe(false);
  });

  it('returns true when sb auth token is present', () => {
    localStorage.setItem(
      'sb-test-auth-token',
      JSON.stringify({ access_token: 'abc', refresh_token: 'def' }),
    );
    expect(hasPersistedSupabaseSession()).toBe(true);
  });
});
