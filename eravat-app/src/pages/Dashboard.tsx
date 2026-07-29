import { motion } from 'framer-motion';
import { ShieldCheck, History, User, Activity, CloudOff, RefreshCw, ChevronRight, UserPlus, MapPin, Loader2 } from 'lucide-react';
import { canOnboardVolunteers } from '../lib/rbac';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { syncData } from '../services/syncService';
import { cn } from '../lib/utils';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { ELEPHANT_LOGO_URL } from '../lib/publicAsset';
import { QuickSOSButton } from '../components/shared/QuickSOSButton';
import { Network } from '@capacitor/network';
import { supabase } from '../supabase';
import { formatDistanceToNow } from 'date-fns';

type RecentSighting = {
    id: string;
    device_timestamp: string;
    beat_name?: string | null;
    obs_type?: string | null;
    elephant_total: number;
};

export default function Dashboard() {
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const navigate = useNavigate();
    const { profile, user } = useAuth();
    const { t } = useLanguage();
    const [isOnline, setIsOnline] = useState(true);
    const [recentSightings, setRecentSightings] = useState<RecentSighting[]>([]);
    const [recentLoading, setRecentLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;

        const updateStatus = (connected: boolean) => {
            if (isMounted) {
                setIsOnline(connected);
            }
        };

        Network.getStatus().then(status => {
            updateStatus(status.connected);
        });

        const listener = Network.addListener('networkStatusChange', status => {
            updateStatus(status.connected);
        });

        const handleOnline = () => updateStatus(true);
        const handleOffline = () => updateStatus(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            isMounted = false;
            void listener.then(l => l.remove());
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    useEffect(() => {
        if (!user?.id) return;
        let cancelled = false;
        const loadRecent = async () => {
            setRecentLoading(true);
            const { data, error } = await supabase
                .from('reports')
                .select(`
                    id,
                    device_timestamp,
                    geo_beats ( name ),
                    observations ( type, male_count, female_count, calf_count, unknown_count )
                `)
                .order('device_timestamp', { ascending: false })
                .limit(8);

            if (cancelled) return;
            if (error) {
                console.error('[Dashboard] recent sightings', error);
                setRecentSightings([]);
            } else {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const rows: RecentSighting[] = (data || []).map((r: any) => {
                    const obs = r.observations?.[0];
                    const elephant_total =
                        (obs?.male_count || 0) +
                        (obs?.female_count || 0) +
                        (obs?.calf_count || 0) +
                        (obs?.unknown_count || 0);
                    return {
                        id: r.id,
                        device_timestamp: r.device_timestamp,
                        beat_name: r.geo_beats?.name ?? null,
                        obs_type: obs?.type ?? null,
                        elephant_total,
                    };
                });
                setRecentSightings(rows);
            }
            setRecentLoading(false);
        };
        void loadRecent();
        return () => { cancelled = true; };
    }, [user?.id]);

    const pendingCount = useLiveQuery(
        () => db.reports.where('sync_status').anyOf(['pending', 'failed']).count(),
        []
    );

    const handleManualSync = async () => {
        if (!pendingCount || isSyncing) return;
        setIsSyncing(true);
        setSyncMessage(null);
        try {
            const result = await syncData();
            if (result.success) {
                const skipped = Boolean((result as { skipped?: boolean }).skipped);
                const total = result.total ?? result.count;
                let text: string;
                if (skipped) {
                    text = t('sync_in_progress') || 'Sync already in progress…';
                } else if (result.count === 0) {
                    text = t('sync_already_done') || 'Everything is already synced.';
                } else {
                    text = `Synced ${result.count} of ${total} reports successfully!`;
                }
                setSyncMessage({ type: 'success', text });
                setTimeout(() => setSyncMessage(null), 3000);
            } else {
                setSyncMessage({
                    type: 'error',
                    text: result.error?.toString() || 'Sync failed. Please try again.'
                });
            }
        } catch {
            setSyncMessage({
                type: 'error',
                text: 'Sync failed. Please check your connection.'
            });
        } finally {
            setIsSyncing(false);
        }
    };

    const hasAdminAccess = ['admin', 'ccf', 'dfo'].includes(profile?.role || '');
    const canOnboard = canOnboardVolunteers(profile?.role);

    const typeLabel = (type?: string | null) => {
        if (!type) return 'Observation';
        const lower = type.toLowerCase();
        if (lower.includes('direct')) return 'Direct';
        if (lower.includes('indirect')) return 'Indirect';
        if (lower.includes('loss') || lower.includes('conflict')) return 'Conflict';
        return type;
    };

    return (
        <div className="relative min-h-screen w-full bg-background overflow-hidden flex flex-col pt-6 px-6 pb-24">
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/10 blur-[100px] pointer-events-none" />
            <div className="absolute bottom-[20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-emerald-500/10 blur-[100px] pointer-events-none" />

            <div className="max-w-2xl mx-auto w-full relative z-10 flex flex-col h-full">
                <div className="flex flex-col items-center mb-8 mt-2 text-center">
                    <div className="w-24 h-24 sm:w-28 sm:h-28 mb-4 relative flex items-center justify-center overflow-visible">
                        <img src={ELEPHANT_LOGO_URL} alt="ERAVAT Logo" className="absolute w-[150%] h-[150%] max-w-none object-contain drop-shadow-md" />
                    </div>
                    <h2 className="text-xl font-bold tracking-tight text-foreground z-10 relative">{t('wild_elephant_monitoring')}</h2>
                    <p className="text-muted-foreground mt-2 text-[15px] font-medium z-10 relative">जंगली हाथी निगरानी प्रणाली (2025)</p>
                </div>

                <motion.div
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="mb-8"
                >
                    <div className="space-y-2">
                        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('dashboard.welcomeMsg')}</h1>
                        <p className="text-muted-foreground">{t('dashboard.welcomeSub')}</p>
                    </div>
                </motion.div>

                {syncMessage && (
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="mb-4 z-10"
                    >
                        <div className={cn(
                            "glass-card rounded-2xl p-4 flex items-center gap-3",
                            syncMessage.type === 'success' ? "border border-emerald-500/30 bg-emerald-500/10" : "border border-destructive/30 bg-destructive/10"
                        )}>
                            <div className="font-semibold text-sm">
                                {syncMessage.type === 'success' ? '✓' : '⚠'} {syncMessage.text}
                            </div>
                            <button onClick={() => setSyncMessage(null)} className="ml-auto text-foreground/60 hover:text-foreground">✕</button>
                        </div>
                    </motion.div>
                )}

                {pendingCount ? (
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="mb-8 z-10"
                    >
                        <div className="glass-card rounded-2xl p-4 flex items-center justify-between border border-warning/30 bg-warning/10">
                            <div className="flex items-center gap-4">
                                <div className="p-2.5 bg-warning/20 text-warning rounded-xl">
                                    <CloudOff size={20} />
                                </div>
                                <div>
                                    <p className="font-bold text-foreground">{pendingCount} {t('dashboard.pendingStatus')}</p>
                                    <p className="text-xs text-muted-foreground">{isOnline ? t('ready_to_sync') : t('dashboard.waitingSync')}</p>
                                </div>
                            </div>
                            <button
                                onClick={handleManualSync}
                                disabled={isSyncing}
                                className="bg-background/50 hover:bg-background border border-border p-2.5 rounded-xl transition-all"
                            >
                                <RefreshCw size={18} className={cn("text-foreground", isSyncing && "animate-spin")} />
                            </button>
                        </div>
                    </motion.div>
                ) : null}

                <div className="mb-6 z-10">
                    <QuickSOSButton />
                </div>

                <motion.section
                    initial={{ y: 16, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.05 }}
                    className="mb-6 z-10"
                >
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-lg font-bold text-foreground">Recent Sightings</h2>
                        <button
                            type="button"
                            onClick={() => navigate('/history')}
                            className="text-xs font-semibold text-primary flex items-center gap-1"
                        >
                            View all <ChevronRight size={12} />
                        </button>
                    </div>
                    <div className="glass-card rounded-2xl border border-border/50 overflow-hidden">
                        {recentLoading ? (
                            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground text-sm">
                                <Loader2 size={16} className="animate-spin" /> Loading…
                            </div>
                        ) : recentSightings.length === 0 ? (
                            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                                No sightings in your territory yet. Tap Add Sighting to add one.
                            </div>
                        ) : (
                            <ul className="divide-y divide-border/40">
                                {recentSightings.map((s) => (
                                    <li key={s.id}>
                                        <button
                                            type="button"
                                            onClick={() => navigate('/history')}
                                            className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-muted/30 transition-colors"
                                        >
                                            <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0 mt-0.5">
                                                <MapPin size={16} />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="font-semibold text-sm text-foreground truncate">
                                                    {s.beat_name || 'Unknown beat'} · {typeLabel(s.obs_type)}
                                                </p>
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                    {formatDistanceToNow(new Date(s.device_timestamp), { addSuffix: true })}
                                                    {s.elephant_total > 0 ? ` · ${s.elephant_total} elephants` : ''}
                                                </p>
                                            </div>
                                            <ChevronRight size={14} className="text-muted-foreground shrink-0 mt-1" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </motion.section>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 z-10">
                    <motion.button
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.1 }}
                        onClick={() => navigate('/report')}
                        className="group relative overflow-hidden rounded-3xl p-6 text-left flex flex-col justify-between h-48 border border-primary/20 bg-gradient-to-br from-primary/10 to-emerald-500/5 hover:from-primary/20 hover:to-emerald-500/10 transition-colors shadow-lg shadow-primary/5"
                    >
                        <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform duration-500">
                            <Activity size={100} />
                        </div>
                        <div className="p-3 bg-primary text-primary-foreground rounded-2xl w-max shadow-md shadow-primary/30">
                            <Activity size={24} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-foreground mb-1">{t('dashboard.reportAction')}</h2>
                            <p className="text-sm text-muted-foreground font-medium flex items-center gap-1 group-hover:text-primary transition-colors">
                                {t('dashboard.reportDesc')} <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                            </p>
                        </div>
                    </motion.button>

                    <div className="grid grid-cols-2 gap-4 h-48">
                        <motion.button
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.2 }}
                            onClick={() => navigate('/profile')}
                            className="group glass-card rounded-3xl p-5 text-left flex flex-col justify-between hover:bg-muted/40 transition-colors border border-border/50"
                        >
                            <div className="p-2.5 bg-blue-500/10 text-blue-500 rounded-xl w-max">
                                <User size={20} />
                            </div>
                            <div>
                                <h3 className="font-bold text-foreground">{t('dashboard.profileAction')}</h3>
                                <p className="text-xs text-muted-foreground mt-0.5">{t('dashboard.profileDesc')}</p>
                            </div>
                        </motion.button>

                        <motion.button
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.3 }}
                            onClick={() => navigate('/history')}
                            className="group glass-card rounded-3xl p-5 text-left flex flex-col justify-between hover:bg-muted/40 transition-colors border border-border/50"
                        >
                            <div className="p-2.5 bg-amber-500/10 text-amber-500 rounded-xl w-max">
                                <History size={20} />
                            </div>
                            <div>
                                <h3 className="font-bold text-foreground">{t('dashboard.historyAction')}</h3>
                                <p className="text-xs text-muted-foreground mt-0.5">{t('dashboard.historyDesc')}</p>
                            </div>
                        </motion.button>
                    </div>

                    {canOnboard && (
                        <motion.button
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.35 }}
                            onClick={() => navigate('/volunteers/onboard')}
                            className="md:col-span-2 group glass-card rounded-3xl p-6 flex items-center justify-between hover:bg-muted/40 transition-colors border border-emerald-500/20"
                        >
                            <div className="flex items-center gap-5">
                                <div className="p-4 bg-emerald-500/10 text-emerald-600 rounded-2xl">
                                    <UserPlus size={28} />
                                </div>
                                <div className="text-left">
                                    <h2 className="text-xl font-bold text-foreground">{t('volunteer.onboardTitle')}</h2>
                                    <p className="text-sm text-muted-foreground">{t('volunteer.onboardDesc')}</p>
                                </div>
                            </div>
                            <ChevronRight className="text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                        </motion.button>
                    )}

                    {hasAdminAccess && (
                        <motion.button
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.4 }}
                            onClick={() => navigate('/admin')}
                            className="md:col-span-2 group glass-card rounded-3xl p-6 flex items-center justify-between hover:bg-muted/40 transition-colors border-2 border-primary/20 overflow-hidden relative"
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent pointer-events-none" />
                            <div className="flex items-center gap-5 relative z-10">
                                <div className="p-4 bg-primary text-primary-foreground rounded-2xl shadow-lg shadow-primary/20">
                                    <ShieldCheck size={28} />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-foreground">{t('dashboard.commandCenter')}</h2>
                                    <p className="text-sm text-muted-foreground">{t('dashboard.commandDesc')}</p>
                                </div>
                            </div>
                            <ChevronRight className="text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all relative z-10" />
                        </motion.button>
                    )}
                </div>
            </div>
        </div>
    );
}
