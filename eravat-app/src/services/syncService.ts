import { logger } from '../lib/logger';
import { db } from '../db';
import { supabase } from '../supabase';

let isSyncing = false;
const SYNC_LOCK_KEY = 'eravat_sync_lock';
const SYNC_LOCK_TTL_MS = 120_000;
const SYNC_TAB_ID = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `tab-${Date.now()}`;

let _webLockResolve: (() => void) | null = null;

async function tryAcquireCrossTabSyncLock(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && navigator.locks) {
        return new Promise<boolean>(resolve => {
            navigator.locks.request(
                SYNC_LOCK_KEY,
                { ifAvailable: true },
                (lock: Lock | null) => {
                    if (!lock) { resolve(false); return Promise.resolve(); }
                    resolve(true);
                    return new Promise<void>(r => { _webLockResolve = r; });
                }
            );
        });
    }
    // Fallback for environments without Web Locks API
    if (typeof localStorage === 'undefined') return true;
    try {
        const now = Date.now();
        const raw = localStorage.getItem(SYNC_LOCK_KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as { tabId?: string; ts?: number };
            if (
                parsed.tabId !== SYNC_TAB_ID &&
                typeof parsed.ts === 'number' &&
                now - parsed.ts < SYNC_LOCK_TTL_MS
            ) {
                return false;
            }
        }
        localStorage.setItem(SYNC_LOCK_KEY, JSON.stringify({ tabId: SYNC_TAB_ID, ts: now }));
        return true;
    } catch {
        return true;
    }
}

