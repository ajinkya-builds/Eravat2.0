import { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import { MapContainer, TileLayer, GeoJSON, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Layers, Eye, AlertTriangle, Footprints } from 'lucide-react';
import { motion } from 'framer-motion';
import { Buffer } from 'buffer';
import wkx from 'wkx';
import * as turf from '@turf/turf';

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

// ─── Fit bounds helper ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function MapBounds({ geojsonData }: { geojsonData: any }) {
    const map = useMap();
    useEffect(() => {
        if (geojsonData) {
            try {
                const layer = L.geoJSON(geojsonData);
                map.fitBounds(layer.getBounds(), { padding: [50, 50], maxZoom: 12 });
            } catch (e) {
                console.error('Could not fit bounds to geometry', e);
            }
        }
    }, [geojsonData, map]);
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
    beatName: string;
    maleCount: number;
    femaleCount: number;
    calfCount: number;
    unknownCount: number;
    compassBearing?: number;
    indirectSigns?: string[];
    conflictLossDetails?: string[];
    deviceTimestamp: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseWkbHex(hexStr: string): { lat: number; lng: number } | null {
    try {
        const buf = Buffer.from(hexStr, 'hex');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const geom = wkx.Geometry.parse(buf) as any;
        const gj = geom.toGeoJSON();
        if (gj.type === 'Point') {
            return { lat: gj.coordinates[1], lng: gj.coordinates[0] };
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

// ─── Main Component ───────────────────────────────────────────────────────────

interface MapComponentProps {
    /** Legacy prop — still rendered if passed. */
    reportPoints?: ReportPoint[];
    /** Set to false to suppress internal pin fetching (default: true). */
    showObservationPins?: boolean;
}

export function MapComponent({ reportPoints, showObservationPins = true }: MapComponentProps) {
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
    const [divisionGeo, setDivisionGeo] = useState<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [rangeGeo, setRangeGeo] = useState<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [beatGeo, setBeatGeo] = useState<any>(null);
    const [loadingGeo, setLoadingGeo] = useState(false);

    // Observation pins
    const [obsPins, setObsPins] = useState<ObsPin[]>([]);
    const [loadingPins, setLoadingPins] = useState(false);
    const [pinFilter, setPinFilter] = useState<'all' | 'direct' | 'indirect' | 'loss'>('all');

    // ── Fetch observation pins ──────────────────────────────────────────────
    useEffect(() => {
        if (!showObservationPins) return;
        const fetch = async () => {
            setLoadingPins(true);
            try {
                const { data, error } = await supabase
                    .from('reports')
                    .select(`
                        id,
                        location,
                        device_timestamp,
                        geo_beats (name),
                        observations (
                            type,
                            male_count,
                            female_count,
                            calf_count,
                            unknown_count,
                            compass_bearing,
                            indirect_sign_details,
                            conflict_loss_details
                        )
                    `)
                    .not('location', 'is', null)
                    .order('device_timestamp', { ascending: false })
                    .limit(300);

                if (error) throw error;

                const pins: ObsPin[] = [];
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (data || []).forEach((rep: any) => {
                    if (!rep.location) return;
                    const coords = parseWkbHex(rep.location);
                    if (!coords) return;

                    const obs = rep.observations?.[0];
                    const rawType = obs?.type ?? 'direct';
                    const type = obsTypeMap[rawType] ?? 'direct';

                    pins.push({
                        id: rep.id,
                        lat: coords.lat,
                        lng: coords.lng,
                        type,
                        beatName: rep.geo_beats?.name ?? 'Field',
                        maleCount: obs?.male_count ?? 0,
                        femaleCount: obs?.female_count ?? 0,
                        calfCount: obs?.calf_count ?? 0,
                        unknownCount: obs?.unknown_count ?? 0,
                        compassBearing: obs?.compass_bearing ?? undefined,
                        indirectSigns: obs?.indirect_sign_details ?? [],
                        conflictLossDetails: obs?.conflict_loss_details ?? [],
                        deviceTimestamp: rep.device_timestamp,
                    });
                });

                setObsPins(pins);
            } catch (err) {
                console.error('Error fetching observation pins:', err);
            } finally {
                setLoadingPins(false);
            }
        };
        fetch();
    }, [showObservationPins]);

    // ── Divisions ─────────────────────────────────────────────────────────────
    useEffect(() => {
        supabase.from('geo_divisions').select('id, name').order('name').then(({ data }) => {
            if (data) setDivisions(data);
        });
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

    // ── Geometry parser ───────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parseGeometry = (beatsData: any[]) => {
        if (!beatsData?.length) return null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
            if (type === 'beat') {
                const { data: bData } = await supabase.from('geo_beats').select('boundary, range_id').eq('id', id);
                setBeatGeo(parseGeometry(bData || []));
                const rangeId = bData?.[0]?.range_id;
                if (rangeId) {
                    const { data: rData } = await supabase.from('geo_beats').select('boundary').eq('range_id', rangeId);
                    setRangeGeo(parseGeometry(rData || []));
                    const { data: rangeRow } = await supabase.from('geo_ranges').select('division_id').eq('id', rangeId).single();
                    if (rangeRow?.division_id) {
                        const { data: divRanges } = await supabase.from('geo_ranges').select('id').eq('division_id', rangeRow.division_id);
                        const ids = divRanges?.map(r => r.id) || [];
                        const { data: divBeats } = await supabase.from('geo_beats').select('boundary').in('range_id', ids);
                        setDivisionGeo(parseGeometry(divBeats || []));
                    }
                }
            } else if (type === 'range') {
                setBeatGeo(null);
                const { data: rData } = await supabase.from('geo_beats').select('boundary').eq('range_id', id);
                setRangeGeo(parseGeometry(rData || []));
                const { data: rangeRow } = await supabase.from('geo_ranges').select('division_id').eq('id', id).single();
                if (rangeRow?.division_id) {
                    const { data: divRanges } = await supabase.from('geo_ranges').select('id').eq('division_id', rangeRow.division_id);
                    const ids = divRanges?.map(r => r.id) || [];
                    const { data: divBeats } = await supabase.from('geo_beats').select('boundary').in('range_id', ids);
                    setDivisionGeo(parseGeometry(divBeats || []));
                }
            } else if (type === 'division') {
                setBeatGeo(null);
                setRangeGeo(null);
                const { data: divRanges } = await supabase.from('geo_ranges').select('id').eq('division_id', id);
                const ids = divRanges?.map(r => r.id) || [];
                if (ids.length > 0) {
                    const { data: divBeats } = await supabase.from('geo_beats').select('boundary').in('range_id', ids);
                    setDivisionGeo(parseGeometry(divBeats || []));
                } else {
                    setDivisionGeo(null);
                }
            }
        } catch (error) {
            console.error('Error fetching geo data:', error);
            setDivisionGeo(null); setRangeGeo(null); setBeatGeo(null);
        }
        setLoadingGeo(false);
    };

    // ── Derived ───────────────────────────────────────────────────────────────
    const visiblePins = obsPins.filter(p => pinFilter === 'all' || p.type === pinFilter);
    const legacyPoints = reportPoints ?? [];

    const TYPE_LABELS: Record<string, string> = {
        direct: 'Direct Sighting',
        indirect: 'Indirect Sign',
        loss: 'Conflict / Loss',
    };

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
                        Territory Overview
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                        Select a region to highlight it on the map. Pins show recent observation locations.
                    </p>
                </div>

                {/* Controls */}
                <div className="flex flex-wrap gap-3 items-center">
                    {/* Geo filters */}
                    <select value={selectedDivision} onChange={(e) => setSelectedDivision(e.target.value)}
                        className="input-field bg-background max-w-[160px] text-sm">
                        <option value="">All Divisions</option>
                        {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                    <select value={selectedRange} onChange={(e) => setSelectedRange(e.target.value)}
                        disabled={!selectedDivision}
                        className="input-field bg-background max-w-[160px] text-sm disabled:opacity-50">
                        <option value="">All Ranges</option>
                        {ranges.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                    <select value={selectedBeat} onChange={(e) => setSelectedBeat(e.target.value)}
                        disabled={!selectedRange}
                        className="input-field bg-background max-w-[160px] text-sm disabled:opacity-50">
                        <option value="">All Beats</option>
                        {beats.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>

                    {/* Pin type filter */}
                    <div className="flex gap-1.5 bg-muted/40 rounded-xl p-1 border border-border">
                        {(['all', 'direct', 'indirect', 'loss'] as const).map(f => (
                            <button key={f}
                                onClick={() => setPinFilter(f)}
                                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all capitalize ${
                                    pinFilter === f
                                        ? f === 'loss' ? 'bg-destructive text-destructive-foreground'
                                            : f === 'indirect' ? 'bg-amber-500 text-white'
                                                : f === 'direct' ? 'bg-emerald-500 text-white'
                                                    : 'bg-primary text-primary-foreground'
                                        : 'text-muted-foreground hover:text-foreground'
                                }`}>
                                {f}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />
                    Direct Sighting ({obsPins.filter(p => p.type === 'direct').length})
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" />
                    Indirect Sign ({obsPins.filter(p => p.type === 'indirect').length})
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
                    Conflict / Loss ({obsPins.filter(p => p.type === 'loss').length})
                </span>
                {loadingPins && (
                    <span className="flex items-center gap-1 text-primary">
                        <div className="w-3 h-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                        Fetching pins…
                    </span>
                )}
            </div>

            {/* Map */}
            <div className="relative w-full h-[520px] rounded-xl overflow-hidden border border-border z-0">
                {(loadingGeo) && (
                    <div className="absolute inset-0 bg-background/50 z-[1000] flex items-center justify-center backdrop-blur-sm">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                    </div>
                )}
                <MapContainer
                    center={[23.4733, 77.9479]}
                    zoom={6}
                    scrollWheelZoom={true}
                    className="w-full h-full"
                    style={{ zIndex: 1 }}
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                    />

                    {/* Geo overlays */}
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

                    {/* Observation Pins (internal fetch) */}
                    {visiblePins.map((pin) => {
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
                                        {/* Type badge */}
                                        <div className="flex items-center gap-2">
                                            {pin.type === 'direct' && <Eye size={14} className="text-emerald-600" />}
                                            {pin.type === 'indirect' && <Footprints size={14} className="text-amber-600" />}
                                            {pin.type === 'loss' && <AlertTriangle size={14} className="text-red-600" />}
                                            <p className="font-bold text-sm m-0">{TYPE_LABELS[pin.type]}</p>
                                        </div>
                                        {/* Location & time */}
                                        <p className="text-xs text-gray-500 m-0">{pin.beatName} · {dateStr}</p>
                                        {/* Elephant counts for direct */}
                                        {pin.type === 'direct' && total > 0 && (
                                            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs rounded-lg bg-gray-50 p-2 mt-1">
                                                <span className="text-gray-400">Total</span><span className="font-semibold">{total}</span>
                                                {pin.maleCount > 0 && <><span className="text-gray-400">Male</span><span>{pin.maleCount}</span></>}
                                                {pin.femaleCount > 0 && <><span className="text-gray-400">Female</span><span>{pin.femaleCount}</span></>}
                                                {pin.calfCount > 0 && <><span className="text-gray-400">Calf</span><span>{pin.calfCount}</span></>}
                                                {pin.unknownCount > 0 && <><span className="text-gray-400">Unknown</span><span>{pin.unknownCount}</span></>}
                                                {pin.compassBearing !== undefined && (
                                                    <><span className="text-gray-400">Bearing</span><span>{pin.compassBearing}°</span></>
                                                )}
                                            </div>
                                        )}
                                        {/* Indirect signs */}
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

                    <MapBounds geojsonData={beatGeo || rangeGeo || divisionGeo} />
                </MapContainer>
            </div>
        </motion.div>
    );
}
