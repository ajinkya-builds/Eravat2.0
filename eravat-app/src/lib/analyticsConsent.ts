/**
 * Local preference for operational analytics / error reporting.
 * Wired to Privacy → Share Analytics.
 */
const STORAGE_KEY = 'eravat_analytics_consent';

/** Default on for enrolled field staff (ops tool); user can opt out. */
export function getAnalyticsConsent(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return true;
    return raw === '1' || raw === 'true';
  } catch {
    return true;
  }
}

export function setAnalyticsConsent(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // ignore quota / private mode
  }
}
