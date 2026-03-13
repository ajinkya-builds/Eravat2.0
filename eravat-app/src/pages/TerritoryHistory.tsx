import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../supabase';
import { MapPin, Calendar, Clock, AlertTriangle, Eye, Loader2, ArrowLeft, Radio, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';

interface HistoryItem {
    id: string;
    device_timestamp: string;
    status: string;
    geo_beats?: {
        name: string;
        geo_ranges?: {
            name: string;
        }
    };
    observations: {
        type: string;
        male_count: number;
        female_count: number;
        calf_count: number;
        unknown_count: number;
        indirect_sign_details?: string[];
        conflict_loss_details?: string[];
    }[];
    conflict_damages: {
        category: string;
        description: string;
    }[];
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

    useEffect(() => {
        if (!user?.id) return;
        const fetchAll = async () => {
            setFetchError(null);

            // Fetch reports (RLS scopes to territory owned by the user)
            const reportsPromise = supabase
                .from('reports')
                .select('id, device_timestamp, status, geo_beats(name, geo_ranges(name)), observations(*), conflict_damages(*)')
                .order('server_created_at', { ascending: false })
                .limit(50);

            // Fetch proximity notification report_ids for this user
            const notifPromise = supabase
                .from('notifications')
                .select('report_id')
                .eq('user_id', user.id)
                .eq('notification_type', 'proximity')
                .not('report_id', 'is', null);

            const [reportsRes, notifRes] = await Promise.all([reportsPromise, notifPromise]);

            if (reportsRes.error) {
                console.error('Error fetching history:', reportsRes.error);
                setFetchError(reportsRes.error.message || 'Failed to load activity history.');
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
                    .select('id, device_timestamp, status, geo_beats(name, geo_ranges(name)), observations(*), conflict_damages(*)')
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

                            const typeLabel = oType === 'direct' ? t('admin.dashboard.directSighting')
                                : oType === 'indirect' || oType === 'indirect_sign' ? t('admin.dashboard.indirectSign')
                                    : oType === 'loss' ? t('admin.dashboard.conflictReported') : t('history.unknownActivity');

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

                            const territory = [item.geo_beats?.name, item.geo_beats?.geo_ranges?.name]
                                .filter(Boolean)
                                .join(', ');

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

                                    <div className="glass-card rounded-xl p-3 border border-border/50 bg-background/50">
                                        <p className="text-sm font-medium text-foreground">{details || t('history.detailsNone')}</p>
                                    </div>

                                    {territory && (
                                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium pt-1">
                                            <MapPin size={14} className="text-primary/70" />
                                            {territory}
                                        </div>
                                    )}
                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
