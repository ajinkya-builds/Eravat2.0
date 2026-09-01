import { countPendingSyncReports, syncData } from '../services/syncService';
import { countPendingRegistrations, syncPendingRegistrations } from '../services/registrationSyncService';
import { flushPendingSupportIssues } from './supportIssues';

/** Flush all local outboxes (reports, registrations, support notes). */
export async function syncAllPending(reason: string): Promise<void> {
    try {
        const [reportPending, regPending] = await Promise.all([
            countPendingSyncReports(),
            countPendingRegistrations(),
        ]);
        void flushPendingSupportIssues();
        if (reportPending > 0) {
            void syncData();
        }
        if (regPending > 0) {
            void syncPendingRegistrations(reason);
        }
    } catch {
        // Dexie / storage probe failed — never throw from lifecycle hooks
    }
}
