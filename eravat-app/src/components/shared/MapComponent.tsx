import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../supabase';
import { useGeolocation } from '../../hooks/useGeolocation';
import { MapContainer, TileLayer, GeoJSON, Marker, Popup, useMap, CircleMarker, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Layers, Eye, AlertTriangle, Footprints, Maximize2, Minimize2, LocateFixed, Satellite, Map as MapIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { Buffer } from 'buffer';
import wkx from 'wkx';
import * as turf from '@turf/turf';
import { useLanguage } from '../../contexts/LanguageContext';
import { trackClick, trackFailed, trackFilter } from '../../lib/analytics';
import { RadiusSlider } from './RadiusSlider';

// ─── Custom Marker Icons ──────────────────────────────────────────────────────

const createIcon = (color: string, size = 14) => {
    return new L.DivIcon({
        className: 'custom-leaflet-marker',
        html: `<div style="
            background-color: ${color};
            width: ${size}px;
            height: ${size}px;
            border-radius: 50%;
            border: 2.5px solid white;
            box-shadow: 0 2px 6px rgba(0,0,0,0.45);
        "></div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2]
    });
};

const iconMap = {
    direct:   createIcon('hsl(152, 60%, 46%)', 16),   // emerald
    indirect: createIcon('hsl(38, 92%, 50%)', 14),    // amber
    loss:     createIcon('hsl(0, 84.2%, 60.2%)', 16), // red
    default:  createIcon('hsl(215.4, 16.3%, 46.9%)', 12)
};

const userIcon = new L.DivIcon({
    className: 'custom-leaflet-marker',
    html: `<div style="
        background-color: hsl(217, 91%, 60%);
        width: 16px; height: 16px; border-radius: 50%;
        border: 3px solid white; box-shadow: 0 0 0 4px hsla(217,91%,60%,0.35), 0 2px 6px rgba(0,0,0,0.45);
    "></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
});

// ─── Map helpers (children of MapContainer) ────────────────────────────────────

/** Fit the map to the union of the selected boundary, visible pins, and user location. */
function FitToData({
    geojsonData,
    pins,
    userLoc,
    fitKey,
}: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    geojsonData: any;
    pins: { lat: number; lng: number }[];
    userLoc: { lat: number; lng: number } | null;
    fitKey: string;
}) {
    const map = useMap();
    useEffect(() => {
        try {
            const bounds = L.latLngBounds([]);
            if (geojsonData) {
                const layer = L.geoJSON(geojsonData);
                if (layer.getBounds().isValid()) bounds.extend(layer.getBounds());
            }
            pins.forEach((p) => bounds.extend([p.lat, p.lng]));
            if (userLoc) bounds.extend([userLoc.lat, userLoc.lng]);
            if (bounds.isValid()) {
                map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
            }
        } catch (e) {
            console.error('Could not fit bounds', e);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fitKey]);
    return null;
}

/** Recompute leaflet size after container resize (e.g. fullscreen toggle). */
function MapResizer({ trigger }: { trigger: unknown }) {
    const map = useMap();
    useEffect(() => {
        const id = setTimeout(() => map.invalidateSize(), 250);
        return () => clearTimeout(id);
    }, [trigger, map]);
    return null;
}

// ─── Types ────────────────────────────────────────────────────────────────────

/** Legacy: allows callers to pass pre-parsed points. Deprecated in favour of internal fetch. */
export interface ReportPoint {
    id: string;
    lat: number;
    lng: number;
    type: 'direct' | 'indirect' | 'loss' | string;
    title: string;
    subtitle: string;
}

interface ObsPin {
    id: string;
    lat: number;
    lng: number;
    type: 'direct' | 'indirect' | 'loss';
    beatId: string | null;
    rangeId: string | null;
    divisionId: string | null;
    beatName: string;
    maleCount: number;
    femaleCount: number;
    calfCount: number;
    unknownCount: number;
    compassBearing?: number;
    indirectSigns?: string[];
    conflictLossDetails?: string[];
    hasDamage: boolean;
    deviceTimestamp: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse a PostGIS location value into lat/lng. Handles the common shapes returned
 * by PostgREST across environments: EWKB/WKB hex string, or a GeoJSON Point object.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseLocation(loc: any): { lat: number; lng: number } | null {
    if (!loc) return null;
    try {
        if (typeof loc === 'string') {
            const buf = Buffer.from(loc, 'hex');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const geom = wkx.Geometry.parse(buf) as any;
            const gj = geom.toGeoJSON();
            if (gj?.type === 'Point') return { lat: gj.coordinates[1], lng: gj.coordinates[0] };
            return null;
        }
        // GeoJSON object form
        if (loc.type === 'Point' && Array.isArray(loc.coordinates)) {
            return { lat: loc.coordinates[1], lng: loc.coordinates[0] };
        }
        if (Array.isArray(loc.coordinates)) {
            return { lat: loc.coordinates[1], lng: loc.coordinates[0] };
        }
        return null;
    } catch {
        return null;
    }
}

const obsTypeMap: Record<string, 'direct' | 'indirect' | 'loss'> = {
    direct_sighting: 'direct',
    indirect_sign: 'indirect',
    conflict_loss: 'loss',
    direct: 'direct',
    indirect: 'indirect',
    loss: 'loss',
};

const RADIUS_MAX = 100;

function getInitialBaseLayer(): 'streets' | 'satellite' {
    try {
        const saved = localStorage.getItem('eravat_app_settings');
        if (saved && JSON.parse(saved).mapStyle === 'satellite') return 'satellite';
    } catch { /* ignore */ }
    return 'streets';
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface MapComponentProps {
    /** Legacy prop — still rendered if passed. */
    reportPoints?: ReportPoint[];
    /** Set to false to suppress internal pin fetching (default: true). */
    showObservationPins?: boolean;
}

export function MapComponent({ reportPoints, showObservationPins = true }: MapComponentProps) {
    const { t } = useLanguage();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [divisions, setDivisions] = useState<any[]>([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [ranges, setRanges] = useState<any[]>([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [beats, setBeats] = useState<any[]>([]);

    const [selectedDivision, setSelectedDivision] = useState('');
    const [selectedRange, setSelectedRange] = useState('');
    const [selectedBeat, setSelectedBeat] = useState('');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [allDivisionsGeo, setAllDivisionsGeo] = useState<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [divisionGeo, setDivisionGeo] = useState<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [rangeGeo, setRangeGeo] = useState<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [beatGeo, setBeatGeo] = useState<any>(null);
    const [loadingGeo, setLoadingGeo] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [labelGeo, setLabelGeo] = useState<any>(null);

    // Observation pins
    const [obsPins, setObsPins] = useState<ObsPin[]>([]);
    const [loadingPins, setLoadingPins] = useState(false);
    const [pinFilter, setPinFilter] = useState<'all' | 'direct' | 'indirect' | 'loss'>('all');
    const [showHeatmap, setShowHeatmap] = useState(false);

    // Date range filter (empty = all time)
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Base layer, fullscreen, user location + radius
    const [baseLayer, setBaseLayer] = useState<'streets' | 'satellite'>(getInitialBaseLayer);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
    const [radiusKm, setRadiusKm] = useState(0);
    const { fetchLocation, loading: locating, error: geoError } = useGeolocation();
    const mapWrapperRef = useRef<HTMLDivElement>(null);

    // ── Fetch observation pins (scoped to selected territory when set) ─────
    useEffect(() => {
        if (!showObservationPins) return;
        let cancelled = false;

        const fetchPins = async () => {
            setLoadingPins(true);
            try {
                let beatIds: string[] | null = null;
                if (selectedBeat) {
                    beatIds = [selectedBeat];
                } else if (selectedRange) {
                    const { data: rangeBeats } = await supabase
                        .from('geo_beats')
                        .select('id')
                        .eq('range_id', selectedRange);
                    beatIds = (rangeBeats || []).map((b) => b.id);
                } else if (selectedDivision) {
                    const { data: divRanges } = await supabase
                        .from('geo_ranges')
                        .select('id')
                        .eq('division_id', selectedDivision);
                    const rangeIds = (divRanges || []).map((r) => r.id);
                    if (rangeIds.length === 0) {
                        beatIds = [];
                    } else {
                        const { data: divBeats } = await supabase
                            .from('geo_beats')
                            .select('id')
                            .in('range_id', rangeIds);
                        beatIds = (divBeats || []).map((b) => b.id);
                    }
                }

                if (cancelled) return;

                if (beatIds && beatIds.length === 0) {
                    setObsPins([]);
                    return;
                }

                let query = supabase
                    .from('reports')
                    .select(`
                        id,
                        beat_id,
                        location,
                        device_timestamp,
                        geo_beats (
                            id,
                            name,
                            range_id,
                            geo_ranges (
                                id,
                                division_id
                            )
                        ),
                        observations (
                            type,
                            male_count,
                            female_count,
                            calf_count,
                            unknown_count,
                            compass_bearing,
                            indirect_sign_details,
                            conflict_loss_details
                        ),
                        conflict_damages ( category, description )
                    `)
                    .not('location', 'is', null)
                    .order('device_timestamp', { ascending: false })
                    .limit(beatIds ? 300 : 200);

                if (beatIds) {
                    query = query.in('beat_id', beatIds);
                }
                if (startDate) {
                    query = query.gte('device_timestamp', `${startDate}T00:00:00`);
                }
                if (endDate) {
                    query = query.lte('device_timestamp', `${endDate}T23:59:59`);
                }

                const { data, error } = await query;
                if (error) throw error;
                if (cancelled) return;

                const pins: ObsPin[] = [];
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (data || []).forEach((rep: any) => {
                    const coords = parseLocation(rep.location);
                    if (!coords) return;

                    const obs = rep.observations?.[0];
                    const rawType = obs?.type ?? 'direct';
                    const type = obsTypeMap[rawType] ?? 'direct';
                    const beat = rep.geo_beats;
                    const range = beat?.geo_ranges;
                    const damages = Array.isArray(rep.conflict_damages) ? rep.conflict_damages : [];
                    const hasDamage =
                        type === 'loss' ||
                        (Array.isArray(obs?.conflict_loss_details) && obs.conflict_loss_details.length > 0) ||
                        damages.length > 0;

                    pins.push({
                        id: rep.id,
                        lat: coords.lat,
                        lng: coords.lng,
                        type: hasDamage ? 'loss' : type,
                        beatId: rep.beat_id ?? beat?.id ?? null,
                        rangeId: beat?.range_id ?? range?.id ?? null,
                        divisionId: range?.division_id ?? null,
                        beatName: beat?.name ?? 'Field',
                        maleCount: obs?.male_count ?? 0,
                        femaleCount: obs?.female_count ?? 0,
                        calfCount: obs?.calf_count ?? 0,
                        unknownCount: obs?.unknown_count ?? 0,
                        compassBearing: obs?.compass_bearing ?? undefined,
                        indirectSigns: obs?.indirect_sign_details ?? [],
                        conflictLossDetails: obs?.conflict_loss_details ?? damages.map((d: { category?: string }) => d.category).filter(Boolean),
                        hasDamage,
                        deviceTimestamp: rep.device_timestamp,
                    });
                });

                setObsPins(pins);
            } catch (err) {
                console.error('Error fetching observation pins:', err);
                if (!cancelled) setObsPins([]);
            } finally {
                if (!cancelled) setLoadingPins(false);
            }
        };

        void fetchPins();
        return () => { cancelled = true; };
    }, [showObservationPins, selectedDivision, selectedRange, selectedBeat, startDate, endDate]);

    // ── Division list (light) + optional outline polygons ──────────────────────
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const { data: light } = await supabase
                .from('geo_divisions')
                .select('id, name')
                .order('name');
            if (cancelled || !light) return;
            setDivisions(light.map((d) => ({ id: d.id, name: d.name })));

            const { data: withBoundary } = await supabase
                .from('geo_divisions')
                .select('id, name, boundary')
                .order('name');
            if (cancelled || !withBoundary) return;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const features: any[] = [];
            withBoundary.forEach((d) => {
                if (!d.boundary) return;
                try {
                    const geom = wkx.Geometry.parse(Buffer.from(d.boundary, 'hex'));
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    features.push(turf.feature(geom.toGeoJSON() as any, { name: d.name }));
                } catch { /* skip unparseable boundary */ }
            });
            setAllDivisionsGeo(features.length ? turf.featureCollection(features) : null);
        })();
        return () => { cancelled = true; };
    }, []);

    // ── Ranges ────────────────────────────────────────────────────────────────
    useEffect(() => {
        setSelectedRange('');
        setSelectedBeat('');
        setRanges([]);
        setBeats([]);
        if (selectedDivision) {
            supabase.from('geo_ranges').select('id, name').eq('division_id', selectedDivision).order('name')
                .then(({ data }) => { if (data) setRanges(data); });
            fetchGeoData('division', selectedDivision);
        } else {
            setDivisionGeo(null);
            setRangeGeo(null);
            setBeatGeo(null);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDivision]);

    // ── Beats ─────────────────────────────────────────────────────────────────
    useEffect(() => {
        setSelectedBeat('');
        setBeats([]);
        if (selectedRange) {
            supabase.from('geo_beats').select('id, name').eq('range_id', selectedRange).order('name')
                .then(({ data }) => { if (data) setBeats(data); });
            fetchGeoData('range', selectedRange);
        } else if (selectedDivision) {
            fetchGeoData('division', selectedDivision);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedRange, selectedDivision]);

    useEffect(() => {
        if (selectedBeat) fetchGeoData('beat', selectedBeat);
        else if (selectedRange) fetchGeoData('range', selectedRange);
        else if (selectedDivision) fetchGeoData('division', selectedDivision);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedBeat]);

    useEffect(() => {
        let cancelled = false;
        const toFeatures = (rows: { name: string; boundary?: string | null }[]) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const features: any[] = [];
            rows.forEach((row) => {
                if (!row.boundary) return;
                try {
                    const geom = wkx.Geometry.parse(Buffer.from(row.boundary, 'hex'));
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    features.push(turf.feature(geom.toGeoJSON() as any, { name: row.name }));
                } catch { /* skip */ }
            });
            return features.length ? turf.featureCollection(features) : null;
        };

        void (async () => {
            if (!selectedDivision) {
                if (!cancelled) setLabelGeo(allDivisionsGeo);
                return;
            }
            if (selectedBeat) {
                const { data } = await supabase.from('geo_beats').select('name, boundary').eq('id', selectedBeat);
                if (!cancelled) setLabelGeo(toFeatures(data || []));
                return;
            }
            if (selectedRange) {
                const { data } = await supabase.from('geo_beats').select('name, boundary').eq('range_id', selectedRange);
                if (!cancelled) setLabelGeo(toFeatures(data || []));
                return;
            }
            const { data } = await supabase.from('geo_ranges').select('name, boundary').eq('division_id', selectedDivision);
            if (!cancelled) setLabelGeo(toFeatures(data || []));
        })();
        return () => { cancelled = true; };
    }, [selectedDivision, selectedRange, selectedBeat, allDivisionsGeo]);

    // ── Geometry parser ───────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parseGeometry = (beatsData: any[]) => {
        if (!beatsData?.length) return null;
        const features = beatsData.filter(b => b.boundary).map(beat => {
            const buf = Buffer.from(beat.boundary, 'hex');
            const geom = wkx.Geometry.parse(buf);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return turf.feature(geom.toGeoJSON() as any);
        });
        if (!features.length) return null;
        if (features.length === 1) return features[0].geometry;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const unioned = turf.union(turf.featureCollection(features as any[]));
        return unioned?.geometry || null;
    };

    const fetchGeoData = async (type: string, id: string) => {
        setLoadingGeo(true);
        try {
            const parseOne = (boundary: string | null | undefined) => {
                if (!boundary) return null;
                try {
                    const geom = wkx.Geometry.parse(Buffer.from(boundary, 'hex'));
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    return (geom.toGeoJSON() as any);
                } catch {
                    return null;
                }
            };

            if (type === 'beat') {
                const { data: bData } = await supabase.from('geo_beats').select('boundary, range_id').eq('id', id);
                setBeatGeo(parseGeometry(bData || []) || parseOne(bData?.[0]?.boundary));
                const rangeId = bData?.[0]?.range_id;
                if (rangeId) {
                    const { data: rangeRow } = await supabase
                        .from('geo_ranges')
                        .select('boundary, division_id')
                        .eq('id', rangeId)
                        .maybeSingle();
                    const rangeBoundary = parseOne(rangeRow?.boundary);
                    if (rangeBoundary) {
                        setRangeGeo(rangeBoundary);
                    } else {
                        const { data: rData } = await supabase.from('geo_beats').select('boundary').eq('range_id', rangeId);
                        setRangeGeo(parseGeometry(rData || []));
                    }
                    if (rangeRow?.division_id) {
                        const { data: divRow } = await supabase
                            .from('geo_divisions')
                            .select('boundary')
                            .eq('id', rangeRow.division_id)
                            .maybeSingle();
                        const divBoundary = parseOne(divRow?.boundary);
                        if (divBoundary) {
                            setDivisionGeo(divBoundary);
                        } else {
                            const { data: divRanges } = await supabase.from('geo_ranges').select('id').eq('division_id', rangeRow.division_id);
                            const ids = divRanges?.map(r => r.id) || [];
                            const { data: divBeats } = await supabase.from('geo_beats').select('boundary').in('range_id', ids);
                            setDivisionGeo(parseGeometry(divBeats || []));
                        }
                    }
                }
            } else if (type === 'range') {
                setBeatGeo(null);
                const { data: rangeRow } = await supabase
                    .from('geo_ranges')
                    .select('boundary, division_id')
                    .eq('id', id)
                    .maybeSingle();
                const rangeBoundary = parseOne(rangeRow?.boundary);
                if (rangeBoundary) {
                    setRangeGeo(rangeBoundary);
                } else {
                    const { data: rData } = await supabase.from('geo_beats').select('boundary').eq('range_id', id);
                    setRangeGeo(parseGeometry(rData || []));
                }
                if (rangeRow?.division_id) {
                    const { data: divRow } = await supabase
                        .from('geo_divisions')
                        .select('boundary')
                        .eq('id', rangeRow.division_id)
                        .maybeSingle();
                    const divBoundary = parseOne(divRow?.boundary);
                    if (divBoundary) {
                        setDivisionGeo(divBoundary);
                    } else {
                        const { data: divRanges } = await supabase.from('geo_ranges').select('id').eq('division_id', rangeRow.division_id);
                        const ids = divRanges?.map(r => r.id) || [];
                        const { data: divBeats } = await supabase.from('geo_beats').select('boundary').in('range_id', ids);
                        setDivisionGeo(parseGeometry(divBeats || []));
                    }
                }
            } else if (type === 'division') {
                setBeatGeo(null);
                setRangeGeo(null);
                const { data: divRow } = await supabase
                    .from('geo_divisions')
                    .select('boundary')
                    .eq('id', id)
                    .maybeSingle();
                const divBoundary = parseOne(divRow?.boundary);
                if (divBoundary) {
                    setDivisionGeo(divBoundary);
                } else {
                    const { data: divRanges } = await supabase.from('geo_ranges').select('id').eq('division_id', id);
                    const ids = divRanges?.map(r => r.id) || [];
                    if (ids.length > 0) {
                        const { data: divBeats } = await supabase.from('geo_beats').select('boundary').in('range_id', ids);
                        setDivisionGeo(parseGeometry(divBeats || []));
                    } else {
                        setDivisionGeo(null);
                    }
                }
            }
        } catch (error) {
            console.error('Error fetching geo data:', error);
            setDivisionGeo(null); setRangeGeo(null); setBeatGeo(null);
            trackFailed('map.fetch_geo', 'fetch_failed', { screen: 'map' });
        }
        setLoadingGeo(false);
    };

    // Uses the shared geolocation hook (Capacitor on native, browser API on web)
    // so the permission flow matches the rest of the app.
    const locateUser = async () => {
        trackClick('map.locate', { screen: 'map' });
        const pos = await fetchLocation();
        if (pos?.coords) {
            setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            if (!radiusKm) setRadiusKm(50);
        } else {
            trackFailed('map.locate', 'geolocation_failed', { screen: 'map' });
        }
    };

    // True fullscreen via the Fullscreen API (CSS `fixed` is trapped by the
    // page's transformed ancestors, so it would not cover the header/nav).
    useEffect(() => {
        const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', onFsChange);
        return () => document.removeEventListener('fullscreenchange', onFsChange);
    }, []);

    const toggleFullscreen = () => {
        const el = mapWrapperRef.current;
        if (!el) return;
        trackClick('map.fullscreen', { screen: 'map', enabling: !document.fullscreenElement });
        if (!document.fullscreenElement) {
            el.requestFullscreen?.().catch(() => {
                trackFailed('map.fullscreen', 'request_failed', { screen: 'map' });
            });
        } else {
            void document.exitFullscreen?.();
        }
    };

    // ── Derived ───────────────────────────────────────────────────────────────
    const inDateRange = (timestamp: string) => {
        if (!startDate && !endDate) return true;
        const d = new Date(timestamp);
        if (startDate && d < new Date(`${startDate}T00:00:00`)) return false;
        if (endDate && d > new Date(`${endDate}T23:59:59`)) return false;
        return true;
    };

    const withinRadius = (p: ObsPin) => {
        if (!userLoc || !radiusKm) return true;
        const dist = turf.distance([userLoc.lng, userLoc.lat], [p.lng, p.lat], { units: 'kilometers' });
        return dist <= radiusKm;
    };

    const timedPins = obsPins.filter((p) => inDateRange(p.deviceTimestamp) && withinRadius(p));

    const visiblePins = timedPins.filter((p) => {
        if (pinFilter === 'all') return true;
        if (pinFilter === 'loss') return p.hasDamage || p.type === 'loss';
        return p.type === pinFilter;
    });

    const countSource = pinFilter === 'all' ? timedPins : visiblePins;
    const typeCounts = {
        direct: countSource.filter((p) => p.type === 'direct').length,
        indirect: countSource.filter((p) => p.type === 'indirect').length,
        loss: countSource.filter((p) => p.hasDamage || p.type === 'loss').length,
    };

    const legacyPoints = reportPoints ?? [];

    const TYPE_LABELS: Record<string, string> = {
        direct: t('map.legendDirect'),
        indirect: t('map.legendIndirect'),
        loss: t('map.legendLoss'),
    };

    const activeGeo = beatGeo || rangeGeo || divisionGeo;
    const fitKey = `${selectedDivision}|${selectedRange}|${selectedBeat}|${visiblePins.length}|${userLoc ? `${userLoc.lat},${userLoc.lng}` : ''}|${radiusKm}`;

    return (
        <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="glass-card rounded-2xl p-6 flex flex-col gap-4 col-span-1 lg:col-span-3"
        >
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h3 className="text-lg font-bold flex items-center gap-2">
                        <Layers className="text-primary" size={20} />
                        {t('map.territoryOverview')}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                        {t('map.filterHint')}
                    </p>
                </div>

                {/* Controls */}
                <div className="flex flex-wrap gap-3 items-center">
                    {/* Geo filters */}
                    <select
                        value={selectedDivision}
                        onChange={(e) => {
                            const v = e.target.value;
                            setSelectedDivision(v);
                            trackFilter('map.division', v ? 'set' : 'cleared', { screen: 'map' });
                        }}
                        className="input-field bg-background max-w-[160px] text-sm">
                        <option value="">{t('map.allDivisions')}</option>
                        {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                    <select
                        value={selectedRange}
                        onChange={(e) => {
                            const v = e.target.value;
                            setSelectedRange(v);
                            trackFilter('map.range', v ? 'set' : 'cleared', { screen: 'map' });
                        }}
                        disabled={!selectedDivision}
                        className="input-field bg-background max-w-[160px] text-sm disabled:opacity-50">
                        <option value="">{t('map.allRanges')}</option>
                        {ranges.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                    <select
                        value={selectedBeat}
                        onChange={(e) => {
                            const v = e.target.value;
                            setSelectedBeat(v);
                            trackFilter('map.beat', v ? 'set' : 'cleared', { screen: 'map' });
                        }}
                        disabled={!selectedRange}
                        className="input-field bg-background max-w-[160px] text-sm disabled:opacity-50">
                        <option value="">{t('map.allBeats')}</option>
                        {beats.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>

                    {/* Pin type filter */}
                    <div className="flex gap-1.5 bg-muted/40 rounded-xl p-1 border border-border">
                        {(['all', 'direct', 'indirect', 'loss'] as const).map(f => (
                            <button key={f}
                                type="button"
                                data-ph-action={`map.filter_pin.${f}`}
                                data-ph-screen="map"
                                onClick={() => {
                                    setPinFilter(f);
                                    trackFilter('map.pin_type', f, { screen: 'map' });
                                }}
                                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                                    pinFilter === f
                                        ? f === 'loss' ? 'bg-destructive text-destructive-foreground'
                                            : f === 'indirect' ? 'bg-amber-500 text-white'
                                                : f === 'direct' ? 'bg-emerald-500 text-white'
                                                    : 'bg-primary text-primary-foreground'
                                        : 'text-muted-foreground hover:text-foreground'
                                }`}>
                                {t(`map.filter_${f}`)}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Date range + radius + heatmap row */}
            <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
                <div className="flex items-center gap-2 bg-muted/40 rounded-xl p-1.5 px-3 border border-border">
                    <span className="text-muted-foreground">{t('map.from')}</span>
                    <input type="date" value={startDate} max={endDate || undefined}
                        onChange={(e) => {
                            setStartDate(e.target.value);
                            trackFilter('map.start_date', e.target.value || 'cleared', { screen: 'map' });
                        }}
                        className="bg-transparent outline-none text-foreground" />
                    <span className="text-muted-foreground">{t('map.to')}</span>
                    <input type="date" value={endDate} min={startDate || undefined}
                        onChange={(e) => {
                            setEndDate(e.target.value);
                            trackFilter('map.end_date', e.target.value || 'cleared', { screen: 'map' });
                        }}
                        className="bg-transparent outline-none text-foreground" />
                    {(startDate || endDate) && (
                        <button
                            type="button"
                            data-ph-action="map.clear_dates"
                            data-ph-screen="map"
                            onClick={() => {
                                setStartDate('');
                                setEndDate('');
                                trackFilter('map.date_range', 'cleared', { screen: 'map' });
                            }}
                            className="text-primary hover:underline ml-1">{t('map.clear')}</button>
                    )}
                </div>

                <div className="flex flex-col gap-2 bg-muted/40 rounded-xl p-2 px-3 border border-border min-w-[240px]">
                    <div className="flex items-center gap-2">
                    <button type="button" onClick={locateUser} disabled={locating}
                        className="flex items-center gap-1.5 text-primary hover:underline disabled:opacity-50">
                        <LocateFixed size={14} />
                        {locating ? t('map.locating') : t('map.myLocation')}
                    </button>
                    <span className="w-[1px] h-3 bg-border" />
                    <span className="text-muted-foreground">{t('map.radius')}</span>
                    <span className="text-foreground font-semibold">
                        {radiusKm === 0 ? t('map.radiusOff') : `${radiusKm} ${t('km')}`}
                    </span>
                    </div>
                    <RadiusSlider value={radiusKm} onChange={(v) => {
                        setRadiusKm(v);
                        trackFilter('map.radius_km', v, { screen: 'map' });
                    }} min={0} max={RADIUS_MAX} />
                </div>

                <label className="flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground bg-muted/40 rounded-xl p-1.5 px-3 border border-border">
                    <input type="checkbox" checked={showHeatmap}
                        onChange={(e) => {
                            setShowHeatmap(e.target.checked);
                            trackFilter('map.heatmap', e.target.checked, { screen: 'map' });
                        }}
                        className="rounded border-border text-primary focus:ring-primary/20 accent-primary" />
                    {t('map.heatmap')}
                </label>

                {geoError && <span className="text-destructive">{geoError}</span>}
            </div>

            {/* Legend — counts reflect active filters */}
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />
                    {t('map.legendDirect')} ({typeCounts.direct})
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" />
                    {t('map.legendIndirect')} ({typeCounts.indirect})
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
                    {t('map.legendLoss')} ({typeCounts.loss})
                </span>
                <span className="text-muted-foreground/80">
                    {t('map.total')} {timedPins.length}
                    {selectedBeat ? ` ${t('map.inBeat')}` : selectedRange ? ` ${t('map.inRange')}` : selectedDivision ? ` ${t('map.inDivision')}` : ''}
                </span>
                {loadingPins && (
                    <span className="flex items-center gap-1 text-primary">
                        <div className="w-3 h-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                        {t('map.fetchingPins')}
                    </span>
                )}
            </div>

            {/* Map */}
            <div ref={mapWrapperRef} className="relative w-full h-[520px] rounded-xl overflow-hidden border border-border z-0 bg-background">
                {(loadingGeo) && (
                    <div className="absolute inset-0 bg-background/50 z-[1000] flex items-center justify-center backdrop-blur-sm">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                    </div>
                )}

                {/* Overlay controls: base layer + fullscreen */}
                <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-2">
                    <button
                        type="button"
                        onClick={() => {
                            setBaseLayer(b => {
                                const next = b === 'satellite' ? 'streets' : 'satellite';
                                trackFilter('map.base_layer', next, { screen: 'map' });
                                return next;
                            });
                        }}
                        title={baseLayer === 'satellite' ? t('map.streets') : t('map.satellite')}
                        className="p-2 rounded-lg bg-background/90 border border-border shadow hover:bg-background text-foreground"
                    >
                        {baseLayer === 'satellite' ? <MapIcon size={16} /> : <Satellite size={16} />}
                    </button>
                    <button
                        type="button"
                        onClick={toggleFullscreen}
                        title={isFullscreen ? t('map.exitFullscreen') : t('map.fullscreen')}
                        className="p-2 rounded-lg bg-background/90 border border-border shadow hover:bg-background text-foreground"
                    >
                        {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                    </button>
                </div>

                <MapContainer
                    center={[23.4733, 77.9479]}
                    zoom={6}
                    scrollWheelZoom={true}
                    className="w-full h-full"
                    style={{ zIndex: 1 }}
                >
                    {baseLayer === 'satellite' ? (
                        <TileLayer
                            attribution='Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics'
                            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                            maxZoom={19}
                        />
                    ) : (
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                        />
                    )}

                    {/* All-divisions outline when no single division is selected */}
                    {!selectedDivision && allDivisionsGeo && (
                        <GeoJSON key="all-divisions" data={allDivisionsGeo}
                            style={{ color: 'hsl(215.4, 16.3%, 46.9%)', weight: 1.5, opacity: 0.6, fillOpacity: 0.04 }}
                            onEachFeature={(feature, layer) => {
                                const name = feature.properties?.name;
                                if (name) {
                                    layer.bindTooltip(String(name), { permanent: true, direction: 'center', className: 'geo-label', opacity: 0.85 });
                                }
                            }} />
                    )}

                    {labelGeo && selectedDivision && (
                        <GeoJSON key={`labels-${selectedDivision}-${selectedRange}-${selectedBeat}`} data={labelGeo}
                            style={{ color: 'transparent', weight: 0, fillOpacity: 0 }}
                            onEachFeature={(feature, layer) => {
                                const name = feature.properties?.name;
                                if (name) {
                                    layer.bindTooltip(String(name), { permanent: true, direction: 'center', className: 'geo-label', opacity: 0.9 });
                                }
                            }} />
                    )}

                    {/* Geo overlays for the active selection */}
                    {divisionGeo && (
                        <GeoJSON key={`div-${JSON.stringify(divisionGeo)}`} data={divisionGeo}
                            style={{ color: 'hsl(215.4, 16.3%, 46.9%)', weight: 2, opacity: 0.5, fillOpacity: 0.05 }} />
                    )}
                    {rangeGeo && (
                        <GeoJSON key={`rng-${JSON.stringify(rangeGeo)}`} data={rangeGeo}
                            style={{ color: 'hsl(214, 30%, 32%)', weight: 3, opacity: 0.8, fillOpacity: 0.1 }} />
                    )}
                    {beatGeo && (
                        <GeoJSON key={`bt-${JSON.stringify(beatGeo)}`} data={beatGeo}
                            style={{ color: 'hsl(152, 60%, 46%)', weight: 4, opacity: 1, fillOpacity: 0.3 }} />
                    )}

                    {/* User location + radius */}
                    {userLoc && (
                        <>
                            <Marker position={[userLoc.lat, userLoc.lng]} icon={userIcon}>
                                <Popup>{t('map.youAreHere')}</Popup>
                            </Marker>
                            {radiusKm > 0 && (
                                <Circle center={[userLoc.lat, userLoc.lng]} radius={radiusKm * 1000}
                                    pathOptions={{ color: 'hsl(217, 91%, 60%)', weight: 1.5, fillOpacity: 0.06 }} />
                            )}
                        </>
                    )}

                    {/* Heatmap Overlay Layer */}
                    {showHeatmap && visiblePins.map((pin) => {
                        const color = pin.type === 'loss' ? 'hsl(0, 84.2%, 60.2%)' : pin.type === 'indirect' ? 'hsl(38, 92%, 50%)' : 'hsl(152, 60%, 46%)';
                        return (
                            <CircleMarker
                                key={`heat-${pin.id}`}
                                center={[pin.lat, pin.lng]}
                                radius={28}
                                pathOptions={{
                                    fillColor: color,
                                    fillOpacity: 0.22,
                                    stroke: false,
                                }}
                            />
                        );
                    })}

                    {/* Observation Pins (only when heatmap is off) */}
                    {!showHeatmap && visiblePins.map((pin) => {
                        const total = pin.maleCount + pin.femaleCount + pin.calfCount + pin.unknownCount;
                        const dateStr = new Date(pin.deviceTimestamp).toLocaleString(undefined, {
                            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                        });
                        return (
                            <Marker key={pin.id}
                                position={[pin.lat, pin.lng]}
                                icon={iconMap[pin.type] || iconMap.default}
                            >
                                <Popup className="rounded-xl overflow-hidden min-w-[200px]">
                                    <div className="p-1 space-y-2">
                                        <div className="flex items-center gap-2">
                                            {pin.type === 'direct' && <Eye size={14} className="text-emerald-600" />}
                                            {pin.type === 'indirect' && <Footprints size={14} className="text-amber-600" />}
                                            {pin.type === 'loss' && <AlertTriangle size={14} className="text-red-600" />}
                                            <p className="font-bold text-sm m-0">{TYPE_LABELS[pin.type]}</p>
                                        </div>
                                        <p className="text-xs text-gray-500 m-0">{pin.beatName} · {dateStr}</p>
                                        {pin.type === 'direct' && total > 0 && (
                                            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs rounded-lg bg-gray-50 p-2 mt-1">
                                                <span className="text-gray-400">{t('map.total')}</span><span className="font-semibold">{total}</span>
                                                {pin.maleCount > 0 && <><span className="text-gray-400">{t('map.male')}</span><span>{pin.maleCount}</span></>}
                                                {pin.femaleCount > 0 && <><span className="text-gray-400">{t('map.female')}</span><span>{pin.femaleCount}</span></>}
                                                {pin.calfCount > 0 && <><span className="text-gray-400">{t('map.calf')}</span><span>{pin.calfCount}</span></>}
                                                {pin.unknownCount > 0 && <><span className="text-gray-400">{t('map.unknown')}</span><span>{pin.unknownCount}</span></>}
                                                {pin.compassBearing !== undefined && (
                                                    <><span className="text-gray-400">{t('map.bearing')}</span><span>{pin.compassBearing}°</span></>
                                                )}
                                            </div>
                                        )}
                                        {pin.type === 'indirect' && pin.indirectSigns && pin.indirectSigns.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {pin.indirectSigns.map(s => (
                                                    <span key={s} className="px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded text-[10px] font-medium">{s}</span>
                                                ))}
                                            </div>
                                        )}
                                        {pin.type === 'loss' && pin.conflictLossDetails && pin.conflictLossDetails.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {pin.conflictLossDetails.map(s => (
                                                    <span key={s} className="px-1.5 py-0.5 bg-red-50 text-red-700 rounded text-[10px] font-medium">{s}</span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </Popup>
                            </Marker>
                        );
                    })}

                    {/* Legacy pins (backward compat) */}
                    {legacyPoints.map((point) => (
                        <Marker key={`legacy-${point.id}`}
                            position={[point.lat, point.lng]}
                            icon={iconMap[point.type as keyof typeof iconMap] || iconMap.default}
                        >
                            <Popup>
                                <div className="p-1">
                                    <p className="font-bold text-sm m-0">{point.title}</p>
                                    <p className="text-xs text-gray-500 m-0 mt-1">{point.subtitle}</p>
                                </div>
                            </Popup>
                        </Marker>
                    ))}

                    <FitToData geojsonData={activeGeo} pins={visiblePins} userLoc={userLoc} fitKey={fitKey} />
                    <MapResizer trigger={isFullscreen} />
                </MapContainer>
            </div>
        </motion.div>
    );
}
