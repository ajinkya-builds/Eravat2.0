import { db } from '../db';
import { supabase } from '../supabase';

export async function syncData() {
    try {
        const pendingReports = await db.reports
            .where('sync_status')
            .equals('pending')
            .toArray();

        if (pendingReports.length === 0) {
            console.log('No pending reports to sync.');
            return { success: true, count: 0 };
        }

        console.log(`Found ${pendingReports.length} reports to sync.`);

        for (const report of pendingReports) {
            try {
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
                        status: 'pending', // sync_status enum on server
                    });

                if (reportError) {
                    console.error(`Error syncing report ${report.id}:`, reportError);
                    await db.reports.update(report.id, { sync_status: 'failed' });
                    continue;
                }

                // 2. Upsert to `observations` table
                if (report.observation_type) {
                    // Map local types to database enum values
                    const typeMapping: Record<string, string> = {
                        'direct': 'direct_sighting',
                        'indirect': 'indirect_sign',
                        'loss': 'conflict_loss',
                    };

                    const { error: obsError } = await supabase
                        .from('observations')
                        .upsert({
                            id: crypto.randomUUID(),
                            report_id: report.id,
                            type: typeMapping[report.observation_type] || report.observation_type,
                            male_count: report.male_count ?? 0,
                            female_count: report.female_count ?? 0,
                            calf_count: report.calf_count ?? 0,
                            unknown_count: report.unknown_count ?? 0,
                            compass_bearing: report.compass_bearing,
                            indirect_sign_details: report.indirect_sign_details, // Now an array
                        });

                    if (obsError) {
                        console.error(`Error syncing observation for report ${report.id}:`, obsError);
                        // If observation fails, we should probably not mark the report as synced
                        // so it can be retried.
                        await db.reports.update(report.id, { sync_status: 'failed' });
                        continue; 
                    }
                }

                // 3. Upsert to `conflict_damages` if applicable
                if (report.loss_type && report.loss_type.length > 0) {
                    for (const loss of report.loss_type) {
                        let category = 'property';
                        if (loss === 'No loss') category = 'none';
                        else if (loss === 'crop') category = 'crop';
                        else if (loss === 'livestock') category = 'livestock';

                        await supabase.from('conflict_damages').upsert({
                            report_id: report.id,
                            category: category,
                            description: loss,
                        });
                    }
                }

                // 4. Upload media if exists
                const mediaFiles = await db.report_media
                    .where('report_id')
                    .equals(report.id)
                    .toArray();

                let hasMediaError = false;
                for (const media of mediaFiles) {
                    const response = await fetch(`data:${media.mime_type};base64,${media.file_data}`);
                    const blob = await response.blob();
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
                    await db.reports.update(report.id, { sync_status: 'failed' });
                    continue;
                }

                await db.reports.update(report.id, { sync_status: 'synced' });

            } catch (reportErr) {
                console.error(`Unexpected error for report ${report.id}:`, reportErr);
                await db.reports.update(report.id, { sync_status: 'failed' });
            }
        }

        return { success: true, count: pendingReports.length };
    } catch (error) {
        console.error('Core sync error:', error);
        return { success: false, error };
    }
}
