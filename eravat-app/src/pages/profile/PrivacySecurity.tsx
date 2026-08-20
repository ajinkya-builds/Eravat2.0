import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Activity, ShieldAlert, LogOut } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { getAnalyticsConsent, setAnalyticsConsent } from '../../lib/analyticsConsent';
import { applyAnalyticsConsent } from '../../lib/posthogClient';
import { track } from '../../lib/analytics';

export default function PrivacySecurity() {
    const navigate = useNavigate();
    const { t } = useLanguage();
    const [analyticsEnabled, setAnalyticsEnabled] = useState(true);

    useEffect(() => {
        setAnalyticsEnabled(getAnalyticsConsent());
    }, []);

    const handleAnalyticsToggle = (enabled: boolean) => {
        setAnalyticsEnabled(enabled);
        setAnalyticsConsent(enabled);
        applyAnalyticsConsent(enabled);
        // Record the preference change only when enabling (opt-out stops capture).
        if (enabled) {
            track('privacy.analytics_opt_in');
        }
    };

    return (
        <div className="min-h-screen bg-background pb-[80px]">
            {/* Header */}
            <div className="sticky top-0 z-40 glass-effect border-b border-border/50 px-4 py-4 flex items-center gap-3">
                <button
                    onClick={() => navigate(-1)}
                    className="p-2 rounded-xl hover:bg-muted/50 transition-colors"
                >
                    <ArrowLeft size={20} className="text-foreground" />
                </button>
                <h1 className="text-lg font-bold text-foreground">{t('privacy.title')}</h1>
            </div>

            <div className="p-6 max-w-lg mx-auto space-y-8">

                {/* Device & Data */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="space-y-3"
                >
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider pl-1">{t('privacy.deviceData')}</h2>
                    <div className="glass-card rounded-2xl overflow-hidden divide-y divide-border/50">
                        <div className="w-full p-4 flex items-center justify-between text-left opacity-70 cursor-default">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                                    <Activity size={18} />
                                </div>
                                <span className="font-medium">{t('privacy.activeSessions')}</span>
                            </div>
                            <div className="flex items-center gap-2 text-muted-foreground text-sm">
                                1 Device
                            </div>
                        </div>

                        <label className="p-4 flex items-center justify-between cursor-pointer hover:bg-muted/20 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                                    <ShieldAlert size={18} />
                                </div>
                                <div>
                                    <div className="font-medium">{t('privacy.shareAnalytics')}</div>
                                    <div className="text-xs text-muted-foreground mt-0.5">{t('privacy.analyticsDesc')}</div>
                                </div>
                            </div>
                            <div className="relative inline-block w-12 h-6 align-middle select-none">
                                <input
                                    type="checkbox"
                                    className="toggle-checkbox peer absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer z-10"
                                    checked={analyticsEnabled}
                                    onChange={(e) => handleAnalyticsToggle(e.target.checked)}
                                />
                                <label className="toggle-label block overflow-hidden h-6 rounded-full cursor-pointer bg-muted peer-checked:bg-primary transition-colors"></label>
                            </div>
                        </label>
                    </div>
                </motion.div>

                {/* Danger Zone */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                >
                    <div className="w-full glass-card rounded-2xl p-4 flex items-center gap-3 text-muted-foreground border border-border opacity-70 cursor-default">
                        <div className="p-2 rounded-lg bg-muted text-muted-foreground">
                            <LogOut size={18} />
                        </div>
                        <div className="flex-1 text-left">
                            <div className="font-semibold text-sm">{t('privacy.signOutAll')}</div>
                            <div className="text-xs opacity-80 font-medium">Coming soon — use Profile → Sign out on this device</div>
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
