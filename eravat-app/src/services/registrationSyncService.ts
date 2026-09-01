import { db } from '../db';
import { supabase } from '../supabase';
import { ensureVillageId, isUniqueMobileError } from '../lib/villagerRegistry';
import type { VillageOption } from '../components/villagers/VillageAutocomplete';
import { logger } from '../lib/logger';
import { track } from '../lib/analytics';
import { newUuid } from '../lib/uuid';

export async function countPendingRegistrations(): Promise<number> {
    const [v, vol] = await Promise.all([
        db.pending_villagers.where('sync_status').anyOf(['pending', 'failed']).count(),
        db.pending_volunteers.where('sync_status').anyOf(['pending', 'failed']).count(),
    ]);
    return v + vol;
}

export async function queuePendingVillager(args: {
    name: string;
    mobile: string;
    latitude: number;
    longitude: number;
    villageName: string;
    selectedVillage: VillageOption | null;
    divisionId: string | null;
    rangeId: string | null;
    createdBy: string;
    alertOptIn: boolean;
    isActive: boolean;
    notes: string | null;
}): Promise<string> {
    const id = newUuid();
    await db.pending_villagers.add({
        id,
        name: args.name.trim(),
        mobile: args.mobile,
        latitude: args.latitude,
        longitude: args.longitude,
        village_name: args.villageName.trim(),
        village_id: args.selectedVillage?.id ?? null,
        division_id: args.divisionId,
        range_id: args.rangeId,
        created_by: args.createdBy,
        alert_opt_in: args.alertOptIn,
        is_active: args.isActive,
        notes: args.notes,
        device_timestamp: new Date().toISOString(),
        sync_status: 'pending',
    });
    track('villager.queued_offline');
    return id;
}

export async function queuePendingVolunteer(args: {
    fullName: string;
    phone: string;
    latitude: number;
    longitude: number;
    divisionId: string | null;
    rangeId: string | null;
    beatId: string | null;
    createdBy: string;
}): Promise<string> {
    const id = newUuid();
    await db.pending_volunteers.add({
        id,
        full_name: args.fullName.trim(),
        phone: args.phone,
        latitude: args.latitude,
        longitude: args.longitude,
        division_id: args.divisionId,
        range_id: args.rangeId,
        beat_id: args.beatId,
        created_by: args.createdBy,
        device_timestamp: new Date().toISOString(),
        sync_status: 'pending',
    });
    track('volunteer.queued_offline');
    return id;
}

export async function syncPendingRegistrations(_reason = 'manual'): Promise<{
    villagers: number;
    volunteers: number;
    failed: number;
}> {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) {
        return { villagers: 0, volunteers: 0, failed: 0 };
    }

    let villagers = 0;
    let volunteers = 0;
    let failed = 0;

    const pendingVillagers = await db.pending_villagers
        .where('sync_status')
        .anyOf(['pending', 'failed'])
        .toArray();

    for (const row of pendingVillagers) {
        if (row.created_by !== user.id) {
            await db.pending_villagers.update(row.id, { sync_status: 'failed', last_error: 'auth_mismatch' });
            failed++;
            continue;
        }
        try {
            const selectedVillage = row.village_id
                ? ({ id: row.village_id, name: row.village_name, division_id: row.division_id } as VillageOption)
                : null;
            const villageId = await ensureVillageId(row.village_name, selectedVillage, row.division_id);
            const { error: insertErr } = await supabase.from('villagers').insert({
                name: row.name,
                mobile: row.mobile,
                latitude: row.latitude,
                longitude: row.longitude,
                village_id: villageId,
                division_id: row.division_id,
                range_id: row.range_id,
                created_by: row.created_by,
                alert_opt_in: row.alert_opt_in,
                is_active: row.is_active,
                notes: row.notes,
            });
            if (insertErr) {
                if (isUniqueMobileError(insertErr)) {
                    await db.pending_villagers.update(row.id, { sync_status: 'synced', last_error: 'duplicate_mobile' });
                    villagers++;
                    continue;
                }
                throw insertErr;
            }
            await db.pending_villagers.update(row.id, { sync_status: 'synced', last_error: null });
            villagers++;
        } catch (err) {
            logger.error('RegistrationSync', 'villager sync failed', err, { id: row.id });
            await db.pending_villagers.update(row.id, {
                sync_status: 'failed',
                last_error: err instanceof Error ? err.message : 'sync_failed',
            });
            failed++;
        }
    }

    const pendingVolunteers = await db.pending_volunteers
        .where('sync_status')
        .anyOf(['pending', 'failed'])
        .toArray();

    for (const row of pendingVolunteers) {
        if (row.created_by !== user.id) {
            await db.pending_volunteers.update(row.id, { sync_status: 'failed', last_error: 'auth_mismatch' });
            failed++;
            continue;
        }
        try {
            const accessToken = session?.access_token;
            if (!accessToken) throw new Error('Not authenticated');

            const { data, error: fnErr } = await supabase.functions.invoke('create-user', {
                body: {
                    role: 'volunteer',
                    full_name: row.full_name,
                    phone: row.phone,
                    latitude: row.latitude,
                    longitude: row.longitude,
                    onboard_volunteer: true,
                    division_id: row.division_id,
                    range_id: row.range_id,
                    beat_id: row.beat_id,
                },
                headers: { Authorization: `Bearer ${accessToken}` },
            });

            if (fnErr) throw fnErr;
            if (data?.error) throw new Error(String(data.error));

            await db.pending_volunteers.update(row.id, { sync_status: 'synced', last_error: null });
            volunteers++;
        } catch (err) {
            logger.error('RegistrationSync', 'volunteer sync failed', err, { id: row.id });
            await db.pending_volunteers.update(row.id, {
                sync_status: 'failed',
                last_error: err instanceof Error ? err.message : 'sync_failed',
            });
            failed++;
        }
    }

    if (villagers + volunteers > 0) {
        track('registration.sync_completed', { villagers, volunteers, failed });
    }

    return { villagers, volunteers, failed };
}
