import { supabase } from '../supabase';
import { endOfDay, startOfDay } from 'date-fns';
import { Buffer } from 'buffer';
import wkx from 'wkx';
import type { SightingFact } from './edIntelligence';

export type ObsTypeNorm = 'direct' | 'indirect' | 'loss';

export type DamageCategory =
    | 'human_death'
    | 'human_injury'
    | 'crop'
    | 'property'
    | 'livestock'
    | 'grain';

export interface GeoDivision {
    id: string;
    name: string;
    code?: string | null;
}

export interface AdminFilters {
    divisionId?: string | null;
    startDate: Date;
    endDate: Date;
}

export interface AdminReportRow {
    id: string;
    user_id: string | null;
    device_timestamp: string;
    beat_id: string | null;
    location?: unknown;
    geo_beats?: {
        name: string;
        geo_ranges?: {
            name: string;
            geo_divisions?: { id: string; name: string } | null;
        } | null;
    } | null;
    observations?: {
        type?: string;
        male_count?: number;
        female_count?: number;
        calf_count?: number;
        unknown_count?: number;
        indirect_sign_details?: string[];
        conflict_loss_details?: string[];
    }[];
    conflict_damages?: { category?: string; description?: string; affected_people?: number }[];
}

const REPORT_SELECT = `
    id,
    user_id,
    device_timestamp,
    beat_id,
    location,
    geo_beats (
        name,
        geo_ranges (
            name,
            geo_divisions ( id, name )
        )
    ),
    observations (
        type,
        male_count, female_count, calf_count, unknown_count,
        indirect_sign_details,
        conflict_loss_details
    ),
    conflict_damages ( category, description, affected_people )
`;

export function normalizeObsType(raw?: string, hasConflict = false): ObsTypeNorm {
    if (raw === 'direct_sighting' || raw === 'direct') return 'direct';
    if (raw === 'indirect_sign' || raw === 'indirect') return 'indirect';
    if (raw === 'conflict_loss' || raw === 'loss') return 'loss';
    return hasConflict ? 'loss' : 'direct';
}

export function elephantTotal(obs?: {
    male_count?: number;
    female_count?: number;
    calf_count?: number;
    unknown_count?: number;
}): number {
    if (!obs) return 0;
    return (obs.male_count ?? 0) + (obs.female_count ?? 0) + (obs.calf_count ?? 0) + (obs.unknown_count ?? 0);
}

export function reportDivisionId(report: AdminReportRow): string | null {
    return report.geo_beats?.geo_ranges?.geo_divisions?.id ?? null;
}

export function reportDivisionName(report: AdminReportRow): string {
    return report.geo_beats?.geo_ranges?.geo_divisions?.name ?? 'Unassigned';
}

export function mapDamageCategory(category: string): DamageCategory | 'other' {
    if (category === 'human_death') return 'human_death';
    if (category === 'human_injury') return 'human_injury';
    if (category === 'crop') return 'crop';
    if (category === 'property') return 'property';
    if (category === 'livestock') return 'livestock';
    if (/grain/i.test(category)) return 'grain';
    return 'other';
}

export function inferGrainDamage(report: AdminReportRow): boolean {
    const details = [
        ...(report.observations?.[0]?.conflict_loss_details ?? []),
        ...(report.conflict_damages?.map((d) => d.description ?? '') ?? []),
    ];
    return details.some((d) => /grain/i.test(d));
}

export async function fetchDivisions(): Promise<GeoDivision[]> {
    const { data, error } = await supabase
        .from('geo_divisions')
        .select('id, name, code')
        .order('name');
    if (error) throw error;
    return data ?? [];
}

export async function fetchAdminReports(filters: AdminFilters, limit = 2000): Promise<AdminReportRow[]> {
    const start = startOfDay(filters.startDate).toISOString();
    const end = endOfDay(filters.endDate).toISOString();
    const pageSize = 1000;
    const rows: AdminReportRow[] = [];

    for (let from = 0; from < limit; from += pageSize) {
        const to = Math.min(from + pageSize, limit) - 1;
        const { data, error } = await supabase
            .from('reports')
            .select(REPORT_SELECT)
            .gte('device_timestamp', start)
            .lte('device_timestamp', end)
            .order('device_timestamp', { ascending: false })
            .range(from, to);
        if (error) throw error;
        const chunk = (data as unknown as AdminReportRow[]) ?? [];
        rows.push(...chunk);
        if (chunk.length < to - from + 1) break;
    }

    if (!filters.divisionId) return rows;
    return rows.filter((r) => reportDivisionId(r) === filters.divisionId);
}

