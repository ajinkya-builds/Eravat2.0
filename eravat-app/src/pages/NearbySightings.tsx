import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, LocateFixed, Loader2, MapPin, Eye, Footprints, AlertTriangle, Navigation } from 'lucide-react';
import { Buffer } from 'buffer';
import wkx from 'wkx';
import * as turf from '@turf/turf';
import { supabase } from '../supabase';
import { useLanguage } from '../contexts/LanguageContext';
import { useGeolocation } from '../hooks/useGeolocation';
import { formatDistanceToNow } from 'date-fns';
import { trackClick, trackFailed, trackFilter } from '../lib/analytics';

type NearbyItem = {
    id: string;
    lat: number;
    lng: number;
    type: 'direct' | 'indirect' | 'loss';
    beatName: string;
    total: number;
    deviceTimestamp: string;
    distanceKm: number;
};

const RADIUS_OPTIONS = [10, 25, 50, 100];

const obsTypeMap: Record<string, 'direct' | 'indirect' | 'loss'> = {
    direct_sighting: 'direct', indirect_sign: 'indirect', conflict_loss: 'loss',
    direct: 'direct', indirect: 'indirect', loss: 'loss',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseLocation(loc: any): { lat: number; lng: number } | null {
    if (!loc) return null;
    try {
        if (typeof loc === 'string') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const geom = wkx.Geometry.parse(Buffer.from(loc, 'hex')) as any;
            const gj = geom.toGeoJSON();
            if (gj?.type === 'Point') return { lat: gj.coordinates[1], lng: gj.coordinates[0] };
            return null;
        }
        if (Array.isArray(loc.coordinates)) return { lat: loc.coordinates[1], lng: loc.coordinates[0] };
        return null;
    } catch {
        return null;
    }
}

