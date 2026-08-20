const KEY = 'eravat_cached_profile';

type Cached = {
    userId: string;
    profile: Record<string, unknown>;
    savedAt: number;
};

export function saveCachedProfile(userId: string, profile: Record<string, unknown>): void {
    try {
        const payload: Cached = { userId, profile, savedAt: Date.now() };
        localStorage.setItem(KEY, JSON.stringify(payload));
    } catch {
        // quota / private mode — ignore
    }
}

export function loadCachedProfile<T = Record<string, unknown>>(userId: string): T | null {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Cached;
        if (parsed?.userId !== userId || !parsed.profile) return null;
        return parsed.profile as T;
    } catch {
        return null;
    }
}

export function clearCachedProfile(): void {
    try {
        localStorage.removeItem(KEY);
    } catch {
        // ignore
    }
}