export interface DamageCounts {
    human_death: number;
    human_injury: number;
    crop: number;
    grain: number;
    property: number;
    livestock: number;
    total: number;
}

export function countDamages(reports: AdminReportRow[]): DamageCounts {
    const counts: DamageCounts = {
        human_death: 0,
        human_injury: 0,
        crop: 0,
        grain: 0,
        property: 0,
        livestock: 0,
        total: 0,
    };

    const grainReports = new Set<string>();

    for (const report of reports) {
        for (const damage of report.conflict_damages ?? []) {
            const cat = mapDamageCategory(damage.category ?? '');
            const people = Math.max(1, damage.affected_people ?? 1);
            counts.total++;
            if (cat === 'human_death') counts.human_death += people;
            else if (cat === 'human_injury') counts.human_injury += people;
            else if (cat === 'crop') counts.crop++;
            else if (cat === 'property') counts.property++;
            else if (cat === 'livestock') counts.livestock++;
            else if (cat === 'grain') counts.grain++;
        }
        if (inferGrainDamage(report)) grainReports.add(report.id);
    }

    counts.grain += grainReports.size;
    if (grainReports.size) {
        // Avoid double-counting grain inferred from text when category already counted
        counts.total += [...grainReports].filter((id) => {
            const r = reports.find((x) => x.id === id);
            return !(r?.conflict_damages ?? []).some((d) => mapDamageCategory(d.category ?? '') === 'grain');
        }).length;
    }

    return counts;
}

export interface DivisionSummaryRow {
    divisionId: string | null;
    divisionName: string;
    sightings: number;
    damages: number;
    personnel: number;
}

export async function fetchDivisionPersonnelCounts(): Promise<Record<string, number>> {
    const { data, error } = await supabase
        .from('user_region_assignments')
        .select('division_id, user_id');
    if (error) throw error;

    const map: Record<string, number> = {};
    for (const row of data ?? []) {
        if (!row.division_id) continue;
        map[row.division_id] = (map[row.division_id] ?? 0) + 1;
    }
    return map;
}

export function buildDivisionSummaries(
    reports: AdminReportRow[],
    personnelByDivision: Record<string, number>,
): DivisionSummaryRow[] {
    const map = new Map<string, DivisionSummaryRow>();

    for (const report of reports) {
        const divisionId = reportDivisionId(report);
        const divisionName = reportDivisionName(report);
        const key = divisionId ?? '__unassigned__';
        const obs = report.observations?.[0];
        const type = normalizeObsType(obs?.type, Boolean(report.conflict_damages?.length));

        if (!map.has(key)) {
            map.set(key, {
                divisionId,
                divisionName,
                sightings: 0,
                damages: 0,
                personnel: divisionId ? (personnelByDivision[divisionId] ?? 0) : 0,
            });
        }
        const entry = map.get(key)!;
        if (type === 'loss') entry.damages++;
        else entry.sightings++;
    }

    return [...map.values()].sort((a, b) => b.sightings + b.damages - (a.sightings + a.damages));
}

export interface LatestDivisionEntry {
    divisionId: string | null;
    divisionName: string;
    reportId: string;
    deviceTimestamp: string;
    elephantCount: number;
    beatName: string;
}

export function latestEntryPerDivision(reports: AdminReportRow[]): LatestDivisionEntry[] {
    const latest = new Map<string, LatestDivisionEntry>();

    for (const report of reports) {
        const divisionId = reportDivisionId(report);
        const key = divisionId ?? '__unassigned__';
        if (latest.has(key)) continue;

        const obs = report.observations?.[0];
        latest.set(key, {
            divisionId,
            divisionName: reportDivisionName(report),
            reportId: report.id,
            deviceTimestamp: report.device_timestamp,
            elephantCount: elephantTotal(obs),
            beatName: report.geo_beats?.name ?? '—',
        });
    }

    return [...latest.values()].sort((a, b) => a.divisionName.localeCompare(b.divisionName));
}

