import { describe, expect, it } from 'vitest';
import { describeSyncSignOutResult, signOutAllowedAfterSync, signOutQueueTraceFields } from './signOutUnsynced';

describe('signOutUnsynced', () => {
    it('records owner ids so a report left by another account can be traced', () => {
        const fields = signOutQueueTraceFields('amey-id', {
            reports: [
                {
                    id: 'report-1',
                    user_id: 'kundan-id',
                    sync_status: 'failed',
                    device_timestamp: '2026-10-05T12:56:03.714Z',
                    observation_type: 'direct',
                },
            ],
            media: [{ id: 'media-1', report_id: 'report-1', sync_status: 'pending' }],
        });

        expect(fields).toMatchObject({
            actor_user_id: 'amey-id',
            pending_count: 1,
            foreign_count: 1,
            report_ids: 'report-1',
            owner_user_ids: 'kundan-id',
            sync_statuses: 'failed',
            media_ids: 'media-1',
            ids_truncated: false,
        });
    });

    it('does not sign out when sync was skipped or reports remain', () => {
        expect(signOutAllowedAfterSync({ success: true, skipped: true }, 0)).toBe(false);
        expect(signOutAllowedAfterSync({ success: false }, 1)).toBe(false);
        expect(signOutAllowedAfterSync({ success: true }, 1)).toBe(false);
        expect(signOutAllowedAfterSync({ success: true }, 0)).toBe(true);
    });

    it('names the sync outcome that should be logged', () => {
        expect(describeSyncSignOutResult({ success: true, count: 1, failed: 0 }, 0)).toMatchObject({
            allowed: true,
            outcome: 'signed_out',
            uploaded: 1,
            errorCode: 'none',
        });
        expect(describeSyncSignOutResult({ success: true, skipped: true, count: 0 }, 1)).toMatchObject({
            allowed: false,
            outcome: 'skipped',
            errorCode: 'sync_in_progress',
        });
        expect(describeSyncSignOutResult({ success: false, failed: 1, error: 'Not authenticated' }, 1)).toMatchObject({
            allowed: false,
            outcome: 'still_pending',
            errorCode: 'Not authenticated',
        });
    });
});
