/** Keys / storage that must survive an in-app APK update. */
const PRESERVE_EXACT = new Set([
  'eravat_cached_profile',
  'eravat_app_settings',
  'eravat_pending_support_issues',
  'eravat_pending_cache_clear',
  'eravat_installed_version_code',
]);

const PRESERVE_PREFIXES = ['sb-'];

function shouldPreserveKey(key: string): boolean {
  if (PRESERVE_EXACT.has(key)) return true;
  return PRESERVE_PREFIXES.some((p) => key.startsWith(p));
}

/**
 * Clear stale web/runtime caches that commonly break after sideloaded APK updates.
 * Preserves auth session, profile cache, Dexie offline queues, and user settings.
 */
export async function clearStaleAppCaches(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    /* ignore */
  }

  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* ignore */
  }

  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (shouldPreserveKey(key)) continue;
      // Drop sync locks, transient geo caches, and other version-sensitive keys.
      if (
        key === 'eravat_sync_lock' ||
        key === 'last_sync_time' ||
        key.startsWith('eravat_geo_') ||
        key.startsWith('workbox-') ||
        key.includes('supabase.auth.token')
      ) {
        doomed.push(key);
      }
    }
    for (const key of doomed) localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function markPendingCacheClear(): void {
  try {
    localStorage.setItem('eravat_pending_cache_clear', '1');
  } catch {
    /* ignore */
  }
}

/** Run once after a new APK opens (or when versionCode changes). */
export async function runPendingCacheClearIfNeeded(versionCode: number): Promise<void> {
  try {
    const pending = localStorage.getItem('eravat_pending_cache_clear') === '1';
    const prev = Number(localStorage.getItem('eravat_installed_version_code') || '0');
    if (pending || (versionCode > 0 && prev > 0 && prev !== versionCode)) {
      await clearStaleAppCaches();
      localStorage.removeItem('eravat_pending_cache_clear');
    }
    if (versionCode > 0) {
      localStorage.setItem('eravat_installed_version_code', String(versionCode));
    }
  } catch {
    /* ignore */
  }
}
