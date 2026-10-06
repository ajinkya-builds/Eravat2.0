import type { AnalyticsProps } from './analytics';

const MAX_LISTED = 40;

export type SignOutQueueReport = {
    id: string;
    user_id: string | null;
    sync_status: string;
    device_timestamp: string;
    observation_type: string | null;
};

export type SignOutQueueMedia = {
    id: string;
    report_id: string;
    sync_status: string;
};

export type SignOutQueueSnapshot = {
    reports: SignOutQueueReport[];
    media: SignOutQueueMedia[];
};

function joinLimited(values: string[]): { value: string; truncated: boolean } {
    const truncated = values.length > MAX_LISTED;
    return { value: values.slice(0, MAX_LISTED).join(','), truncated };
}

/** PostHog-safe fields for one sign-out queue snapshot. Ids only, no notes or media bytes. */
export function signOutQueueTraceFields(
    actorUserId: string | null,
    snapshot: SignOutQueueSnapshot,
): AnalyticsProps {
    const reportIds = joinLimited(snapshot.reports.map((report) => report.id));
    const ownerIds = joinLimited(snapshot.reports.map((report) => report.user_id ?? 'none'));
    const statuses = joinLimited(snapshot.reports.map((report) => report.sync_status));
    const observedAt = joinLimited(snapshot.reports.map((report) => report.device_timestamp));
    const observationTypes = joinLimited(
        snapshot.reports.map((report) => report.observation_type ?? 'none'),
    );
    const mediaIds = joinLimited(snapshot.media.map((item) => item.id));
    const foreignCount = snapshot.reports.filter(
        (report) => report.user_id !== actorUserId,
    ).length;

    return {
        actor_user_id: actorUserId ?? 'none',
        pending_count: snapshot.reports.length,
        foreign_count: foreignCount,
        media_count: snapshot.media.length,
        report_ids: reportIds.value,
        owner_user_ids: ownerIds.value,
        sync_statuses: statuses.value,
        device_timestamps: observedAt.value,
        observation_types: observationTypes.value,
        media_ids: mediaIds.value,
        ids_truncated: reportIds.truncated || ownerIds.truncated || mediaIds.truncated,
    };
}

/** Sign-out may follow a sync only when that sync finished and the queue is empty. */
export function signOutAllowedAfterSync(
    result: { success: boolean; skipped?: boolean },
    remainingCount: number,
): boolean {
    if (result.skipped) return false;
    if (!result.success) return false;
    return remainingCount === 0;
}

export function describeSyncSignOutResult(
    result: {
        success: boolean;
        skipped?: boolean;
        count?: number;
        failed?: number;
        error?: unknown;
    },
    remainingCount: number,
): {
    allowed: boolean;
    outcome: 'signed_out' | 'still_pending' | 'skipped';
    uploaded: number;
    failed: number;
    errorCode: string;
} {
    const allowed = signOutAllowedAfterSync(result, remainingCount);
    const outcome = allowed ? 'signed_out' : result.skipped ? 'skipped' : 'still_pending';
    let errorCode = 'none';
    if (result.skipped) errorCode = 'sync_in_progress';
    else if (typeof result.error === 'string') errorCode = result.error.slice(0, 120);
    else if (result.error instanceof Error) errorCode = result.error.message.slice(0, 120);
    else if (!allowed) errorCode = 'still_pending';
    return {
        allowed,
        outcome,
        uploaded: result.count ?? 0,
        failed: result.failed ?? 0,
        errorCode,
    };
}
