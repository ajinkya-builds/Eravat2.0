import { supabase } from '../supabase';

export type GeoMatch = {
    beat_id: string | null;
    beat_name: string | null;
    range_id: string | null;
    range_name: string | null;
    division_id: string | null;
    division_name: string | null;
};

const POINT_CACHE_KEY = 'eravat_geo_point_cache_v1';
const POINT_CACHE_MAX = 80;

type PointCache = Record<string, GeoMatch>;

function pointKey(lat: number, lng: number): string {
    return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

function readPointCache(): PointCache {
    try {
        const raw = localStorage.getItem(POINT_CACHE_KEY);
        if (raw) return JSON.parse(raw) as PointCache;
    } catch {
        /* ignore */
    }
    return {};
}

function writePointCache(cache: PointCache): void {
    try {
        const keys = Object.keys(cache);
        if (keys.length > POINT_CACHE_MAX) {
            for (const k of keys.slice(0, keys.length - POINT_CACHE_MAX)) {
                delete cache[k];
            }
        }
        localStorage.setItem(POINT_CACHE_KEY, JSON.stringify(cache));
    } catch {
        /* ignore */
    }
}

export function readCachedGeoFromPoint(lat: number, lng: number): GeoMatch | null {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return readPointCache()[pointKey(lat, lng)] ?? null;
}

export function cacheGeoFromPoint(lat: number, lng: number, match: GeoMatch): void {
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !match.division_id) return;
    const cache = readPointCache();
    cache[pointKey(lat, lng)] = match;
    writePointCache(cache);
}

export async function lookupGeoFromPoint(lat: number, lng: number): Promise<GeoMatch | null> {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    const cached = readCachedGeoFromPoint(lat, lng);
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (offline) return cached;

    try {
        const { data, error } = await supabase.rpc('lookup_geo_from_point', {
            p_lng: lng,
            p_lat: lat,
        });
        if (error || !data?.length) return cached;
        const row = data[0] as GeoMatch;
        const match: GeoMatch = {
            beat_id: row.beat_id ?? null,
            beat_name: row.beat_name ?? null,
            range_id: row.range_id ?? null,
            range_name: row.range_name ?? null,
            division_id: row.division_id ?? null,
            division_name: row.division_name ?? null,
        };
        cacheGeoFromPoint(lat, lng, match);
        return match;
    } catch {
        return cached;
    }
}
