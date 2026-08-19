import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, LocateFixed, Loader2, MapPin, Eye, Footprints, AlertTriangle, Navigation, Share2, ChevronDown, Download } from 'lucide-react';
import { Buffer } from 'buffer';
import wkx from 'wkx';
import * as turf from '@turf/turf';
import { supabase } from '../supabase';
import { useLanguage } from '../contexts/LanguageContext';
import { useGeolocation } from '../hooks/useGeolocation';
import { formatDistanceToNow } from 'date-fns';
import { trackClick, trackFailed, trackFilter } from '../lib/analytics';
import { RadiusSlider } from '../components/shared/RadiusSlider';
import { shareOrCopy, buildSightingShareText, downloadTextFile, mapsLink, formatShareDate } from '../lib/reportShare';
import { formatLatLngDms } from '../lib/geoFormat';

type NearbyItem = {
    id: string;
    lat: number;
    lng: number;
    type: 'direct' | 'indirect' | 'loss';
    beatName: string;
    rangeName: string;
    divisionName: string;
    total: number;
    deviceTimestamp: string;
    distanceKm: number;
    compassBearing: number | null;
    indirectSigns: string[];
    damage: string | null;
    notes: string | null;
    photoPath: string | null;
};

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
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [shareMsg, setShareMsg] = useState<string | null>(null);

    const shareLabels = {
        title: t('share.reportTitle'),
        type: t('share.sightingType'),
        date: t('share.date'),
        division: t('dtl_division'),
        range: t('dtl_range'),
        beat: t('dtl_beat'),
        elephants: t('nearby.elephants'),
        direction: t('share.direction'),
        damage: t('share.damage'),
        description: t('ot_description'),
        gps: t('share.coordinates'),
        dms: t('dtl_dms_location'),
        map: t('share.map'),
        photo: t('share.photo'),
    };

    const loadNearby = async (loc: { lat: number; lng: number }, radius: number) => {
        setLoading(true);
        try {
            const { data: rpcRows, error: rpcError } = await supabase.rpc('reports_nearby', {
                p_lng: loc.lng,
                p_lat: loc.lat,
                p_radius_m: Math.max(radius, 1) * 1000,
                p_limit: 50,
            });

            if (!rpcError && Array.isArray(rpcRows)) {
                const rows: NearbyItem[] = rpcRows.map((rep: {
                    id: string;
                    device_timestamp: string;
                    beat_name?: string | null;
                    range_name?: string | null;
                    division_name?: string | null;
                    obs_type?: string | null;
                    male_count?: number;
                    female_count?: number;
                    calf_count?: number;
                    unknown_count?: number;
                    compass_bearing?: number | null;
                    indirect_sign_details?: string[] | null;
                    conflict_loss_details?: string[] | null;
                    damage_categories?: string[] | null;
                    damage_description?: string | null;
                    notes?: string | null;
                    photo_path?: string | null;
                    distance_m?: number;
                    lat?: number;
                    lng?: number;
                }) => {
                    const damageParts = [
                        ...(rep.damage_categories || []),
                        ...(rep.conflict_loss_details || []),
                        rep.damage_description || '',
                    ].filter(Boolean);
                    return {
                        id: rep.id,
                        lat: rep.lat ?? loc.lat,
                        lng: rep.lng ?? loc.lng,
                        type: obsTypeMap[rep.obs_type ?? 'direct'] ?? 'direct',
                        beatName: rep.beat_name ?? '',
                        rangeName: rep.range_name ?? '',
                        divisionName: rep.division_name ?? '',
                        total:
                            (rep.male_count || 0) +
                            (rep.female_count || 0) +
                            (rep.calf_count || 0) +
                            (rep.unknown_count || 0),
                        deviceTimestamp: rep.device_timestamp,
                        distanceKm: (rep.distance_m || 0) / 1000,
                        compassBearing: rep.compass_bearing ?? null,
                        indirectSigns: rep.indirect_sign_details || [],
                        damage: damageParts.join(', ') || null,
                        notes: rep.notes ?? null,
                        photoPath: rep.photo_path ?? null,
                    };
                });
                rows.sort((a, b) => a.distanceKm - b.distanceKm);
                setItems(rows);
                setLoaded(true);
                return;
            }

            const { data, error } = await supabase
                .from('reports')
                .select(`
                    id, location, device_timestamp, notes,
                    geo_beats ( name, geo_ranges ( name, geo_divisions ( name ) ) ),
                    observations ( type, male_count, female_count, calf_count, unknown_count, compass_bearing, indirect_sign_details, conflict_loss_details ),
                    conflict_damages ( category, description )
                `)
                .not('location', 'is', null)
                .order('device_timestamp', { ascending: false })
                .limit(80);
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
                const damages = (rep.conflict_damages || [])
                    .map((d: { category?: string; description?: string }) => [d.category, d.description].filter(Boolean).join(' — '))
                    .filter(Boolean);
                rows.push({
                    id: rep.id,
                    lat: coords.lat,
                    lng: coords.lng,
                    type,
                    beatName: rep.geo_beats?.name ?? '',
                    rangeName: rep.geo_beats?.geo_ranges?.name ?? '',
                    divisionName: rep.geo_beats?.geo_ranges?.geo_divisions?.name ?? '',
                    total: (obs?.male_count || 0) + (obs?.female_count || 0) + (obs?.calf_count || 0) + (obs?.unknown_count || 0),
                    deviceTimestamp: rep.device_timestamp,
                    distanceKm,
                    compassBearing: obs?.compass_bearing ?? null,
                    indirectSigns: obs?.indirect_sign_details || [],
                    damage: damages.join(', ') || (obs?.conflict_loss_details || []).join(', ') || null,
                    notes: rep.notes ?? null,
                    photoPath: null,
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

    useEffect(() => {
        void handleLocate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const typeLabel = (type: NearbyItem['type']) =>
        type === 'loss' ? t('map.legendLoss') : type === 'indirect' ? t('map.legendIndirect') : t('map.legendDirect');

    const handleShare = async (item: NearbyItem) => {
        let photoUrl: string | undefined;
        let file: File | undefined;
        if (item.photoPath) {
            try {
                const { data } = await supabase.storage.from('report_media').createSignedUrl(item.photoPath, 3600);
                photoUrl = data?.signedUrl;
                if (photoUrl) {
                    const resp = await fetch(photoUrl);
                    if (resp.ok) {
                        const blob = await resp.blob();
                        file = new File([blob], `sighting-${item.id}.jpg`, { type: blob.type || 'image/jpeg' });
                    }
                }
            } catch { /* share text only */ }
        }
        const text = buildSightingShareText({
            typeLabel: typeLabel(item.type),
            dateLabel: formatShareDate(item.deviceTimestamp),
            division: item.divisionName,
            range: item.rangeName,
            beat: item.beatName,
            elephantTotal: item.total,
            directionDeg: item.compassBearing,
            damage: item.damage,
            notes: item.notes,
            lat: item.lat,
            lng: item.lng,
            dms: formatLatLngDms(item.lat, item.lng),
            photoUrl,
            labels: shareLabels,
        });
        const res = await shareOrCopy({ title: t('share.reportTitle'), text, file });
        if (res === 'copied') setShareMsg(t('share.copied'));
        else if (res === 'failed') setShareMsg(t('share.failed'));
        if (res === 'copied' || res === 'failed') setTimeout(() => setShareMsg(null), 2500);
    };

    const TypeIcon = ({ type }: { type: NearbyItem['type'] }) =>
        type === 'loss' ? <AlertTriangle size={18} /> : type === 'indirect' ? <Footprints size={18} /> : <Eye size={18} />;

    const typeColor = (type: NearbyItem['type']) =>
        type === 'loss' ? 'bg-destructive/15 text-destructive'
            : type === 'indirect' ? 'bg-amber-500/15 text-amber-600'
                : 'bg-emerald-500/15 text-emerald-600';

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

                <div className="space-y-4 mb-5">
                    <button
                        onClick={handleLocate}
                        disabled={locating}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60"
                    >
                        {locating ? <Loader2 size={16} className="animate-spin" /> : <LocateFixed size={16} />}
                        {locating ? t('nearby.locating') : t('nearby.locate')}
                    </button>
                    <div className="glass-card rounded-2xl p-4 border border-border space-y-2">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">{t('nearby.radius')}</span>
                            <span className="font-semibold text-foreground">{radiusKm} {t('km')}</span>
                        </div>
                        <RadiusSlider value={radiusKm} onChange={handleRadiusChange} min={0} max={100} />
                    </div>
                </div>

                {geoError && (
                    <p className="text-sm text-destructive mb-4">
                        {geoError === 'LOCATION_PERMISSION_DENIED'
                            ? t('geo_err_denied')
                            : geoError === 'LOCATION_UNAVAILABLE'
                              ? t('geo_err_unavailable')
                              : geoError === 'LOCATION_TIMEOUT'
                                ? t('geo_err_timeout')
                                : geoError === 'LOCATION_UNSUPPORTED'
                                  ? t('geo_err_unsupported')
                                  : t('geo_err_failed')}
                    </p>
                )}

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
                        {items.map((item, i) => {
                            const open = expandedId === item.id;
                            return (
                                <motion.div
                                    key={item.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: Math.min(i * 0.04, 0.4) }}
                                    className="p-4 rounded-2xl border border-border bg-card/50 backdrop-blur-md shadow-sm"
                                >
                                    <button
                                        type="button"
                                        onClick={() => setExpandedId(open ? null : item.id)}
                                        className="w-full flex items-start gap-3 text-left"
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
                                                {[item.divisionName, item.rangeName, item.beatName].filter(Boolean).join(' · ') || item.beatName}
                                                {item.total > 0 ? ` · ${item.total} ${t('nearby.elephants')}` : ''}
                                            </p>
                                            <p className="text-[11px] text-muted-foreground/80 mt-0.5">
                                                {formatDistanceToNow(new Date(item.deviceTimestamp), { addSuffix: true })}
                                            </p>
                                        </div>
                                        <ChevronDown size={16} className={`text-muted-foreground shrink-0 mt-1 transition-transform ${open ? 'rotate-180' : ''}`} />
                                    </button>
                                    <AnimatePresence>
                                        {open && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                className="overflow-hidden"
                                            >
                                                <div className="mt-3 pt-3 border-t border-border/60 space-y-1.5 text-xs text-foreground">
                                                    <p>{t('share.sightingType')}: {typeLabel(item.type)}</p>
                                                    {item.divisionName && <p>{t('dtl_division')}: {item.divisionName}</p>}
                                                    {item.rangeName && <p>{t('dtl_range')}: {item.rangeName}</p>}
                                                    {item.beatName && <p>{t('dtl_beat')}: {item.beatName}</p>}
                                                    {item.total > 0 && <p>{t('nearby.elephants')}: {item.total}</p>}
                                                    {item.compassBearing != null && <p>{t('share.direction')}: {Math.round(item.compassBearing)}°</p>}
                                                    {item.indirectSigns.length > 0 && <p>{t('ot_indirect_sign_type')}: {item.indirectSigns.join(', ')}</p>}
                                                    {item.damage && <p>{t('share.damage')}: {item.damage}</p>}
                                                    {item.notes && <p>{t('ot_description')}: {item.notes}</p>}
                                                    <p className="font-mono">{t('share.coordinates')}: {item.lat.toFixed(6)}, {item.lng.toFixed(6)}</p>
                                                    <p className="font-mono">{t('dtl_dms_location')}: {formatLatLngDms(item.lat, item.lng)}</p>
                                                    <a
                                                        href={mapsLink(item.lat, item.lng)}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="block text-primary font-semibold"
                                                    >
                                                        {t('share.map')}
                                                    </a>
                                                    <div className="mt-2 flex gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleShare(item)}
                                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-background text-xs font-semibold"
                                                    >
                                                        <Share2 size={14} /> {t('share.share')}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const text = buildSightingShareText({
                                                                typeLabel: typeLabel(item.type),
                                                                dateLabel: formatShareDate(item.deviceTimestamp),
                                                                division: item.divisionName,
                                                                range: item.rangeName,
                                                                beat: item.beatName,
                                                                elephantTotal: item.total,
                                                                directionDeg: item.compassBearing,
                                                                damage: item.damage,
                                                                notes: item.notes,
                                                                lat: item.lat,
                                                                lng: item.lng,
                                                                dms: formatLatLngDms(item.lat, item.lng),
                                                                labels: shareLabels,
                                                            });
                                                            downloadTextFile(`sighting-${item.id}.txt`, `${text}\n${t('share.map')}: ${mapsLink(item.lat, item.lng)}`);
                                                        }}
                                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-background text-xs font-semibold"
                                                    >
                                                        <Download size={14} /> {t('share.download')}
                                                    </button>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            );
                        })}
                    </div>
                )}

                {shareMsg && (
                    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[10000] px-4 py-2 rounded-xl bg-foreground text-background text-sm font-medium shadow-lg">
                        {shareMsg}
                    </div>
                )}
            </div>
        </div>
    );
}
