import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../supabase';
import { MapPin, Calendar, Clock, AlertTriangle, Eye, Loader2, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';

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
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchHistory = async () => {
            // Because RLS is active, users will ONLY see reports they are allowed to see 
            // (either their own, or those in their assigned territory)
            const { data, error } = await supabase
                .from('reports')
                .select('id, device_timestamp, status, geo_beats(name, geo_ranges(name)), observations(*), conflict_damages(*)')
                .order('server_created_at', { ascending: false })
                .limit(50);

            if (error) {
                console.error("Error fetching history:", error);
            } else {
                // Safely cast the PostgREST response
                setHistory((data as unknown) as HistoryItem[] || []);
            }
            setLoading(false);
        };

        fetchHistory();
    }, []);

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
                                const damages = item.conflict_damages.map(d => d.description).join(', ') || 'Unspecified';
                                details = `${t('history.damages')}${damages}`;
                            }

                            const territory = [item.geo_beats?.name, item.geo_beats?.geo_ranges?.name]
                                .filter(Boolean)
                                .join(', ');

                            const colorClass = oType ? typeColors[oType] : 'bg-muted text-muted-foreground border-border';
                            const Icon = ['loss', 'conflict_loss'].includes(oType || '') ? AlertTriangle : Eye;

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
