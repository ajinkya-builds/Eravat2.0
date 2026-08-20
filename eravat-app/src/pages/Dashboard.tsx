import { motion } from 'framer-motion';
import { ShieldCheck, History, Activity, CloudOff, RefreshCw, ChevronRight, UserPlus, Users, Navigation } from 'lucide-react';
import { canOnboardVolunteers, canOnboardVillagers, canReadVillagers } from '../lib/rbac';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { syncData } from '../services/syncService';
import { cn } from '../lib/utils';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { ELEPHANT_LOGO_URL } from '../lib/publicAsset';
import { Network } from '@capacitor/network';
import { trackClick, trackFailed } from '../lib/analytics';
import { supabase } from '../supabase';

export default function Dashboard() {
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const navigate = useNavigate();
    const { profile } = useAuth();
    const { t } = useLanguage();
    const [isOnline, setIsOnline] = useState(true);
    const [myVillagerCount, setMyVillagerCount] = useState<number | null>(null);

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

    const pendingCount = useLiveQuery(
        () => db.reports.where('sync_status').anyOf(['pending', 'failed']).count(),
        []
    );

    const handleManualSync = async () => {
        if (!pendingCount || isSyncing) return;
        trackClick('dashboard.manual_sync', { screen: 'dashboard', pending_count: pendingCount });
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
                    text = t('sync_success', { count: result.count ?? 0, total: total ?? 0 });
                }
                setSyncMessage({ type: 'success', text });
                setTimeout(() => setSyncMessage(null), 3000);
            } else {
                trackFailed('dashboard.manual_sync', 'sync_failed', { screen: 'dashboard' });
                setSyncMessage({
                    type: 'error',
                    text: result.error?.toString() || t('sync_failed_retry')
                });
            }
        } catch {
            trackFailed('dashboard.manual_sync', 'sync_exception', { screen: 'dashboard' });
            setSyncMessage({
                type: 'error',
                text: t('sync_failed_connection')
            });
        } finally {
            setIsSyncing(false);
        }
    };

    const hasAdminAccess = ['admin', 'ccf', 'dfo'].includes(profile?.role || '');
    const canOnboardHathiMitra = canOnboardVolunteers(profile?.role);
    const canOnboardVillager = canOnboardVillagers(profile?.role);
    const canBrowseVillagers = canReadVillagers(profile?.role);

    useEffect(() => {
        if (!canOnboardVillager || !profile?.id) return;
        let cancelled = false;
        void supabase
            .from('villagers')
            .select('id', { count: 'exact', head: true })
            .eq('created_by', profile.id)
            .then(({ count }) => {
                if (!cancelled) setMyVillagerCount(count ?? 0);
            });
        return () => {
            cancelled = true;
        };
    }, [canOnboardVillager, profile?.id]);

    return (
        <div className="relative min-h-screen w-full bg-background overflow-hidden flex flex-col pt-6 px-6 pb-24">
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/10 blur-[100px] pointer-events-none" />
            <div className="absolute bottom-[20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-emerald-500/10 blur-[100px] pointer-events-none" />

            <div className="max-w-2xl mx-auto w-full relative z-10 flex flex-col h-full">
                <div className="flex flex-col items-center mb-8 mt-2 text-center">
                    <div className="w-24 h-24 sm:w-28 sm:h-28 mb-4 relative flex items-center justify-center overflow-visible">
                        <img src={ELEPHANT_LOGO_URL} alt="ERAVAT Logo" className="absolute w-[150%] h-[150%] max-w-none object-contain drop-shadow-md" />
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground z-10 relative">{t('app_name')}</h1>
                </div>

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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 z-10">
                    <motion.button
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.1 }}
                        data-ph-action="dashboard.add_sighting"
                        data-ph-screen="dashboard"
                        onClick={() => navigate('/report')}
                        className="md:col-span-2 group relative overflow-hidden rounded-3xl p-6 text-left flex flex-col justify-between h-44 border border-primary/20 bg-gradient-to-br from-primary/10 to-emerald-500/5 hover:from-primary/20 hover:to-emerald-500/10 transition-colors shadow-lg shadow-primary/5"
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

                    <motion.button
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.15 }}
                        data-ph-action="dashboard.open_nearby"
                        data-ph-screen="dashboard"
                        onClick={() => navigate('/nearby')}
                        className="md:col-span-2 group glass-card rounded-3xl p-6 flex items-center justify-between hover:bg-muted/40 transition-colors border border-blue-500/20 min-h-28"
                    >
                        <div className="flex items-center gap-5">
                            <div className="p-4 bg-blue-500/10 text-blue-600 rounded-2xl">
                                <Navigation size={28} />
                            </div>
                            <div className="text-left">
                                <h2 className="text-xl font-bold text-foreground">{t('dashboard.nearbyAction')}</h2>
                                <p className="text-sm text-muted-foreground">{t('dashboard.nearbyDesc')}</p>
                            </div>
                        </div>
                        <ChevronRight className="text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                    </motion.button>

                    {(canOnboardVillager || canOnboardHathiMitra) && (
                        <div className="md:col-span-2 grid grid-cols-2 gap-4">
                            {canOnboardVillager && (
                                <motion.button
                                    initial={{ y: 20, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    transition={{ delay: 0.2 }}
                                    data-ph-action="dashboard.onboard_villager"
                                    data-ph-screen="dashboard"
                                    onClick={() => navigate('/villagers/onboard')}
                                    className="group glass-card rounded-3xl p-5 text-left flex flex-col justify-between min-h-36 hover:bg-muted/40 transition-colors border border-amber-500/20"
                                >
                                    <div className="p-2.5 bg-amber-500/10 text-amber-700 rounded-xl w-max">
                                        <Users size={20} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-foreground">{t('hathiMitra.onboardTitle')}</h3>
                                        <p className="text-xs text-muted-foreground mt-0.5">{t('hathiMitra.onboardShortDesc')}</p>
                                    </div>
                                </motion.button>
                            )}
                            {canOnboardHathiMitra && (
                                <motion.button
                                    initial={{ y: 20, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    transition={{ delay: 0.25 }}
                                    data-ph-action="dashboard.onboard_hathi_mitra"
                                    data-ph-screen="dashboard"
                                    onClick={() => navigate('/volunteers/onboard')}
                                    className="group glass-card rounded-3xl p-5 text-left flex flex-col justify-between min-h-36 hover:bg-muted/40 transition-colors border border-emerald-500/20"
                                >
                                    <div className="p-2.5 bg-emerald-500/10 text-emerald-600 rounded-xl w-max">
                                        <UserPlus size={20} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-foreground">{t('volunteer.onboardTitle')}</h3>
                                        <p className="text-xs text-muted-foreground mt-0.5">{t('volunteer.onboardShortDesc')}</p>
                                    </div>
                                </motion.button>
                            )}
                        </div>
                    )}

                    {canOnboardVillager && (
                        <motion.button
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.26 }}
                            data-ph-action="dashboard.open_my_villagers"
                            data-ph-screen="dashboard"
                            data-testid="dashboard-my-villagers"
                            onClick={() => navigate('/villagers')}
                            className="md:col-span-2 group glass-card rounded-3xl p-6 flex items-center justify-between hover:bg-muted/40 transition-colors border border-amber-500/20"
                        >
                            <div className="flex items-center gap-5">
                                <div className="p-4 bg-amber-500/10 text-amber-700 rounded-2xl">
                                    <Users size={28} />
                                </div>
                                <div className="text-left">
                                    <h2 className="text-xl font-bold text-foreground">{t('hathiMitra.myListTitle')}</h2>
                                    <p className="text-sm text-muted-foreground">
                                        {myVillagerCount != null
                                            ? t('hathiMitra.myListCount', { count: myVillagerCount })
                                            : t('hathiMitra.myListDesc')}
                                    </p>
                                </div>
                            </div>
                            <ChevronRight className="text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                        </motion.button>
                    )}

                    {!canOnboardVillager && canBrowseVillagers && (
                        <motion.button
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.28 }}
                            data-ph-action="dashboard.open_villagers"
                            data-ph-screen="dashboard"
                            onClick={() => navigate('/villagers')}
                            className="md:col-span-2 group glass-card rounded-3xl p-6 flex items-center justify-between hover:bg-muted/40 transition-colors border border-amber-500/20"
                        >
                            <div className="flex items-center gap-5">
                                <div className="p-4 bg-amber-500/10 text-amber-700 rounded-2xl">
                                    <Users size={28} />
                                </div>
                                <div className="text-left">
                                    <h2 className="text-xl font-bold text-foreground">{t('hathiMitra.listTitle')}</h2>
                                    <p className="text-sm text-muted-foreground">{t('hathiMitra.listDesc')}</p>
                                </div>
                            </div>
                            <ChevronRight className="text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                        </motion.button>
                    )}

                    <motion.button
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.3 }}
                        data-ph-action="dashboard.open_history"
                        data-ph-screen="dashboard"
                        onClick={() => navigate('/history')}
                        className="md:col-span-2 group glass-card rounded-3xl p-5 flex items-center justify-between hover:bg-muted/40 transition-colors border border-border/50"
                    >
                        <div className="flex items-center gap-4">
                            <div className="p-2.5 bg-amber-500/10 text-amber-500 rounded-xl">
                                <History size={20} />
                            </div>
                            <div className="text-left">
                                <h3 className="font-bold text-foreground">{t('dashboard.historyAction')}</h3>
                                <p className="text-xs text-muted-foreground mt-0.5">{t('dashboard.historyDesc')}</p>
                            </div>
                        </div>
                        <ChevronRight className="text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                    </motion.button>

                    {hasAdminAccess && (
                        <motion.button
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.4 }}
                            data-ph-action="dashboard.open_admin"
                            data-ph-screen="dashboard"
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
