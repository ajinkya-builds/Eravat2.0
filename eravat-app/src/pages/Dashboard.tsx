import { motion } from 'framer-motion';
import { ShieldCheck, History, User, Activity, CloudOff, RefreshCw, ChevronRight } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { syncData } from '../services/syncService';
import { cn } from '../lib/utils';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import elephantLogo from '../../public/elephant-logo.png';

export default function Dashboard() {
    const [isSyncing, setIsSyncing] = useState(false);
    const navigate = useNavigate();
    const { profile } = useAuth();
    const { t } = useTranslation();

    const pendingCount = useLiveQuery(
        () => db.reports.where('sync_status').equals('pending').count(),
        []
    );

    const handleManualSync = async () => {
        if (!pendingCount || isSyncing) return;
        setIsSyncing(true);
        try {
            await syncData();
        } finally {
            setIsSyncing(false);
        }
    };

    const hasAdminAccess = ['admin', 'ccf', 'dfo'].includes(profile?.role || '');

    return (
        <div className="relative min-h-screen w-full bg-background overflow-hidden flex flex-col pt-6 px-6 pb-24">
            {/* Dynamic Background Elements */}
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/10 blur-[100px] pointer-events-none" />
            <div className="absolute bottom-[20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-emerald-500/10 blur-[100px] pointer-events-none" />

            <div className="max-w-2xl mx-auto w-full relative z-10 flex flex-col h-full">
                <div className="flex flex-col items-center mb-8 mt-2 text-center">
                    <div className="w-24 h-24 sm:w-28 sm:h-28 mb-4 relative flex items-center justify-center overflow-visible">
                        <img src={elephantLogo} alt="ERAVAT Logo" className="absolute w-[150%] h-[150%] max-w-none object-contain drop-shadow-md" />
                    </div>
                    <h2 className="text-xl font-bold tracking-tight text-foreground z-10 relative">Wild Elephant Monitoring System</h2>
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

                {/* Offline Sync Status Indicator (Only shows if there are pending items) */}
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
                                    <p className="text-xs text-muted-foreground">{t('dashboard.waitingSync')}</p>
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
                    {/* Primary Action Button */}
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

                    {/* Secondary Action Buttons */}
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
