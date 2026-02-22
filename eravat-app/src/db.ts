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

  // Observation details (maps to `observations` table on sync)
  observation_type: 'direct' | 'indirect' | 'loss' | null;
  male_count: number;
  female_count: number;
  calf_count: number;
  unknown_count: number;
  compass_bearing: number | null;
  indirect_sign_details: string[];

  // Conflict damage (maps to `conflict_damages` table)
  loss_type: string[];

  // Photo (maps to `report_media` on sync)
  photo_url: string | null;

  // Local sync fields
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

export class EravatDatabase extends Dexie {
  reports!: Table<LocalReport>;
  report_media!: Table<LocalMedia>;

  constructor() {
    super('EravatDB');
    this.version(2).stores({
      reports: 'id, sync_status, device_timestamp, beat_id',
      report_media: 'id, report_id, sync_status',
    });
  }
}

export const db = new EravatDatabase();