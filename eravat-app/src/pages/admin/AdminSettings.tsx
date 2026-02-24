import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Save, Shield, Smartphone, Bell, Database, Radio } from 'lucide-react';
import { supabase } from '../../supabase';
import {
    RadiusSlider, RadiusPreview, SaveIndicator,
    clamp, MAX_KM, MIN_KM, type SaveState,
} from '../../components/shared/RadiusSlider';
import { useLanguage } from '../../contexts/LanguageContext';

// ─── Toggle ──────────────────────────────────────────────────────────────────

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
    return (
        <button
            onClick={onToggle}
            className={`relative w-12 h-7 rounded-full transition-colors duration-200 ${enabled ? 'bg-primary' : 'bg-muted border border-border'}`}
        >
            <motion.div
                animate={{ x: enabled ? 20 : 2 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                className={`absolute top-[3px] w-5 h-5 rounded-full shadow ${enabled ? 'bg-white' : 'bg-muted-foreground/60'}`}
            />
        </button>
    );
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

type Tab = 'security' | 'data' | 'notifications' | 'versions';

const TABS: { id: Tab; icon: React.ElementType; label: string }[] = [
    { id: 'security', icon: Shield, label: 'as_security' },
    { id: 'data', icon: Database, label: 'as_data_sync' },
    { id: 'notifications', icon: Bell, label: 'as_notifications' },
    { id: 'versions', icon: Smartphone, label: 'as_app_versions' },
];

const DEBOUNCE_MS = 800;

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function AdminSettings() {
    const [activeTab, setActiveTab] = useState<Tab>('security');
    const { t } = useLanguage();

    // ── Proximity state ──────────────────────────────────────────────────────
    const [globalRadius, setGlobalRadius] = useState(10);
    const [proximityEnabled, setProximityEnabled] = useState(true);
    const [radiusSaveState, setRadiusSaveState] = useState<SaveState>('idle');

    // Load current default from any profile (system-wide, we treat the most common value as the default)
    useEffect(() => {
        (async () => {
            const { data } = await supabase
                .from('profiles')
                .select('notification_radius_km')
                .limit(1)
                .single();
            if (data?.notification_radius_km) setGlobalRadius(data.notification_radius_km);
        })();
    }, []);

    const persistRadius = useCallback(async (newRadius: number) => {
        setRadiusSaveState('saving');
        // Update ALL profiles to the new system-wide default
        const { error } = await supabase
            .from('profiles')
            .update({ notification_radius_km: newRadius })
            .gte('id', '00000000-0000-0000-0000-000000000000'); // match all rows

        setRadiusSaveState(error ? 'error' : 'saved');
        setTimeout(() => setRadiusSaveState('idle'), 2500);
    }, []);

    // Debounced save
    useEffect(() => {
        const timer = setTimeout(() => persistRadius(globalRadius), DEBOUNCE_MS);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [globalRadius]);

    const handleRadiusChange = (v: number) => {
        setGlobalRadius(clamp(v));
        setRadiusSaveState('idle');
    };

    const handleRadiusInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const parsed = parseInt(e.target.value, 10);
        if (!isNaN(parsed)) handleRadiusChange(parsed);
    };

    return (
        <div className="space-y-6 max-w-4xl">

            <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('admin_system_settings')}</h1>
                <p className="text-muted-foreground mt-1 text-sm">{t('as_configure_desc')}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mt-8">

                {/* Settings Nav */}
                <div className="space-y-2">
                    {TABS.map((tab) => {
                        const active = activeTab === tab.id;
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`w-full text-left px-4 py-3 rounded-xl font-medium text-sm flex items-center gap-3 transition-colors ${active ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-muted-foreground'}`}
                            >
                                <Icon size={18} /> {t(tab.label)}
                            </button>
                        );
                    })}
                </div>

                {/* Settings Content */}
                <div className="md:col-span-3">
                    <AnimatePresence mode="wait">

                        {/* ── Security Tab ── */}
                        {activeTab === 'security' && (
                            <motion.div
                                key="security"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="glass-card rounded-2xl p-6"
                            >
                                <h3 className="text-lg font-bold mb-4 border-b border-border pb-2">{t('as_session_security')}</h3>
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-medium text-sm">{t('as_force_reauth')}</p>
                                            <p className="text-xs text-muted-foreground">{t('as_force_reauth_desc')}</p>
                                        </div>
                                        <div className="w-12 h-6 bg-primary rounded-full relative cursor-pointer">
                                            <div className="w-4 h-4 rounded-full bg-white absolute top-1 right-1 shadow" />
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between pt-4 border-t border-border">
                                        <div>
                                            <p className="font-medium text-sm">{t('as_two_factor')}</p>
                                            <p className="text-xs text-muted-foreground">{t('as_two_factor_desc')}</p>
                                        </div>
                                        <div className="w-12 h-6 bg-muted rounded-full relative cursor-pointer border border-border">
                                            <div className="w-4 h-4 rounded-full bg-muted-foreground absolute top-[3px] left-1 shadow" />
                                        </div>
                                    </div>
                                </div>
                                <button className="mt-8 bg-foreground text-background px-6 py-2.5 rounded-xl font-medium text-sm flex items-center gap-2 hover:opacity-90 transition-opacity">
                                    <Save size={16} /> {t('save_changes')}
                                </button>
                            </motion.div>
                        )}

                        {/* ── Data Sync Tab ── */}
                        {activeTab === 'data' && (
                            <motion.div
                                key="data"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="glass-card rounded-2xl p-6"
                            >
                                <h3 className="text-lg font-bold mb-4 border-b border-border pb-2">{t('as_data_sync')}</h3>
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-medium text-sm">{t('as_auto_sync')}</p>
                                            <p className="text-xs text-muted-foreground">{t('as_auto_sync_desc')}</p>
                                        </div>
                                        <div className="w-12 h-6 bg-primary rounded-full relative cursor-pointer">
                                            <div className="w-4 h-4 rounded-full bg-white absolute top-1 right-1 shadow" />
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between pt-4 border-t border-border">
                                        <div>
                                            <p className="font-medium text-sm">{t('as_media_quality')}</p>
                                            <p className="text-xs text-muted-foreground">{t('as_media_quality_desc')}</p>
                                        </div>
                                        <span className="text-sm font-medium text-primary bg-primary/10 px-3 py-1 rounded-lg">High</span>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* ── Notifications Tab ── */}
                        {activeTab === 'notifications' && (
                            <motion.div
                                key="notifications"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-6"
                            >
                                {/* Master Toggle */}
                                <div className="glass-card rounded-2xl p-6">
                                    <h3 className="text-lg font-bold mb-4 border-b border-border pb-2">{t('as_global_notification')}</h3>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-medium text-sm">{t('as_enable_proximity')}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {t('as_proximity_desc')}
                                            </p>
                                        </div>
                                        <Toggle enabled={proximityEnabled} onToggle={() => setProximityEnabled(!proximityEnabled)} />
                                    </div>
                                </div>

                                {/* Radius Configuration */}
                                <div className={`glass-card rounded-2xl p-6 space-y-6 transition-opacity ${proximityEnabled ? '' : 'opacity-40 pointer-events-none'}`}>
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                                            <Bell size={20} />
                                        </div>
                                        <div>
                                            <h3 className="text-base font-semibold text-foreground">{t('as_default_radius')}</h3>
                                            <p className="text-xs text-muted-foreground">{t('as_radius_system_wide')}</p>
                                        </div>
                                    </div>

                                    <RadiusPreview km={globalRadius} max={MAX_KM} />

                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <label htmlFor="radius-slider" className="flex items-center gap-2 text-sm font-medium text-foreground">
                                                <Radio size={15} className="text-primary" />
                                                {t('as_alert_radius')}
                                            </label>
                                            <div className="flex items-center gap-2">
                                                <SaveIndicator state={radiusSaveState} />
                                                <div className="flex items-center gap-1 bg-primary/10 rounded-xl px-3 py-1">
                                                    <input
                                                        type="number"
                                                        min={MIN_KM}
                                                        max={MAX_KM}
                                                        value={globalRadius}
                                                        onChange={handleRadiusInput}
                                                        className="w-12 bg-transparent text-center text-sm font-bold text-primary focus:outline-none"
                                                        aria-label="Alert radius value"
                                                    />
                                                    <span className="text-xs font-semibold text-primary/70">km</span>
                                                </div>
                                            </div>
                                        </div>

                                        <RadiusSlider value={globalRadius} onChange={handleRadiusChange} min={MIN_KM} max={MAX_KM} />
                                    </div>

                                    <p className="text-xs text-muted-foreground leading-relaxed bg-muted/50 rounded-2xl px-4 py-3 border border-border/50">
                                        All personnel will receive notifications when a report is filed within{' '}
                                        <span className="font-semibold text-foreground">{globalRadius} km</span> of their
                                        assigned region centroid. Range: {MIN_KM}–{MAX_KM} km.
                                    </p>
                                </div>
                            </motion.div>
                        )}

                        {/* ── App Versions Tab ── */}
                        {activeTab === 'versions' && (
                            <motion.div
                                key="versions"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="glass-card rounded-2xl p-6"
                            >
                                <h3 className="text-lg font-bold mb-4 border-b border-border pb-2">{t('as_app_versions')}</h3>
                                <div className="space-y-4">
                                    {[
                                        { label: 'Web App', version: '2.0.0', status: 'Current' },
                                        { label: 'Android APK', version: '2.0.0', status: 'Current' },
                                        { label: 'Supabase Backend', version: 'v2 (hosted)', status: 'Online' },
                                        { label: 'PostGIS Extension', version: '3.4', status: 'Active' },
                                    ].map((item) => (
                                        <div key={item.label} className="flex items-center justify-between py-3 border-b border-border/50 last:border-0">
                                            <div>
                                                <p className="font-medium text-sm">{item.label}</p>
                                                <p className="text-xs text-muted-foreground">Version {item.version}</p>
                                            </div>
                                            <span className="text-xs font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-lg">
                                                {item.status}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        )}

                    </AnimatePresence>
                </div>

            </div>
        </div>
    );
}
