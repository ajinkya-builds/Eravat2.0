import { describe, expect, it } from 'vitest';
import {
  isProfileCacheFresh,
  shouldLoadProfileOnAuthEvent,
  shouldRegisterPushOnAuthEvent,
} from './authPerf';

describe('authPerf', () => {
  it('loads profile on sign-in / user update / initial session only', () => {
    expect(shouldLoadProfileOnAuthEvent('SIGNED_IN')).toBe(true);
    expect(shouldLoadProfileOnAuthEvent('USER_UPDATED')).toBe(true);
    expect(shouldLoadProfileOnAuthEvent('INITIAL_SESSION')).toBe(true);
    expect(shouldLoadProfileOnAuthEvent('TOKEN_REFRESHED')).toBe(false);
    expect(shouldLoadProfileOnAuthEvent('SIGNED_OUT')).toBe(false);
  });

  it('registers push only on SIGNED_IN', () => {
    expect(shouldRegisterPushOnAuthEvent('SIGNED_IN')).toBe(true);
    expect(shouldRegisterPushOnAuthEvent('TOKEN_REFRESHED')).toBe(false);
    expect(shouldRegisterPushOnAuthEvent('INITIAL_SESSION')).toBe(false);
  });

  it('treats profile cache as fresh within TTL for same user', () => {
    const now = 1_000_000;
    expect(isProfileCacheFresh('u1', 'u1', now - 60_000, now)).toBe(true);
    expect(isProfileCacheFresh('u1', 'u1', now - 11 * 60_000, now)).toBe(false);
    expect(isProfileCacheFresh('u1', 'u2', now - 1_000, now)).toBe(false);
    expect(isProfileCacheFresh(null, 'u1', now, now)).toBe(false);
  });
});
