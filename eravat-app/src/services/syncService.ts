import { db } from '../db';
import { supabase } from '../supabase';

let isSyncing = false;

// Validate that an ID is a safe UUID or prefixed-UUID format (no path traversal)
const SAFE_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
function isSafeId(id: string): boolean {
    return SAFE_ID_REGEX.test(id) && !id.includes('..');
}

// Allowed MIME types for media uploads
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export async function syncData() {
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

        // Retry failed reports in addition to pending ones
        const pendingReports = await db.reports
            .where('sync_status')
            .anyOf(['pending', 'failed'])
            .toArray();

        if (pendingReports.length === 0) {
            return { success: true, count: 0 };
        }

        for (const report of pendingReports) {
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

                    // Deterministic observation ID based on report_id
                    const obsId = `obs-${report.id}`;

                    const { error: obsError } = await supabase
                        .from('observations')
                        .upsert({
                            id: obsId,
                            report_id: report.id,
                            type: typeMapping[report.observation_type] || report.observation_type,
                            total_elephants: report.total_elephants ?? 0,
                            male_count: report.male_count ?? 0,
                            female_count: report.female_count ?? 0,
                            calf_count: report.calf_count ?? 0,
                            unknown_count: report.unknown_count ?? 0,
                            compass_bearing: report.compass_bearing,
                            indirect_sign_details: report.indirect_sign_details,
                        });

                    if (obsError) {
                        await supabase.from('reports').update({ status: 'failed' }).eq('id', report.id);
                        await db.reports.update(report.id, { sync_status: 'failed' });
                        continue;
                    }
                }

                // 3. Upsert to `conflict_damages` if applicable
                if (report.loss_type && report.loss_type.length > 0) {
                    let hasDamageError = false;
                    for (let i = 0; i < report.loss_type.length; i++) {
                        const loss = report.loss_type[i];
                        let category = 'property';
                        if (loss === 'No loss') category = 'none';
                        else if (loss === 'crop') category = 'crop';
                        else if (loss === 'livestock') category = 'livestock';

                        const { error: damageError } = await supabase.from('conflict_damages').upsert({
                            id: `dmg-${report.id}-${i}`,
                            report_id: report.id,
                            category: category,
                            description: loss,
                        });

                        if (damageError) {
                            hasDamageError = true;
                            break;
                        }
                    }

                    if (hasDamageError) {
                        await supabase.from('reports').update({ status: 'failed' }).eq('id', report.id);
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
                    // Validate media ID and MIME type
                    if (!isSafeId(media.id)) {
                        hasMediaError = true;
                        break;
                    }

                    if (!ALLOWED_MIME_TYPES.includes(media.mime_type)) {
                        hasMediaError = true;
                        break;
                    }

                    const response = await fetch(`data:${media.mime_type};base64,${media.file_data}`);
                    const blob = await response.blob();

                    // Use sanitized path: reportId/mediaId.jpg
                    const fileName = `${report.id}/${media.id}.jpg`;

                    const { error: storageError } = await supabase.storage
                        .from('report_media')
                        .upload(fileName, blob, { contentType: media.mime_type, upsert: true });

                    if (storageError) {
                        hasMediaError = true;
                        break;
                    }

                    await supabase.from('report_media').upsert({
                        id: media.id,
                        report_id: report.id,
                        file_path: fileName,
                        content_type: media.mime_type,
                    });

                    await db.report_media.update(media.id, { sync_status: 'synced' });
                }

                if (hasMediaError) {
                    await supabase.from('reports').update({ status: 'failed' }).eq('id', report.id);
                    await db.reports.update(report.id, { sync_status: 'failed' });
                    continue;
                }

                await db.reports.update(report.id, { sync_status: 'synced' });

            } catch {
                await db.reports.update(report.id, { sync_status: 'failed' });
            }
        }

        return { success: true, count: pendingReports.length };
    } catch (error) {
        return { success: false, error };
    } finally {
        isSyncing = false;
    }
}