export function parseReportLocation(loc: unknown): { lat: number; lng: number } | null {
    if (!loc) return null;
    try {
        if (typeof loc === 'string') {
            const buf = Buffer.from(loc, 'hex');
            const geom = wkx.Geometry.parse(buf) as { toGeoJSON: () => { type?: string; coordinates?: number[] } };
            const gj = geom.toGeoJSON();
            if (gj?.type === 'Point' && Array.isArray(gj.coordinates)) {
                return { lat: gj.coordinates[1], lng: gj.coordinates[0] };
            }
            return null;
        }
        const obj = loc as { type?: string; coordinates?: number[] };
        if (obj.type === 'Point' && Array.isArray(obj.coordinates)) {
            return { lat: obj.coordinates[1], lng: obj.coordinates[0] };
        }
        if (Array.isArray(obj.coordinates)) {
            return { lat: obj.coordinates[1], lng: obj.coordinates[0] };
        }
        return null;
    } catch {
        return null;
    }
}

export async function fetchVillageCentroids(bbox?: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
}): Promise<{ name: string; latitude: number; longitude: number }[]> {
    const out: { name: string; latitude: number; longitude: number }[] = [];
    const pageSize = 1000;
    for (let from = 0; from < 8000; from += pageSize) {
        let q = supabase.from('village_centroids').select('name, latitude, longitude');
        if (bbox) {
            q = q
                .gte('latitude', bbox.minLat)
                .lte('latitude', bbox.maxLat)
                .gte('longitude', bbox.minLng)
                .lte('longitude', bbox.maxLng);
        }
        const { data, error } = await q.range(from, from + pageSize - 1);
        if (error) throw error;
        const chunk = data ?? [];
        out.push(...chunk);
        if (chunk.length < pageSize) break;
    }
    return out;
}

export async function fetchVillagerCoords(bbox?: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
}): Promise<{ lat: number; lng: number }[]> {
    const out: { lat: number; lng: number }[] = [];
    const pageSize = 1000;
    for (let from = 0; from < 4000; from += pageSize) {
        let q = supabase
            .from('villagers')
            .select('latitude, longitude')
            .eq('is_active', true)
            .not('latitude', 'is', null)
            .not('longitude', 'is', null);
        if (bbox) {
            q = q
                .gte('latitude', bbox.minLat)
                .lte('latitude', bbox.maxLat)
                .gte('longitude', bbox.minLng)
                .lte('longitude', bbox.maxLng);
        }
        const { data, error } = await q.range(from, from + pageSize - 1);
        if (error) throw error;
        const chunk = data ?? [];
        out.push(
            ...chunk
                .filter((r) => r.latitude != null && r.longitude != null)
                .map((r) => ({ lat: r.latitude as number, lng: r.longitude as number })),
        );
        if (chunk.length < pageSize) break;
    }
    return out;
}

export function reportsToSightingFacts(reports: AdminReportRow[]): SightingFact[] {
    return reports.map((report) => {
        const obs = report.observations?.[0];
        const coords = parseReportLocation(report.location);
        const damages = report.conflict_damages ?? [];
        const details = [
            ...(obs?.conflict_loss_details ?? []),
            ...damages.map((d) => d.description ?? ''),
        ].join(' ').toLowerCase();
        const hasGrain = /grain/.test(details) || damages.some((d) => /grain/i.test(d.category ?? ''));
        let deaths = 0;
        let injuries = 0;
        let crop = false;
        let house = false;
        for (const d of damages) {
            const cat = mapDamageCategory(d.category ?? '');
            const people = Math.max(1, d.affected_people ?? 1);
            if (cat === 'human_death') deaths += people;
            else if (cat === 'human_injury') injuries += people;
            else if (cat === 'crop' || cat === 'grain') crop = true;
            else if (cat === 'property' || cat === 'livestock') house = true;
        }
        const male = obs?.male_count ?? 0;
        const female = obs?.female_count ?? 0;
        const calf = obs?.calf_count ?? 0;
        const unknown = obs?.unknown_count ?? 0;
        return {
            id: report.id,
            at: new Date(report.device_timestamp),
            beat: report.geo_beats?.name ?? 'Unknown',
            range: report.geo_beats?.geo_ranges?.name ?? 'Unknown',
            division: reportDivisionName(report),
            lat: coords?.lat ?? null,
            lng: coords?.lng ?? null,
            male,
            female,
            calf,
            unknown,
            totalElephants: elephantTotal(obs),
            crop: crop || damages.some((d) => mapDamageCategory(d.category ?? '') === 'crop'),
            grain: hasGrain,
            house,
            deaths,
            injuries,
        };
    });
}

