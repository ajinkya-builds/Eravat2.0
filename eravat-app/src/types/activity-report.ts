export type UserRole = 'dfo' | 'range_officer' | 'beat_guard' | 'rrt' | 'ccf' | 'biologist' | 'veterinarian' | 'admin' | 'volunteer';
export type UserPosition = 'DFO' | 'Range Officer' | 'Beat Guard' | 'Response Team' | 'Conservator' | 'Biologist' | 'Veterinarian' | 'Admin' | 'Volunteer';
export type ObservationType = 'direct' | 'indirect' | 'loss';
export type LossType = 'No loss' | 'property' | 'crop' | 'livestock' | 'fencing' | 'solar panels' | 'FD establishment' | 'Other';
export type IndirectSightingType = 'Pugmark' | 'Dung' | 'Broken Branches' | 'Sound' | 'Eyewitness';

export interface ActivityReport {
    id: string;
    user_id: string;
    activity_date: string; // ISO date string
    activity_time: string; // HH:MM
    latitude: number | null;
    longitude: number | null;

    // Geography
    division_id?: string;
    range_id?: string;
    beat_id?: string;

    observation_type: ObservationType | null;
    compass_bearing?: number;
    total_elephants?: number;
    male_elephants?: number;
    female_elephants?: number;
    unknown_elephants?: number;
    calves?: number;
    indirect_sighting_type?: IndirectSightingType;
    loss_type?: LossType;
    photo_url?: string;
    created_at?: string;
    updated_at?: string;
    sync_status?: 'pending' | 'synced' | 'failed';
}

export type ActivityReportInput = Omit<ActivityReport, 'id' | 'created_at' | 'updated_at'>;
