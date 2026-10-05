import { describe, expect, it } from 'vitest';
import { isAuthLockTimeoutError, isBenignAuthExceptionMessage, isStaleAuthTokenError } from './authErrors';

describe('auth error classification', () => {
    it('treats an expired token as a stale session, not a crash', () => {
        const error = new Error('Token has expired or is invalid');
        expect(isStaleAuthTokenError(error)).toBe(true);
        expect(isBenignAuthExceptionMessage(error.message)).toBe(true);
    });

    it('treats a Navigator lock timeout as benign', () => {
        const error = new Error(
            'Acquiring an exclusive Navigator LockManager lock "lock:sb-auth-token" timed out waiting 10000ms',
        );
        expect(isAuthLockTimeoutError(error)).toBe(true);
        expect(isBenignAuthExceptionMessage(error.message)).toBe(true);
    });

    it('does not hide unrelated auth failures', () => {
        expect(isStaleAuthTokenError(new Error('Too many requests'))).toBe(false);
        expect(isAuthLockTimeoutError(new Error('profile_fetch_timeout'))).toBe(false);
    });
});