function releaseCrossTabSyncLock(): void {
    if (_webLockResolve) {
        _webLockResolve();
        _webLockResolve = null;
        return;
    }
    if (typeof localStorage === 'undefined') return;
    try {
        const raw = localStorage.getItem(SYNC_LOCK_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as { tabId?: string };
        if (parsed.tabId === SYNC_TAB_ID) {
            localStorage.removeItem(SYNC_LOCK_KEY);
        }
    } catch {
        // ignore lock cleanup errors
    }
}
// Validate that an ID is a safe UUID or prefixed-UUID format (no path traversal)
const SAFE_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
function isSafeId(id: string): boolean {
    return SAFE_ID_REGEX.test(id) && !id.includes('..');
}

// Allowed MIME types for media uploads
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

function normalizeMimeType(mimeType: string): string {
    const normalized = mimeType.toLowerCase().trim();
    if (normalized === 'image/jpg') {
        return 'image/jpeg';
    }
    return normalized;
}

function mimeTypeToExtension(mimeType: string): string {
    switch (mimeType) {
        case 'image/jpeg':
            return 'jpg';
        case 'image/png':
            return 'png';
        case 'image/webp':
            return 'webp';
        default:
            return 'jpg';
    }
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

type MediaInsertResult = { success: true } | { success: false; error: unknown };

// Live schema: report_media(id, report_id, storage_path) — no mime/content_type column.
async function insertReportMedia(args: {
    mediaId: string;
    reportId: string;
    fileName: string;
}): Promise<MediaInsertResult> {
    // Avoid `.select()` on insert so success doesn't depend on SELECT policies.
    const { error } = await supabase
        .from('report_media')
        .insert({ id: args.mediaId, report_id: args.reportId, storage_path: args.fileName });
    return error ? { success: false, error } : { success: true };
}

function normalizeTextArray(value: unknown): string[] | null {
    if (Array.isArray(value)) {
        const clean = value
            .map((v) => (typeof v === 'string' ? v.trim() : ''))
            .filter((v) => v.length > 0);
        return clean.length > 0 ? clean : null;
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed ? [trimmed] : null;
    }
    return null;
}

function mapLossCategory(loss: string): string {
    const normalized = loss.trim().toLowerCase();
    if (normalized === 'no loss') return 'none';
    if (normalized === 'crop') return 'crop';
    if (normalized === 'livestock') return 'livestock';
    if (normalized === 'grain') return 'grain';
    if (normalized === 'human injury') return 'human_injury';
    if (normalized === 'human death') return 'human_death';
    // Keep category aligned with existing DB enum values.
    // Store specific loss text in description.
    return 'property';
}

function stableHex32(input: string): string {
    function fnv1a32(s: string): number {
        let h = 2166136261;
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }
    const h1 = fnv1a32(input).toString(16).padStart(8, '0');
    const h2 = fnv1a32(input + '\x00').toString(16).padStart(8, '0');
    const h3 = fnv1a32(input + '\x00\x00').toString(16).padStart(8, '0');
    const h4 = fnv1a32(input + '\x00\x00\x00').toString(16).padStart(8, '0');
    return `${h1}${h2}${h3}${h4}`;
}

function stableUuidFrom(input: string): string {
    const hex = stableHex32(input);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export async function syncData() {
    // Mutex guard prevents concurrent syncs in this tab
    if (isSyncing) {
        logger.log('[SyncService] Sync already in progress, skipping');
        return { success: true, count: 0, message: 'Sync already in progress' };
    }

    if (!await tryAcquireCrossTabSyncLock()) {
        logger.log('[SyncService] Sync locked by another tab, skipping');
        return { success: true, count: 0, message: 'Sync already in progress in another tab' };
    }

    isSyncing = true;
    let successCount = 0;
    let failureCount = 0;

    try {
        // Verify user is authenticated before syncing
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return { success: false, error: 'Not authenticated' };
        }

        // Automatically include failed reports in sync for retry mechanism
        const statuses: Array<'pending' | 'failed'> = ['pending', 'failed'];
        const reportsToSync = await db.reports
            .where('sync_status')
            .anyOf(statuses)
            .toArray();

        if (reportsToSync.length === 0) {
            return { success: true, count: 0 };
        }

        for (const report of reportsToSync) {
            try {
                // Validate user_id matches authenticated user
                if (report.user_id !== user.id) {
                    await db.reports.update(report.id, { sync_status: 'failed' });
                    failureCount++;
                    continue;
                }

                // Validate report ID format for path safety
                if (!isSafeId(report.id)) {
                    await db.reports.update(report.id, { sync_status: 'failed' });
                    failureCount++;
                    continue;
                }

                // Build PostGIS POINT from lat/lng
                const location = report.latitude != null && report.longitude != null
                    ? `POINT(${report.longitude} ${report.latitude})`
                    : null;

                // 1. Upsert to `reports` table
                const { error: reportError } = await supabase
                    .from('reports')
                    .upsert({
                        id: report.id,
                        user_id: report.user_id,
                        beat_id: report.beat_id,
                        device_timestamp: report.device_timestamp,
                        location: location ? `SRID=4326;${location}` : null,
                        notes: report.notes,
                    });

                if (reportError) {
                    logger.error('[SyncService] Report upsert error:', reportError);
                    await db.reports.update(report.id, { sync_status: 'failed' });
                    failureCount++;
                    continue;
                }

                // 2. Upsert to `observations` table
                if (report.observation_type) {
                    const typeMapping: Record<string, string> = {
                        'direct': 'direct_sighting',
                        'indirect': 'indirect_sign',
                        'loss': 'conflict_loss',
                    };

                    // Use pre-generated stable UUID from Dexie (set at report-save time) for idempotency
                    const obsId = report.obs_id ?? stableUuidFrom(`${report.id}:obs`);

                    // Calculate total elephants from individual counts
                    const totalElephants = (report.male_count ?? 0) +
                                          (report.female_count ?? 0) +
                                          (report.calf_count ?? 0) +
                                          (report.unknown_count ?? 0);

                    const { error: obsError } = await supabase
                        .from('observations')
                        .upsert({
                            id: obsId,
                            report_id: report.id,
                            type: typeMapping[report.observation_type] || report.observation_type,
                            male_count: report.male_count ?? 0,
                            female_count: report.female_count ?? 0,
                            calf_count: report.calf_count ?? 0,
                            unknown_count: report.unknown_count ?? 0,
                            total_elephants: totalElephants,
                            compass_bearing: report.compass_bearing,
                            indirect_sign_details: normalizeTextArray(report.indirect_sign_details),
                            conflict_loss_details: normalizeTextArray(report.conflict_loss_details ?? report.loss_type),
                        });

                    if (obsError) {
                        logger.error('[SyncService] observations upsert error:', obsError);
                        await db.reports.update(report.id, { sync_status: 'failed' });
                        failureCount++;
                        continue;
                    }
                }

                // 3. Upsert to `conflict_damages` if applicable
                if (report.loss_type && report.loss_type.length > 0) {
                    const rows = report.loss_type.map((loss, idx) => ({
                        id: stableUuidFrom(`${report.id}:${idx}:${loss}`),
                        report_id: report.id,
                        category: mapLossCategory(loss),
                        description: loss,
                    }));

                    const { error: damageError } = await supabase
                        .from('conflict_damages')
                        .upsert(rows);

                    // If duplicates already exist for this report, continue gracefully.
                    if (damageError && damageError.code !== '23505') {
                        logger.error('[SyncService] conflict_damages insert error:', damageError);
                        await db.reports.update(report.id, { sync_status: 'failed' });
                        failureCount++;
                        continue;
                    }
                }

                // 4. Upload media if exists
                const mediaFiles = await db.report_media
                    .where('report_id')
                    .equals(report.id)
                    .toArray();

                let hasMediaError = false;
                for (const media of mediaFiles) {
                    const normalizedMimeType = normalizeMimeType(media.mime_type);
                    // Validate media ID and MIME type
                    if (!isSafeId(media.id)) {
                        logger.error('[SyncService] Unsafe media ID:', media.id);
                        hasMediaError = true;
                        break;
                    }

                    if (!ALLOWED_MIME_TYPES.includes(normalizedMimeType)) {
                        logger.error('[SyncService] Unsupported MIME type:', media.mime_type);
                        hasMediaError = true;
                        break;
                    }

                    const fileBuffer = base64ToArrayBuffer(media.file_data);

                    // Determine extension from mime type
                    const ext = mimeTypeToExtension(normalizedMimeType);
                    const fileName = `${report.id}/${media.id}.${ext}`;

                    const { error: storageError } = await supabase.storage
                        .from('report_media')
                        .upload(fileName, fileBuffer, { contentType: normalizedMimeType, upsert: true });

                    if (storageError) {
                        logger.error('[SyncService] storage upload error for report', report.id, 'media', media.id, ':', storageError);
                        hasMediaError = true;
                        break;
                    }
                    // Verify report exists before inserting media (required by RLS policy)
                    const { data: reportCheck, error: reportCheckError } = await supabase
                        .from('reports')
                        .select('id, user_id')
                        .eq('id', report.id)
                        .single();

                    if (reportCheckError || !reportCheck) {
                        logger.error('[SyncService] Report not found before media insert:', report.id, reportCheckError);
                        hasMediaError = true;
                        break;
                    }

                    const mediaInsertResult = await insertReportMedia({
                        mediaId: media.id,
                        reportId: report.id,
                        fileName,
                    });

                    if (!mediaInsertResult.success) {
                        logger.error('[SyncService] report_media table error', {
                            reportId: report.id,
                            mediaId: media.id,
                            error: mediaInsertResult.error,
                            reportCheck,
                            userId: user.id,
                        });
                        hasMediaError = true;
                        break;
                    }
                    await db.report_media.update(media.id, { sync_status: 'synced' });
                }

                if (hasMediaError) {
                    logger.error('[SyncService] media upload error');
                    await db.reports.update(report.id, { sync_status: 'failed' });
                    failureCount++;
                    continue;
                }

                await db.reports.update(report.id, { sync_status: 'synced' });
                successCount++;

            } catch (err) {
                logger.error('[SyncService] Unexpected error syncing report:', err);
                await db.reports.update(report.id, { sync_status: 'failed' });
                failureCount++;
            }
        }

        return {
            success: failureCount === 0,
            count: successCount,
            total: reportsToSync.length,
            failed: failureCount
        };
    } catch (error) {
        return { success: false, error };
    } finally {
        isSyncing = false;
        releaseCrossTabSyncLock();
    }
}
