import Dexie, { type Table } from 'dexie';

/**
 * LocalReport mirrors the `reports` + `observations` tables in Supabase.
 * We store a flat version locally for offline-first support, then map to
 * the normalized schema on sync.
 */
export interface LocalReport {
  id: string;
  user_id: string | null;
  division_id: string | null;
  range_id: string | null;
  beat_id: string | null;

  // Location stored as lat/lng locally; converted to PostGIS on sync
  latitude: number | null;
  longitude: number | null;

  // Timing
  device_timestamp: string;
  activity_date: string;
  activity_time: string;

  // Observation details (maps to `observations` table on sync)
  observation_type: 'direct' | 'indirect' | 'loss' | null;
  male_count: number;
  total_elephants: number;
  female_count: number;
  calf_count: number;
  unknown_count: number;
  compass_bearing: number | null;
  indirect_sign_details: string[];
  conflict_loss_details: string[];

  // Conflict damage (maps to `conflict_damages` table)
  loss_type: string[];
  damage_description?: string;
  damage_value?: number | null;
  report_damage_manually?: boolean;
  /** People count for injury/death rows; default 1 on sync. */
  affected_people?: number;

  // Photo (maps to `report_media` on sync)
  photo_url: string | null;

  // Offline sync fields
  obs_id: string | null;     // stable UUID for the corresponding observations row
  notes: string | null;
  status: string;
  sync_status: 'pending' | 'synced' | 'failed';
}

export interface LocalMedia {
  id: string;
  report_id: string;
  mime_type: string;
  file_data: string; // base64
  sync_status: 'pending' | 'synced' | 'failed';
}

export type SyncStatus = 'pending' | 'synced' | 'failed';

/** Villager (Hathi Mitra alert recipient) queued for upload when offline. */
export interface PendingVillager {
  id: string;
  name: string;
  mobile: string;
  latitude: number;
  longitude: number;
  village_name: string;
  village_id: string | null;
  division_id: string | null;
  range_id: string | null;
  created_by: string;
  alert_opt_in: boolean;
  is_active: boolean;
  notes: string | null;
  device_timestamp: string;
  sync_status: SyncStatus;
  last_error?: string | null;
}

/** Volunteer (Hathi Mitra app user) queued for create-user edge function when offline. */
export interface PendingVolunteer {
  id: string;
  full_name: string;
  phone: string;
  latitude: number;
  longitude: number;
  division_id: string | null;
  range_id: string | null;
  beat_id: string | null;
  created_by: string;
  device_timestamp: string;
  sync_status: SyncStatus;
  last_error?: string | null;
}

export class EravatDatabase extends Dexie {
  reports!: Table<LocalReport>;
  report_media!: Table<LocalMedia>;
  pending_villagers!: Table<PendingVillager>;
  pending_volunteers!: Table<PendingVolunteer>;

  constructor() {
    super('EravatDB');
    this.version(2).stores({
      reports: 'id, sync_status, device_timestamp, beat_id',
      report_media: 'id, report_id, sync_status',
    });
    // Version 3 adds obs_id column (no store change needed, just schema bump)
    this.version(3).stores({
      reports: 'id, sync_status, device_timestamp, beat_id',
      report_media: 'id, report_id, sync_status',
    });
    this.version(4).stores({
      reports: 'id, sync_status, device_timestamp, beat_id',
      report_media: 'id, report_id, sync_status',
    });
    this.version(5).stores({
      reports: 'id, sync_status, device_timestamp, beat_id',
      report_media: 'id, report_id, sync_status',
      pending_villagers: 'id, sync_status, device_timestamp',
      pending_volunteers: 'id, sync_status, device_timestamp',
    });
  }
}

export const db = new EravatDatabase();