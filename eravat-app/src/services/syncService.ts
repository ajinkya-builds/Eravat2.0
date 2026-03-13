import { db } from '../db';
import { supabase } from '../supabase';

let isSyncing = false;
let mediaPathColumnHint: 'file_path' | 'storage_path' | 'path' | 'media_path' | 'object_path' | null = null;

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

type MediaInsertResult = { success: true; row: unknown } | { success: false; error: unknown };

async function insertReportMediaWithFallback(args: {
    mediaId: string;
    reportId: string;
    fileName: string;
}): Promise<MediaInsertResult> {
    const { mediaId, reportId, fileName } = args;

    // Your live schema lacks both content_type and mime_type.
    // Insert only safe/common columns and try path variants.
    const pathColumns: Array<'file_path' | 'storage_path' | 'path' | 'media_path' | 'object_path'> = [
        'file_path', 'storage_path', 'path', 'media_path', 'object_path',
    ];
    const orderedColumns = mediaPathColumnHint
        ? [mediaPathColumnHint, ...pathColumns.filter((c) => c !== mediaPathColumnHint)]
        : pathColumns;

    const attempts: Record<string, unknown>[] = orderedColumns.flatMap((column) => ([
        { id: mediaId, report_id: reportId, [column]: fileName },
        { report_id: reportId, [column]: fileName },
    ]));

    let firstError: unknown = null;
    for (const payload of attempts) {
        // Avoid `.select()` on insert so success doesn't depend on SELECT policies.
        const { error } = await supabase
            .from('report_media')
            .insert(payload);

        if (!error) {
            const keys = Object.keys(payload);
            mediaPathColumnHint = (keys.find((k) => ['file_path', 'storage_path', 'path', 'media_path', 'object_path'].includes(k)) as typeof mediaPathColumnHint) ?? mediaPathColumnHint;
            return { success: true, row: payload };
        }

        if (!firstError) {
            firstError = error;
        }

        // If this is not a schema-column error, bubble it immediately.
        const code = (error as { code?: string })?.code;
        if (code !== 'PGRST204') {
            return { success: false, error };
        }
    }

    return { success: false, error: firstError };
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
    // Keep category aligned with existing DB enum values.
    // Store specific loss text in description.
    return 'property';
}

function stableHex32(input: string): string {
    let hash = 2166136261;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    const h1 = (hash >>> 0).toString(16).padStart(8, '0');
    const h2 = Math.imul(hash ^ 0x9e3779b1, 2246822519) >>> 0;
    const h3 = Math.imul(hash ^ 0x85ebca6b, 3266489917) >>> 0;
    const h4 = Math.imul(hash ^ 0xc2b2ae35, 668265263) >>> 0;
    return `${h1}${h2.toString(16).padStart(8, '0')}${h3.toString(16).padStart(8, '0')}${h4.toString(16).padStart(8, '0')}`.slice(0, 32);
}

function stableUuidFrom(input: string): string {
    const hex = stableHex32(input);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export async function syncData(options?: { includeFailed?: boolean }) {
    // Mutex guard prevents concurrent syncs
    if (isSyncing) {
        return { success: true, count: 0 };
    }

    isSyncing = true;
    try {
        // Verify user is authenticated before syncing
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return { success: false, error: 'Not authenticated' };
        }

        // By default sync only pending reports to avoid noisy endless retries.
        const statuses: Array<'pending' | 'failed'> = options?.includeFailed ? ['pending', 'failed'] : ['pending'];
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
                    continue;
                }

                // Validate report ID format for path safety
                if (!isSafeId(report.id)) {
                    await db.reports.update(report.id, { sync_status: 'failed' });
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
                        status: 'pending',
                    });

                if (reportError) {
                    console.error('[SyncService] Report upsert error:', reportError);
                    await db.reports.update(report.id, { sync_status: 'failed' });
                    continue;
                }

                // 2. Upsert to `observations` table
                if (report.observation_type) {
                    const typeMapping: Record<string, string> = {
                        'direct': 'direct_sighting',
                        'indirect': 'indirect_sign',
                        'loss': 'conflict_loss',
                    };

                    // Use pre-generated stable UUID from Dexie (set at report-save time).
                    // Fall back to a fresh UUID for legacy records without obs_id.
                    const obsId = report.obs_id ?? crypto.randomUUID();

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
                            compass_bearing: report.compass_bearing,
                            indirect_sign_details: normalizeTextArray(report.indirect_sign_details),
                            conflict_loss_details: normalizeTextArray(report.conflict_loss_details ?? report.loss_type),
                        });

                    if (obsError) {
                        console.error('[SyncService] observations upsert error:', obsError);
                        // Leave report in 'pending' so it can be retried (no 'failed' enum value in DB)
                        await db.reports.update(report.id, { sync_status: 'failed' });
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
                        console.error('[SyncService] conflict_damages insert error:', damageError);
                        await db.reports.update(report.id, { sync_status: 'failed' });
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
                        console.error('[SyncService] Unsafe media ID:', media.id);
                        hasMediaError = true;
                        break;
                    }

                    if (!ALLOWED_MIME_TYPES.includes(normalizedMimeType)) {
                        console.error('[SyncService] Unsupported MIME type:', media.mime_type);
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
                        console.error('[SyncService] storage upload error for report', report.id, 'media', media.id, ':', storageError);
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
                        console.error('[SyncService] Report not found before media insert:', report.id, reportCheckError);
                        hasMediaError = true;
                        break;
                    }

                    const mediaInsertResult = await insertReportMediaWithFallback({
                        mediaId: media.id,
                        reportId: report.id,
                        fileName,
                    });

                    if (!mediaInsertResult.success) {
                        console.error('[SyncService] report_media table error for report', report.id, 'media', media.id);
                        console.error('[SyncService] Error details:', JSON.stringify(mediaInsertResult.error, null, 2));
                        console.error('[SyncService] Report check result:', reportCheck);
                        console.error('[SyncService] User ID:', user.id);
                        hasMediaError = true;
                        break;
                    }
                    await db.report_media.update(media.id, { sync_status: 'synced' });
                }

                if (hasMediaError) {
                    console.error('[SyncService] media upload error');
                    await db.reports.update(report.id, { sync_status: 'failed' });
                    continue;
                }

                await db.reports.update(report.id, { sync_status: 'synced' });

            } catch {
                await db.reports.update(report.id, { sync_status: 'failed' });
            }
        }

        return { success: true, count: reportsToSync.length };
    } catch (error) {
        return { success: false, error };
    } finally {
        isSyncing = false;
    }
}
