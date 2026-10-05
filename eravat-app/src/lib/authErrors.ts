/** Failures the app clears locally instead of sending to error tracking. */
export function isStaleAuthTokenError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return /token has expired or is invalid|invalid refresh token|refresh token not found|invalid jwt/i.test(message);
}

/** Supabase Navigator LockManager timeouts on Android WebView. */
export function isAuthLockTimeoutError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return /navigator lockmanager lock|lock timed out waiting/i.test(message);
}

export function isBenignAuthExceptionMessage(message: string): boolean {
    return isStaleAuthTokenError(new Error(message)) || isAuthLockTimeoutError(new Error(message));
}
