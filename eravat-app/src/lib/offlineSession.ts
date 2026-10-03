import type { Session, User } from '@supabase/supabase-js';

type StoredAuth = {
    access_token?: string;
    refresh_token?: string;
    expires_at?: number;
    expires_in?: number;
    token_type?: string;
    user?: User;
};

function readStoredAuthBlob(): StoredAuth | null {
    if (typeof localStorage === 'undefined') return null;
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key?.startsWith('sb-') || !key.endsWith('-auth-token')) continue;
            const raw = localStorage.getItem(key);
            if (!raw) continue;
            const parsed = JSON.parse(raw) as StoredAuth;
            if (parsed?.access_token || parsed?.refresh_token) return parsed;
        }
    } catch {
        // ignore parse errors
    }
    return null;
}

/** True when Supabase auth tokens are present in localStorage (no network). */
export function hasPersistedSupabaseSession(): boolean {
    const stored = readStoredAuthBlob();
    return Boolean(stored?.access_token || stored?.refresh_token);
}

/**
 * Rebuild a Session from localStorage without calling Supabase Auth.
 * Used when offline cold start / expired JWT refresh returns null but tokens remain.
 */
export function readPersistedSupabaseSession(): Session | null {
    const stored = readStoredAuthBlob();
    if (!stored?.access_token || !stored?.user?.id) return null;

    return {
        access_token: stored.access_token,
        refresh_token: stored.refresh_token ?? '',
        expires_at: stored.expires_at,
        expires_in: stored.expires_in ?? 0,
        token_type: 'bearer',
        user: stored.user,
    };
}

export function isBrowserOffline(): boolean {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export type ConnectivitySnapshot = {
    /** navigator.onLine (WebView) */
    navigatorOnline: boolean;
    /** Capacitor Network plugin — matches Offline badge when available */
    networkConnected: boolean | null;
    /**
     * True when either signal says offline. Used for geo budgets so Offline (Local Save)
     * sessions get the longer cold-GNSS window even if navigator.onLine is still true.
     */
    offlineForGeo: boolean;
};

/**
 * Prefer Capacitor Network (same source as the Offline badge) when on native;
 * always include navigator.onLine for PostHog comparison.
 */
export async function getConnectivitySnapshot(): Promise<ConnectivitySnapshot> {
    const navigatorOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
    let networkConnected: boolean | null = null;
    try {
        const { Capacitor } = await import('@capacitor/core');
        if (Capacitor.isNativePlatform()) {
            const { Network } = await import('@capacitor/network');
            const status = await Network.getStatus();
            networkConnected = Boolean(status.connected);
        }
    } catch {
        networkConnected = null;
    }
    const offlineForGeo =
        !navigatorOnline || (networkConnected === false);
    return { navigatorOnline, networkConnected, offlineForGeo };
}
