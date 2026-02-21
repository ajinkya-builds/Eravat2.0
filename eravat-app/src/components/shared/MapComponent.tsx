import { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import { MapContainer, TileLayer, GeoJSON, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Layers } from 'lucide-react';
import { motion } from 'framer-motion';
import { Buffer } from 'buffer';
import wkx from 'wkx';
import * as turf from '@turf/turf';

// Custom Marker Icons based on report type
const createIcon = (color: string) => {
    return new L.DivIcon({
        className: 'custom-leaflet-marker',
        html: `<div style="background-color: ${color}; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7]
    });
};

const iconMap = {
    direct: createIcon('hsl(152, 60%, 46%)'),       // primary green
    indirect: createIcon('hsl(214, 30%, 32%)'),     // secondary blue
    loss: createIcon('hsl(0, 84.2%, 60.2%)'),       // destructive red
    default: createIcon('hsl(215.4, 16.3%, 46.9%)') // muted grey
};

// ... map bounds component ...
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function MapBounds({ geojsonData }: { geojsonData: any }) {
    const map = useMap();
    useEffect(() => {
        if (geojsonData) {
            try {
                const geoJsonLayer = L.geoJSON(geojsonData);
                map.fitBounds(geoJsonLayer.getBounds(), { padding: [50, 50], maxZoom: 12 });
            } catch (e) {
                console.error("Could not fit bounds to geometry", e);
            }
        }
    }, [geojsonData, map]);
    return null;
}

export interface ReportPoint {
    id: string;
    lat: number;
    lng: number;
    type: 'direct' | 'indirect' | 'loss' | string;
    title: string;
    subtitle: string;
}

export function MapComponent({ reportPoints }: { reportPoints?: ReportPoint[] }) {
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

    // Fetch initial divisions
    useEffect(() => {
        const fetchDivisions = async () => {
            const { data } = await supabase.from('geo_divisions').select('id, name').order('name');
            if (data) setDivisions(data);
        };
        fetchDivisions();
    }, []);

    // Fetch ranges when division changes
    useEffect(() => {
        setSelectedRange('');
        setSelectedBeat('');
        setRanges([]);
        setBeats([]);
        if (selectedDivision) {
            const fetchRanges = async () => {
                const { data } = await supabase.from('geo_ranges').select('id, name').eq('division_id', selectedDivision).order('name');
                if (data) setRanges(data);
            };
            fetchRanges();
            fetchGeoData('division', selectedDivision);
        } else {
            setDivisionGeo(null);
            setRangeGeo(null);
            setBeatGeo(null);
        }
    }, [selectedDivision]);

    // Fetch beats when range changes
    useEffect(() => {
        setSelectedBeat('');
        setBeats([]);
        if (selectedRange) {
            const fetchBeats = async () => {
                const { data } = await supabase.from('geo_beats').select('id, name').eq('range_id', selectedRange).order('name');
                if (data) setBeats(data);
            };
            fetchBeats();
            fetchGeoData('range', selectedRange);
        } else if (selectedDivision) {
            fetchGeoData('division', selectedDivision);
        }
    }, [selectedRange, selectedDivision]);

    // Handle beat change
    useEffect(() => {
        if (selectedBeat) {
            fetchGeoData('beat', selectedBeat);
        } else if (selectedRange) {
            fetchGeoData('range', selectedRange);
        } else if (selectedDivision) {
            fetchGeoData('division', selectedDivision);
        }
    }, [selectedBeat, selectedRange, selectedDivision]);

    // Helper to parse a list of beat boundaries into a single turf geometry
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parseGeometry = (beatsData: any[]) => {
        if (!beatsData || beatsData.length === 0) return null;

        const features = beatsData.filter(b => b.boundary).map(beat => {
            const buf = Buffer.from(beat.boundary, 'hex');
            const geom = wkx.Geometry.parse(buf);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return turf.feature(geom.toGeoJSON() as any);
        });

        if (features.length === 0) return null;
        if (features.length === 1) return features[0].geometry;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fc = turf.featureCollection(features as any[]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const unioned = turf.union(fc as any);
        return unioned?.geometry || null;
    };

    const fetchGeoData = async (type: string, id: string) => {
        setLoadingGeo(true);
        try {
            if (type === 'beat') {
                // Fetch Beat, Range, and Division
                // 1. Get Beat
                const { data: bData } = await supabase.from('geo_beats').select('boundary, range_id').eq('id', id);
                setBeatGeo(parseGeometry(bData || []));

                const rangeId = bData?.[0]?.range_id;
                if (rangeId) {
                    // 2. Get Range
                    const { data: rData } = await supabase.from('geo_beats').select('boundary').eq('range_id', rangeId);
                    setRangeGeo(parseGeometry(rData || []));

                    // 3. Get Division
                    const { data: rangeRow } = await supabase.from('geo_ranges').select('division_id').eq('id', rangeId).single();
                    if (rangeRow?.division_id) {
                        const { data: divRanges } = await supabase.from('geo_ranges').select('id').eq('division_id', rangeRow.division_id);
                        const divRangeIds = divRanges?.map(r => r.id) || [];
                        const { data: divBeats } = await supabase.from('geo_beats').select('boundary').in('range_id', divRangeIds);
                        setDivisionGeo(parseGeometry(divBeats || []));
                    }
                }
            } else if (type === 'range') {
                setBeatGeo(null);
                // 1. Get Range
                const { data: rData } = await supabase.from('geo_beats').select('boundary').eq('range_id', id);
                setRangeGeo(parseGeometry(rData || []));

                // 2. Get Division
                const { data: rangeRow } = await supabase.from('geo_ranges').select('division_id').eq('id', id).single();
                if (rangeRow?.division_id) {
                    const { data: divRanges } = await supabase.from('geo_ranges').select('id').eq('division_id', rangeRow.division_id);
                    const divRangeIds = divRanges?.map(r => r.id) || [];
                    const { data: divBeats } = await supabase.from('geo_beats').select('boundary').in('range_id', divRangeIds);
                    setDivisionGeo(parseGeometry(divBeats || []));
                }
            } else if (type === 'division') {
                setBeatGeo(null);
                setRangeGeo(null);

                // 1. Get Division
                const { data: divRanges } = await supabase.from('geo_ranges').select('id').eq('division_id', id);
                const divRangeIds = divRanges?.map(r => r.id) || [];
                if (divRangeIds.length > 0) {
                    const { data: divBeats } = await supabase.from('geo_beats').select('boundary').in('range_id', divRangeIds);
                    setDivisionGeo(parseGeometry(divBeats || []));
                } else {
                    setDivisionGeo(null);
                }
            }
        } catch (error) {
            console.error('Error fetching or parsing geojson:', error);
            setDivisionGeo(null);
            setRangeGeo(null);
            setBeatGeo(null);
        }
        setLoadingGeo(false);
    };

    return (
        <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="glass-card rounded-2xl p-6 flex flex-col gap-4 col-span-1 lg:col-span-3"
        >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h3 className="text-lg font-bold flex items-center gap-2">
                        <Layers className="text-primary" size={20} />
                        Territory Overview
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">Select a region to highlight it on the map.</p>
                </div>

                <div className="flex flex-wrap gap-3">
                    <select
                        value={selectedDivision}
                        onChange={(e) => setSelectedDivision(e.target.value)}
                        className="input-field bg-background max-w-[200px]"
                    >
                        <option value="">All Divisions</option>
                        {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>

                    <select
                        value={selectedRange}
                        onChange={(e) => setSelectedRange(e.target.value)}
                        disabled={!selectedDivision}
                        className="input-field bg-background max-w-[200px] disabled:opacity-50"
                    >
                        <option value="">All Ranges</option>
                        {ranges.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>

                    <select
                        value={selectedBeat}
                        onChange={(e) => setSelectedBeat(e.target.value)}
                        disabled={!selectedRange}
                        className="input-field bg-background max-w-[200px] disabled:opacity-50"
                    >
                        <option value="">All Beats</option>
                        {beats.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                </div>
            </div>

            <div className="relative w-full h-[500px] rounded-xl overflow-hidden border border-border z-0">
                {loadingGeo && (
                    <div className="absolute inset-0 bg-background/50 z-[1000] flex items-center justify-center backdrop-blur-sm">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                )}
                <MapContainer
                    center={[23.4733, 77.9479]} // MP Center approximate
                    zoom={6}
                    scrollWheelZoom={true}
                    className="w-full h-full"
                    style={{ zIndex: 1 }}
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                    />
                    {/* Base Layer: Division */}
                    {divisionGeo && (
                        <GeoJSON
                            key={`div-${JSON.stringify(divisionGeo)}`}
                            data={divisionGeo}
                            style={{
                                color: 'hsl(215.4, 16.3%, 46.9%)', // muted-foreground
                                weight: 2,
                                opacity: 0.5,
                                fillOpacity: 0.05
                            }}
                        />
                    )}

                    {/* Middle Layer: Range */}
                    {rangeGeo && (
                        <GeoJSON
                            key={`rng-${JSON.stringify(rangeGeo)}`}
                            data={rangeGeo}
                            style={{
                                color: 'hsl(214, 30%, 32%)', // secondary
                                weight: 3,
                                opacity: 0.8,
                                fillOpacity: 0.1
                            }}
                        />
                    )}

                    {/* Top Layer: Beat */}
                    {beatGeo && (
                        <GeoJSON
                            key={`bt-${JSON.stringify(beatGeo)}`}
                            data={beatGeo}
                            style={{
                                color: 'hsl(152, 60%, 46%)', // primary
                                weight: 4,
                                opacity: 1,
                                fillOpacity: 0.3
                            }}
                        />
                    )}

                    {/* Report Markers */}
                    {reportPoints && reportPoints.map((point) => (
                        <Marker
                            key={point.id}
                            position={[point.lat, point.lng]}
                            icon={iconMap[point.type as keyof typeof iconMap] || iconMap.default}
                        >
                            <Popup className="rounded-xl overflow-hidden">
                                <div className="p-1">
                                    <p className="font-bold text-sm m-0">{point.title}</p>
                                    <p className="text-xs text-muted-foreground m-0 mt-1">{point.subtitle}</p>
                                </div>
                            </Popup>
                        </Marker>
                    ))}

                    {/* Bound fitting (Fits to the most specific selection) */}
                    <MapBounds geojsonData={beatGeo || rangeGeo || divisionGeo} />
                </MapContainer>
            </div>
        </motion.div>
    );
}
