import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Buffer } from 'buffer';
import wkx from 'wkx';
import { supabase } from '../supabase';
import { MapPin, Calendar, Clock, AlertTriangle, Eye, Loader2, ArrowLeft, Radio, Shield, Share2, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { shareOrCopy, downloadTextFile, mapsLink, buildSightingShareText } from '../lib/reportShare';
import { formatLatLngDms } from '../lib/geoFormat';
import { db } from '../db';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseLoc(loc: any): { lat: number; lng: number } | null {
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

interface HistoryItem {
    id: string;
    device_timestamp: string;
    status: string;
    notes?: string | null;
    location?: string | null;
    geo_beats?: {
        name: string;
        geo_ranges?: {
            name: string;
            geo_divisions?: { name: string };
        }
    };
    observations: {
        type: string;
        male_count: number;
        female_count: number;
        calf_count: number;
        unknown_count: number;
        compass_bearing?: number | null;
        indirect_sign_details?: string[];
        conflict_loss_details?: string[];
    }[];
    conflict_damages: {
        category: string;
        description: string;
    }[];
    report_media?: { storage_path?: string | null }[];
}

const typeColors: Record<string, string> = {
    'direct': 'bg-emerald-500/15 text-emerald-600 border-emerald-500/20',
    'direct_sighting': 'bg-emerald-500/15 text-emerald-600 border-emerald-500/20',
    'indirect': 'bg-amber-500/15 text-amber-600 border-amber-500/20',
    'indirect_sign': 'bg-amber-500/15 text-amber-600 border-amber-500/20',
    'loss': 'bg-destructive/15 text-destructive border-destructive/20',
    'conflict_loss': 'bg-destructive/15 text-destructive border-destructive/20',
};

export default function TerritoryHistory() {
    const navigate = useNavigate();
    const { t } = useLanguage();
    const { user } = useAuth();
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [proximityReportIds, setProximityReportIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [shareMsg, setShareMsg] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const handleShare = async (item: HistoryItem, text: string, coords: { lat: number; lng: number } | null) => {
        const url = coords ? mapsLink(coords.lat, coords.lng) : undefined;
        let file: File | undefined;
        // Fetch media lazily with select('*') so the History list never breaks if
        // the media path column differs across environments (file_path/storage_path/path).
        try {
            const { data: media } = await supabase
                .from('report_media')
                .select('*')
                .eq('report_id', item.id)
                .limit(1);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const row: any = media?.[0];
            const path = row?.storage_path || row?.file_path || row?.path;
            if (path) {
                const { data } = await supabase.storage.from('report_media').createSignedUrl(path, 3600);
                if (data?.signedUrl) {
                    const resp = await fetch(data.signedUrl);
                    if (resp.ok) {
                        const blob = await resp.blob();
                        file = new File([blob], `sighting-${item.id}.jpg`, { type: blob.type || 'image/jpeg' });
                    }
                }
            }
        } catch { /* share text only if photo cannot be fetched */ }
        const res = await shareOrCopy({ title: t('share.reportTitle'), text, url, file });
        if (res === 'copied') setShareMsg(t('share.copied'));
        else if (res === 'failed') setShareMsg(t('share.failed'));
        if (res === 'copied' || res === 'failed') setTimeout(() => setShareMsg(null), 2500);
    };

    const handleDownload = (item: HistoryItem, text: string, coords: { lat: number; lng: number } | null) => {
        const full = coords ? `${text}\n${t('share.map')}: ${mapsLink(coords.lat, coords.lng)}` : text;
        downloadTextFile(`sighting-${item.id}.txt`, full);
    };

    useEffect(() => {
        if (!user?.id) return;
        const fetchAll = async () => {
            setFetchError(null);

            // Fetch reports (RLS scopes to territory owned by the user)
            const reportsPromise = supabase
                .from('reports')
                .select(`
                    id,
                    device_timestamp,
                    status,
                    notes,
                    location,
                    geo_beats(name, geo_ranges(name, geo_divisions(name))),
                    observations(
                        type,
                        male_count,
                        female_count,
                        calf_count,
                        unknown_count,
                        compass_bearing,
                        indirect_sign_details,
                        conflict_loss_details
                    ),
                    conflict_damages(category, description),
                    report_media(storage_path)
                `)
                .order('server_created_at', { ascending: false })
                .limit(50);

            // Fetch proximity notification report_ids for this user
            const notifPromise = supabase
                .from('notifications')
                .select('report_id')
                .eq('user_id', user.id)
                .eq('notification_type', 'proximity')
                .not('report_id', 'is', null)
                .limit(200);

            const [reportsRes, notifRes] = await Promise.all([reportsPromise, notifPromise]);

            if (reportsRes.error) {
                console.error('Error fetching history:', reportsRes.error);
                setFetchError(reportsRes.error.message || 'Failed to load activity history.');
                const local = await db.reports.orderBy('device_timestamp').reverse().limit(50).toArray();
                if (local.length) {
                    setHistory(local.map((r) => ({
                        id: r.id,
                        device_timestamp: r.device_timestamp,
                        status: r.status,
                        notes: r.notes,
                        location: r.latitude != null && r.longitude != null
                            ? { coordinates: [r.longitude, r.latitude] }
                            : null,
                        observations: [{
                            type: r.observation_type || 'direct',
                            male_count: r.male_count,
                            female_count: r.female_count,
                            calf_count: r.calf_count,
                            unknown_count: r.unknown_count,
                            compass_bearing: r.compass_bearing,
                            indirect_sign_details: r.indirect_sign_details,
                            conflict_loss_details: r.conflict_loss_details,
                        }],
                        conflict_damages: (r.loss_type || []).map((category) => ({
                            category,
                            description: r.damage_description || '',
                        })),
                    })) as unknown as HistoryItem[]);
                    setFetchError(null);
                }
            } else {
                setHistory((reportsRes.data as unknown) as HistoryItem[] || []);
            }

            if (!notifRes.error && notifRes.data) {
                const ids = new Set<string>(
                    notifRes.data.map((n: { report_id: string }) => n.report_id).filter(Boolean)
                );
                setProximityReportIds(ids);
            }

            setLoading(false);
        };

        fetchAll();
    }, [user?.id]);

    const handleRetry = () => {
        setLoading(true);
        setFetchError(null);
        setHistory([]);
        setProximityReportIds(new Set());
        // Re-trigger effect by bumping user dep isn't possible; call directly
        if (!user?.id) return;
        const refetch = async () => {
            const [reportsRes, notifRes] = await Promise.all([
                supabase
                    .from('reports')
                    .select('id, device_timestamp, status, location, geo_beats(name, geo_ranges(name)), observations(*), conflict_damages(*)')
                    .order('server_created_at', { ascending: false })
                    .limit(50),
                supabase
                    .from('notifications')
                    .select('report_id')
                    .eq('user_id', user.id)
                    .eq('notification_type', 'proximity')
                    .not('report_id', 'is', null),
            ]);
            if (reportsRes.error) {
                setFetchError(reportsRes.error.message || 'Failed to load activity history.');
            } else {
                setHistory((reportsRes.data as unknown) as HistoryItem[] || []);
            }
            if (!notifRes.error && notifRes.data) {
                setProximityReportIds(new Set(
                    notifRes.data.map((n: { report_id: string }) => n.report_id).filter(Boolean)
                ));
            }
            setLoading(false);
        };
        refetch();
    };

    return (
        <div className="min-h-screen bg-background pb-20 pt-8 px-4">
            <div className="max-w-md mx-auto relative relative z-10 font-sans">

                <button onClick={() => navigate(-1)} className="mb-6 p-2 rounded-full glass-card border border-border hover:bg-muted transition-colors inline-flex items-center gap-2 pr-4 text-sm font-medium">
                    <ArrowLeft size={18} /> {t('history.backToDashboard')}
                </button>

                <div className="mb-6">
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('history.title')}</h1>
                    <p className="text-muted-foreground mt-1 text-sm">{t('history.subtitle')}</p>
                </div>

                {loading ? (
                    <div className="flex justify-center py-20">
                        <Loader2 className="animate-spin text-primary" size={32} />
                    </div>
                ) : fetchError ? (
                    <div className="text-center py-16 glass-card rounded-3xl border border-destructive/30 bg-destructive/5">
                        <AlertTriangle className="mx-auto h-12 w-12 text-destructive/70 mb-4" />
                        <h3 className="text-lg font-bold text-foreground">Unable to load history</h3>
                        <p className="text-muted-foreground text-sm mt-1 px-4">{fetchError}</p>
                        <button
                            onClick={handleRetry}
                            className="mt-4 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
                        >
                            Try Again
                        </button>
                    </div>
                ) : history.length === 0 ? (
                    <div className="text-center py-16 glass-card rounded-3xl border border-border">
                        <Clock className="mx-auto h-12 w-12 text-muted-foreground opacity-50 mb-4" />
                        <h3 className="text-lg font-bold text-foreground">{t('history.noActivity')}</h3>
                        <p className="text-muted-foreground text-sm mt-1">{t('history.noActivityDesc')}</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {history.map((item, i) => {
                            const o = item.observations?.[0];
                            const d = item.conflict_damages?.[0];
                            const oType = o?.type ?? (d ? 'loss' : null);

                            const typeLabel = ['direct', 'direct_sighting'].includes(oType || '') ? t('admin.dashboard.directSighting')
                                : ['indirect', 'indirect_sign'].includes(oType || '') ? t('admin.dashboard.indirectSign')
                                    : ['loss', 'conflict_loss'].includes(oType || '') ? t('admin.dashboard.conflictReported') : t('history.unknownActivity');

                            const title = oType ? typeLabel : t('history.activityLogged');

                            let details = '';
                            if (['direct', 'direct_sighting'].includes(oType || '')) {
                                const total = (o?.male_count || 0) + (o?.female_count || 0) + (o?.calf_count || 0) + (o?.unknown_count || 0);
                                details = `${total} ${t('history.elephantsSighted')}`;
                            } else if (['indirect', 'indirect_sign'].includes(oType || '')) {
                                const signs = Array.isArray(o?.indirect_sign_details) ? o.indirect_sign_details.join(', ') : (o?.indirect_sign_details || 'Unspecified');
                                details = `${t('history.signs')}${signs}`;
                            } else if (['loss', 'conflict_loss'].includes(oType || '')) {
                                const damages = Array.isArray(o?.conflict_loss_details) && o.conflict_loss_details.length > 0
                                    ? o.conflict_loss_details.join(', ')
                                    : item.conflict_damages.map(d => d.description).join(', ') || 'Unspecified';
                                details = `${t('history.damages')}${damages}`;
                            }

                            const territory = [item.geo_beats?.geo_ranges?.geo_divisions?.name, item.geo_beats?.geo_ranges?.name, item.geo_beats?.name]
                                .filter(Boolean)
                                .join(', ');

                            const coords = parseLoc(item.location);
                            const elephantTotal = (o?.male_count || 0) + (o?.female_count || 0) + (o?.calf_count || 0) + (o?.unknown_count || 0);
                            const damageText = item.conflict_damages?.length
                                ? item.conflict_damages.map(d => [d.category, d.description].filter(Boolean).join(' — ')).join(', ')
                                : (Array.isArray(o?.conflict_loss_details) ? o.conflict_loss_details.join(', ') : null);
                            const shareText = buildSightingShareText({
                                typeLabel: title,
                                dateLabel: new Date(item.device_timestamp).toLocaleString(),
                                division: item.geo_beats?.geo_ranges?.geo_divisions?.name,
                                range: item.geo_beats?.geo_ranges?.name,
                                beat: item.geo_beats?.name,
                                elephantTotal,
                                directionDeg: o?.compass_bearing ?? null,
                                damage: damageText,
                                lat: coords?.lat,
                                lng: coords?.lng,
                                dms: coords ? formatLatLngDms(coords.lat, coords.lng) : null,
                                labels: {
                                    title: t('share.reportTitle'),
                                    type: t('share.sightingType'),
                                    date: t('share.date'),
                                    division: t('dtl_division'),
                                    range: t('dtl_range'),
                                    beat: t('dtl_beat'),
                                    elephants: t('nearby.elephants'),
                                    direction: t('share.direction'),
                                    damage: t('share.damage'),
                                    gps: t('share.coordinates'),
                                    dms: t('dtl_dms_location'),
                                    map: t('share.map'),
                                    photo: t('share.photo'),
                                },
                            });

                            const colorClass = oType ? typeColors[oType] : 'bg-muted text-muted-foreground border-border';
                            const Icon = ['loss', 'conflict_loss'].includes(oType || '') ? AlertTriangle : Eye;

                            // Determine source: proximity (radius subscription) or territory (assigned area)
                            const isProximity = proximityReportIds.has(item.id);

                            return (
                                <motion.div
                                    key={item.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.05 }}
                                    className={`p-4 rounded-2xl border bg-card/50 backdrop-blur-md shadow-sm space-y-3 relative overflow-hidden`}
                                    onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                                >
                                    <div className={`absolute top-0 right-0 w-24 h-24 rounded-full blur-3xl opacity-20 pointer-events-none ${colorClass.split(' ')[0]}`} />

                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center gap-2">
                                            <div className={`p-2 rounded-xl ${colorClass.split(' ').slice(0, 2).join(' ')}`}>
                                                <Icon size={18} />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-sm text-foreground">{title}</h3>
                                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5 font-medium">
                                                    <Calendar size={12} />
                                                    {new Date(item.device_timestamp).toLocaleDateString()}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Source badge: Territory owned vs Proximity radius */}
                                        <div
                                            title={isProximity
                                                ? 'This activity is within your configured alert radius'
                                                : 'This activity is in your assigned territory'}
                                            className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold border ${
                                                isProximity
                                                    ? 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                                                    : 'bg-primary/10 text-primary border-primary/20'
                                            }`}
                                        >
                                            {isProximity
                                                ? <><Radio size={11} /> Radius</>
                                                : <><Shield size={11} /> Territory</>
                                            }
                                        </div>
                                    </div>

                                    {expandedId === item.id && (
                                        <div className="glass-card rounded-xl p-3 border border-border/50 bg-background/50 space-y-1 text-xs">
                                            <p className="text-sm font-medium text-foreground">{details || t('history.detailsNone')}</p>
                                            {o?.compass_bearing != null && <p>{t('share.direction')}: {Math.round(Number(o.compass_bearing))}°</p>}
                                            {item.notes && <p>{t('ot_description')}: {item.notes}</p>}
                                            {coords && (
                                                <>
                                                    <p className="font-mono">{t('share.coordinates')}: {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}</p>
                                                    <p className="font-mono">{t('dtl_dms_location')}: {formatLatLngDms(coords.lat, coords.lng)}</p>
                                                </>
                                            )}
                                        </div>
                                    )}
                                    {expandedId !== item.id && (
                                    <div className="glass-card rounded-xl p-3 border border-border/50 bg-background/50">
                                        <p className="text-sm font-medium text-foreground">{details || t('history.detailsNone')}</p>
                                    </div>
                                    )}

                                    {territory && (
                                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium pt-1">
                                            <MapPin size={14} className="text-primary/70" />
                                            {territory}
                                        </div>
                                    )}

                                    {/* Share / download the uploaded report (review §9.3) */}
                                    <div className="flex items-center gap-2 pt-1">
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); handleShare(item, shareText, coords); }}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-background/50 text-xs font-semibold text-foreground hover:bg-muted/50 transition-colors"
                                        >
                                            <Share2 size={14} /> {t('share.share')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); handleDownload(item, shareText, coords); }}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-background/50 text-xs font-semibold text-foreground hover:bg-muted/50 transition-colors"
                                        >
                                            <Download size={14} /> {t('share.download')}
                                        </button>
                                    </div>
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