export default function NearbySightings() {
    const navigate = useNavigate();
    const { t } = useLanguage();
    const { fetchLocation, loading: locating, error: geoError } = useGeolocation();

    const [radiusKm, setRadiusKm] = useState(100);
    const [items, setItems] = useState<NearbyItem[]>([]);
    const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
    const [loading, setLoading] = useState(false);
    const [loaded, setLoaded] = useState(false);

    const loadNearby = async (loc: { lat: number; lng: number }, radius: number) => {
        setLoading(true);
        try {
            const { data: rpcRows, error: rpcError } = await supabase.rpc('reports_nearby', {
                p_lng: loc.lng,
                p_lat: loc.lat,
                p_radius_m: radius * 1000,
                p_limit: 50,
            });

            if (!rpcError && Array.isArray(rpcRows)) {
                const rows: NearbyItem[] = rpcRows.map((rep: {
                    id: string;
                    device_timestamp: string;
                    beat_name?: string | null;
                    obs_type?: string | null;
                    male_count?: number;
                    female_count?: number;
                    calf_count?: number;
                    unknown_count?: number;
                    distance_m?: number;
                    lat?: number;
                    lng?: number;
                }) => ({
                    id: rep.id,
                    lat: rep.lat ?? loc.lat,
                    lng: rep.lng ?? loc.lng,
                    type: obsTypeMap[rep.obs_type ?? 'direct'] ?? 'direct',
                    beatName: rep.beat_name ?? 'Field',
                    total:
                        (rep.male_count || 0) +
                        (rep.female_count || 0) +
                        (rep.calf_count || 0) +
                        (rep.unknown_count || 0),
                    deviceTimestamp: rep.device_timestamp,
                    distanceKm: (rep.distance_m || 0) / 1000,
                }));
                rows.sort((a, b) => a.distanceKm - b.distanceKm);
                setItems(rows);
                setLoaded(true);
                return;
            }

            const { data, error } = await supabase
                .from('reports')
                .select(`
                    id, location, device_timestamp,
                    geo_beats ( name ),
                    observations ( type, male_count, female_count, calf_count, unknown_count )
                `)
                .not('location', 'is', null)
                .order('device_timestamp', { ascending: false })
                .limit(100);
            if (error) throw error;

            const rows: NearbyItem[] = [];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (data || []).forEach((rep: any) => {
                const coords = parseLocation(rep.location);
                if (!coords) return;
                const distanceKm = turf.distance([loc.lng, loc.lat], [coords.lng, coords.lat], { units: 'kilometers' });
                if (distanceKm > radius) return;
                const obs = rep.observations?.[0];
                const type = obsTypeMap[obs?.type ?? 'direct'] ?? 'direct';
                rows.push({
                    id: rep.id,
                    lat: coords.lat,
                    lng: coords.lng,
                    type,
                    beatName: rep.geo_beats?.name ?? 'Field',
                    total: (obs?.male_count || 0) + (obs?.female_count || 0) + (obs?.calf_count || 0) + (obs?.unknown_count || 0),
                    deviceTimestamp: rep.device_timestamp,
                    distanceKm,
                });
            });
            rows.sort((a, b) => a.distanceKm - b.distanceKm);
            setItems(rows);
            setLoaded(true);
        } catch (err) {
            console.error('[NearbySightings] load failed', err);
            setItems([]);
            setLoaded(true);
            trackFailed('nearby.load', 'fetch_failed', { screen: 'nearby' });
        } finally {
            setLoading(false);
        }
    };

    const handleLocate = async () => {
        trackClick('nearby.locate', { screen: 'nearby' });
        const pos = await fetchLocation();
        if (pos?.coords) {
            const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            setUserLoc(loc);
            void loadNearby(loc, radiusKm);
        } else {
            trackFailed('nearby.locate', 'geolocation_failed', { screen: 'nearby' });
        }
    };

    const handleRadiusChange = (r: number) => {
        setRadiusKm(r);
        trackFilter('nearby.radius_km', r, { screen: 'nearby' });
        if (userLoc) void loadNearby(userLoc, r);
    };

    const TypeIcon = ({ type }: { type: NearbyItem['type'] }) =>
        type === 'loss' ? <AlertTriangle size={18} /> : type === 'indirect' ? <Footprints size={18} /> : <Eye size={18} />;

    const typeColor = (type: NearbyItem['type']) =>
        type === 'loss' ? 'bg-destructive/15 text-destructive'
            : type === 'indirect' ? 'bg-amber-500/15 text-amber-600'
                : 'bg-emerald-500/15 text-emerald-600';

    const typeLabel = (type: NearbyItem['type']) =>
        type === 'loss' ? t('map.legendLoss') : type === 'indirect' ? t('map.legendIndirect') : t('map.legendDirect');

    return (
        <div className="min-h-screen bg-background pb-20 pt-8 px-4">
            <div className="max-w-md mx-auto relative z-10">
                <button onClick={() => navigate(-1)} className="mb-6 p-2 rounded-full glass-card border border-border hover:bg-muted transition-colors inline-flex items-center gap-2 pr-4 text-sm font-medium">
                    <ArrowLeft size={18} /> {t('history.backToDashboard')}
                </button>

                <div className="mb-6">
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('nearby.title')}</h1>
                    <p className="text-muted-foreground mt-1 text-sm">{t('nearby.subtitle')}</p>
                </div>

                {/* Controls */}
                <div className="flex flex-wrap items-center gap-3 mb-5">
                    <button
                        onClick={handleLocate}
                        disabled={locating}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60"
                    >
                        {locating ? <Loader2 size={16} className="animate-spin" /> : <LocateFixed size={16} />}
                        {locating ? t('nearby.locating') : t('nearby.locate')}
                    </button>
                    <div className="flex items-center gap-2 text-sm bg-muted/40 rounded-xl px-3 py-2 border border-border">
                        <span className="text-muted-foreground">{t('nearby.radius')}</span>
                        <select value={radiusKm} onChange={(e) => handleRadiusChange(Number(e.target.value))}
                            className="bg-transparent outline-none font-semibold text-foreground">
                            {RADIUS_OPTIONS.map((r) => <option key={r} value={r}>{r} {t('km')}</option>)}
                        </select>
                    </div>
                </div>

                {geoError && <p className="text-sm text-destructive mb-4">{geoError}</p>}

                {loading ? (
                    <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" size={32} /></div>
                ) : !userLoc && !loaded ? (
                    <div className="text-center py-16 glass-card rounded-3xl border border-border">
                        <Navigation className="mx-auto h-12 w-12 text-muted-foreground opacity-50 mb-4" />
                        <p className="text-muted-foreground text-sm px-6">{t('nearby.needLocation')}</p>
                    </div>
                ) : items.length === 0 ? (
                    <div className="text-center py-16 glass-card rounded-3xl border border-border">
                        <MapPin className="mx-auto h-12 w-12 text-muted-foreground opacity-50 mb-4" />
                        <p className="text-muted-foreground text-sm">{t('nearby.noneWithin')} {radiusKm} {t('km')}.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {items.map((item, i) => (
                            <motion.div
                                key={item.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: Math.min(i * 0.04, 0.4) }}
                                className="p-4 rounded-2xl border border-border bg-card/50 backdrop-blur-md shadow-sm flex items-start gap-3"
                            >
                                <div className={`p-2 rounded-xl shrink-0 ${typeColor(item.type)}`}>
                                    <TypeIcon type={item.type} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-2">
                                        <h3 className="font-bold text-sm text-foreground truncate">{typeLabel(item.type)}</h3>
                                        <span className="text-xs font-semibold text-primary shrink-0">
                                            {item.distanceKm < 1 ? `${Math.round(item.distanceKm * 1000)} m` : `${item.distanceKm.toFixed(1)} ${t('km')}`} {t('nearby.away')}
                                        </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                        <MapPin size={11} className="inline mb-0.5 mr-1" />
                                        {item.beatName}
                                        {item.total > 0 ? ` · ${item.total} ${t('nearby.elephants')}` : ''}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground/80 mt-0.5">
                                        {formatDistanceToNow(new Date(item.deviceTimestamp), { addSuffix: true })}
                                    </p>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
