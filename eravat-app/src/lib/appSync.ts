import { countPendingSyncReports, syncData } from '../services/syncService';
import { countPendingRegistrations, syncPendingRegistrations } from '../services/registrationSyncService';
import { flushPendingSupportIssues } from './supportIssues';

/** Online / reconnect-style triggers share one debounce to avoid radio storms. */
const RECONNECT_REASONS = new Set(['reconnect', 'native-online']);
const RECONNECT_DEBOUNCE_MS = 3_000;
const DEFAULT_DEBOUNCE_MS = 500;

/** After failed automatic sync batches: 5s → 15s → 45s → 135s → 5m cap. */
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_FACTOR = 3;
const BACKOFF_CAP_MS = 300_000;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingReason = 'scheduled';
let consecutiveFailureBatches = 0;
let cooldownUntil = 0;

function nextBackoffMs(failures: number): number {
    const exp = Math.max(0, failures - 1);
    return Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * Math.pow(BACKOFF_FACTOR, exp));
}

/** Test / diagnostics helper — not used by production UI. */
export function getSyncSchedulerState() {
    return {
        consecutiveFailureBatches,
        cooldownUntil,
        debouncePending: debounceTimer != null,
        pendingReason,
    };
}

/** Reset scheduler state (unit tests). */
export function resetSyncSchedulerForTests() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = null;
    pendingReason = 'scheduled';
    consecutiveFailureBatches = 0;
    cooldownUntil = 0;
}

/**
 * Debounced entry for lifecycle / network triggers.
 * Coalesces Capacitor Network + native ConnectivityManager + resume into one flush.
 */
export function scheduleSyncAllPending(
    reason: string,
    options?: { debounceMs?: number; force?: boolean },
): void {
    pendingReason = reason;
    const debounceMs =
        options?.debounceMs ??
        (RECONNECT_REASONS.has(reason) ? RECONNECT_DEBOUNCE_MS : DEFAULT_DEBOUNCE_MS);

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void syncAllPending(pendingReason, { force: options?.force });
    }, debounceMs);
}

/** Flush all local outboxes (reports, registrations, support notes). */
export async function syncAllPending(
    reason: string,
    options?: { force?: boolean },
): Promise<void> {
    const force = options?.force === true;
    const now = Date.now();

    if (!force && now < cooldownUntil) {
        const wait = cooldownUntil - now;
        if (!debounceTimer) {
            pendingReason = reason;
            debounceTimer = setTimeout(() => {
                debounceTimer = null;
                void syncAllPending(pendingReason);
            }, wait);
        }
        return;
    }

    try {
        const [reportPending, regPending] = await Promise.all([
            countPendingSyncReports(),
            countPendingRegistrations(),
        ]);
        void flushPendingSupportIssues();

        let reportFailed = false;
        let regFailed = false;

        if (reportPending > 0) {
            const result = await syncData();
            const failed =
                result && typeof result === 'object' && 'failed' in result
                    ? Number((result as { failed?: number }).failed ?? 0)
                    : 0;
            reportFailed = failed > 0 || result?.success === false;
        }

        if (regPending > 0) {
            const result = await syncPendingRegistrations(reason);
            regFailed = (result?.failed ?? 0) > 0;
        }

        if (reportPending === 0 && regPending === 0) {
            consecutiveFailureBatches = 0;
            cooldownUntil = 0;
            return;
        }

        if (reportFailed || regFailed) {
            consecutiveFailureBatches += 1;
            cooldownUntil = Date.now() + nextBackoffMs(consecutiveFailureBatches);
        } else {
            consecutiveFailureBatches = 0;
            cooldownUntil = 0;
        }
    } catch {
        // Dexie / storage probe failed — never throw from lifecycle hooks
        consecutiveFailureBatches += 1;
        cooldownUntil = Date.now() + nextBackoffMs(consecutiveFailureBatches);
    }
}
