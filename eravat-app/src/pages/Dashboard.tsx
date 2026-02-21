import { motion } from 'framer-motion';
import { MapPin, Users, Activity, Bell, CloudOff, RefreshCw } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { syncData } from '../services/syncService';
import { cn } from '../lib/utils';
import { useState } from 'react';

export default function Dashboard() {
    const [isSyncing, setIsSyncing] = useState(false);

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
    return (
        <div className="relative h-screen w-full bg-muted/30 overflow-hidden flex flex-col pt-10 px-4">

            {/* Top Glass Header Area */}
            <motion.div
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="flex justify-between items-center mb-6 z-10"
            >
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">Overview</h1>
                    <p className="text-sm text-muted-foreground">Ooty Beat Map 01</p>
                </div>
                <button className="relative p-2 rounded-full glass-card hover:bg-white/50 transition-colors">
                    <Bell className="w-5 h-5 text-foreground" />
                    <span className="absolute top-2 right-2 w-2 h-2 bg-destructive rounded-full" />
                </button>
            </motion.div>

            {/* Floating Status Cards Carousel */}
            <div className="z-10 mb-6 -mx-4 px-4 overflow-x-auto no-scrollbar">
                <div className="flex gap-4 w-max pb-4">
                    <StatusCard
                        delay={0.2}
                        icon={MapPin}
                        title="Active Patrols"
                        value="12"
                        trend="+2 since yesterday"
                        trendUp
                    />

                    {/* Offline Sync Status Indicator */}
                    <div className="shrink-0">
                        <motion.div
                            initial={{ x: 20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            transition={{ delay: 0.25, type: "spring", stiffness: 200, damping: 20 }}
                            className={cn(
                                "glass-card rounded-2xl p-4 w-44 flex flex-col gap-3 transition-colors",
                                pendingCount && pendingCount > 0 ? "border border-warning/50 bg-warning/5" : ""
                            )}
                        >
                            <div className="flex justify-between items-start">
                                <div className={cn(
                                    "p-2 rounded-xl",
                                    pendingCount && pendingCount > 0 ? "bg-warning/20 text-warning" : "bg-emerald-500/10 text-emerald-500"
                                )}>
                                    <CloudOff className="w-5 h-5" />
                                </div>
                                {pendingCount && pendingCount > 0 ? (
                                    <button
                                        onClick={handleManualSync}
                                        disabled={isSyncing}
                                        className="p-1.5 bg-background rounded-lg hover:bg-muted transition-colors disabled:opacity-50 text-foreground"
                                    >
                                        <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />
                                    </button>
                                ) : null}
                            </div>
                            <div>
                                <p className="text-3xl font-bold text-foreground mb-1">{pendingCount || 0}</p>
                                <p className="text-xs font-medium text-muted-foreground mb-1 break-words">Pending Sync</p>
                                <p className={cn("text-[10px]", pendingCount && pendingCount > 0 ? "text-warning" : "text-emerald-500")}>
                                    {pendingCount && pendingCount > 0 ? "Tap to push data" : "All data verified"}
                                </p>
                            </div>
                        </motion.div>
                    </div>

                    <StatusCard
                        delay={0.3}
                        icon={Activity}
                        title="Recent Sightings"
                        value="4"
                        trend="Elephant herds"
                    />
                    <StatusCard
                        delay={0.4}
                        icon={Users}
                        title="Team Members"
                        value="8"
                        trend="On duty"
                    />
                </div>
            </div>

            {/* Main Map Container Placeholder */}
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.5, ease: "easeOut" }}
                className="flex-1 w-full bg-slate-200 dark:bg-slate-800 rounded-3xl overflow-hidden relative premium-shadow border border-white/20 mb-20"
            >
                {/* We will embed react-leaflet here soon */}
                <div className="absolute inset-0 flex items-center justify-center flex-col gap-3 text-muted-foreground/60">
                    <MapPin size={48} />
                    <p className="font-medium">Map View Loading...</p>
                </div>

                {/* Floating Map Controls */}
                <div className="absolute right-4 top-4 flex flex-col gap-2">
                    <div className="glass-card rounded-xl p-2 flex flex-col gap-2">
                        <div className="w-8 h-8 rounded bg-white/50 flex items-center justify-center font-bold text-lg cursor-pointer hover:bg-white transition-colors">+</div>
                        <div className="w-8 h-[1px] bg-border mx-auto" />
                        <div className="w-8 h-8 rounded bg-white/50 flex items-center justify-center font-bold text-lg cursor-pointer hover:bg-white transition-colors">-</div>
                    </div>
                </div>
            </motion.div>

        </div>
    );
}

function StatusCard({ icon: Icon, title, value, trend, trendUp, delay }: { icon: React.ElementType, title: string, value: string, trend: string, trendUp?: boolean, delay: number }) {
    return (
        <motion.div
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay, type: "spring", stiffness: 200, damping: 20 }}
            className="glass-card rounded-2xl p-4 w-44 flex flex-col gap-3 shrink-0"
        >
            <div className="flex justify-between items-start">
                <div className="p-2 rounded-xl bg-primary/10 text-primary">
                    <Icon className="w-5 h-5" />
                </div>
            </div>
            <div>
                <p className="text-3xl font-bold text-foreground mb-1">{value}</p>
                <p className="text-xs font-medium text-muted-foreground mb-1 break-words">{title}</p>
                <p className={cn("text-[10px]", trendUp ? "text-emerald-500" : "text-muted-foreground")}>{trend}</p>
            </div>
        </motion.div>
    );
}
