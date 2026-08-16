import { supabase } from '../supabase';

export type GeoMatch = {
    beat_id: string | null;
    beat_name: string | null;
    range_id: string | null;
    range_name: string | null;
    division_id: string | null;
    division_name: string | null;
};

export async function lookupGeoFromPoint(lat: number, lng: number): Promise<GeoMatch | null> {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    try {
        const { data, error } = await supabase.rpc('lookup_geo_from_point', {
            p_lng: lng,
            p_lat: lat,
        });
        if (error || !data?.length) return null;
        const row = data[0] as GeoMatch;
        return {
            beat_id: row.beat_id ?? null,
            beat_name: row.beat_name ?? null,
            range_id: row.range_id ?? null,
            range_name: row.range_name ?? null,
            division_id: row.division_id ?? null,
            division_name: row.division_name ?? null,
        };
    } catch {
        return null;
    }
}
