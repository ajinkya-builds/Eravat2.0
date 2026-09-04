import { describe, it, expect, beforeEach } from 'vitest';
import {
  hasPersistedSupabaseSession,
  readPersistedSupabaseSession,
} from '../../lib/offlineSession';

describe('offlineSession', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns false when no supabase auth key exists', () => {
    expect(hasPersistedSupabaseSession()).toBe(false);
    expect(readPersistedSupabaseSession()).toBeNull();
  });

  it('returns true when sb auth token is present', () => {
    localStorage.setItem(
      'sb-test-auth-token',
      JSON.stringify({ access_token: 'abc', refresh_token: 'def' }),
    );
    expect(hasPersistedSupabaseSession()).toBe(true);
  });

  it('hydrates a Session when access_token and user are present', () => {
    localStorage.setItem(
      'sb-ttjtyvxfiqhjdngkgdkf-auth-token',
      JSON.stringify({
        access_token: 'jwt',
        refresh_token: 'refresh',
        expires_at: 1_700_000_000,
        expires_in: 3600,
        token_type: 'bearer',
        user: { id: 'user-1', aud: 'authenticated', role: 'authenticated', email: '' },
      }),
    );
    const session = readPersistedSupabaseSession();
    expect(session?.access_token).toBe('jwt');
    expect(session?.user.id).toBe('user-1');
    expect(hasPersistedSupabaseSession()).toBe(true);
  });

  it('does not hydrate when user blob is missing', () => {
    localStorage.setItem(
      'sb-test-auth-token',
      JSON.stringify({ access_token: 'jwt', refresh_token: 'refresh' }),
    );
    expect(hasPersistedSupabaseSession()).toBe(true);
    expect(readPersistedSupabaseSession()).toBeNull();
  });
});
