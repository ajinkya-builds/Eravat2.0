import { describe, it, expect, beforeEach } from 'vitest';
import { clearStaleAppCaches, markPendingCacheClear, runPendingCacheClearIfNeeded } from '../appCacheCleanup';

describe('appCacheCleanup', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('sb-test-auth-token', JSON.stringify({ access_token: 'x' }));
    localStorage.setItem('eravat_cached_profile', '{}');
    localStorage.setItem('eravat_sync_lock', '{}');
    localStorage.setItem('eravat_geo_lists_v1', '{}');
  });

  it('clears sync/geo locks but keeps auth + profile', async () => {
    await clearStaleAppCaches();
    expect(localStorage.getItem('sb-test-auth-token')).toBeTruthy();
    expect(localStorage.getItem('eravat_cached_profile')).toBeTruthy();
    expect(localStorage.getItem('eravat_sync_lock')).toBeNull();
    expect(localStorage.getItem('eravat_geo_lists_v1')).toBeNull();
  });

  it('runs pending clear when version changes', async () => {
    markPendingCacheClear();
    localStorage.setItem('eravat_installed_version_code', '10');
    localStorage.setItem('eravat_sync_lock', '1');
    await runPendingCacheClearIfNeeded(11);
    expect(localStorage.getItem('eravat_pending_cache_clear')).toBeNull();
    expect(localStorage.getItem('eravat_installed_version_code')).toBe('11');
    expect(localStorage.getItem('eravat_sync_lock')).toBeNull();
    expect(localStorage.getItem('sb-test-auth-token')).toBeTruthy();
  });
});
