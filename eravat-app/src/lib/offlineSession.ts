/** True when Supabase auth tokens are present in localStorage (no network). */
export function hasPersistedSupabaseSession(): boolean {
    if (typeof localStorage === 'undefined') return false;
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key?.startsWith('sb-') || !key.endsWith('-auth-token')) continue;
            const raw = localStorage.getItem(key);
            if (!raw) continue;
            const parsed = JSON.parse(raw) as { access_token?: string; refresh_token?: string };
            if (parsed?.access_token || parsed?.refresh_token) return true;
        }
    } catch {
        // ignore parse errors
    }
    return false;
}

export function isBrowserOffline(): boolean {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
}
