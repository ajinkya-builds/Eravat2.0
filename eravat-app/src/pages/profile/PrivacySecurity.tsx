import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Fingerprint, Activity, ShieldAlert, LogOut, ChevronRight } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

export default function PrivacySecurity() {
    const navigate = useNavigate();
    const { t } = useLanguage();

    // Toggles state
    const [biometricEnabled, setBiometricEnabled] = useState(false);
    const [analyticsEnabled, setAnalyticsEnabled] = useState(true);

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

                {/* Account Security section */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="space-y-3"
                >
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider pl-1">{t('privacy.security')}</h2>
                    <div className="glass-card rounded-2xl overflow-hidden divide-y divide-border/50">

                        {/* Biometric Toggle */}
                        <label className="p-4 flex items-center justify-between cursor-pointer hover:bg-muted/20 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500">
                                    <Fingerprint size={18} />
                                </div>
                                <div>
                                    <div className="font-medium">{t('privacy.biometric')}</div>
                                    <div className="text-xs text-muted-foreground mt-0.5">{t('privacy.biometricDesc')}</div>
                                </div>
                            </div>
                            <div className="relative inline-block w-12 h-6 align-middle select-none">
                                <input type="checkbox" className="toggle-checkbox peer absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer z-10" checked={biometricEnabled} onChange={(e) => setBiometricEnabled(e.target.checked)} />
                                <label className="toggle-label block overflow-hidden h-6 rounded-full cursor-pointer bg-muted peer-checked:bg-primary transition-colors"></label>
                            </div>
                        </label>
                    </div>
                </motion.div>

                {/* Device & Data */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="space-y-3"
                >
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider pl-1">{t('privacy.deviceData')}</h2>
                    <div className="glass-card rounded-2xl overflow-hidden divide-y divide-border/50">
                        <button className="w-full p-4 flex items-center justify-between hover:bg-muted/20 transition-colors text-left">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                                    <Activity size={18} />
                                </div>
                                <span className="font-medium">{t('privacy.activeSessions')}</span>
                            </div>
                            <div className="flex items-center gap-2 text-muted-foreground text-sm">
                                1 Device <ChevronRight size={16} />
                            </div>
                        </button>

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
                                <input type="checkbox" className="toggle-checkbox peer absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer z-10" checked={analyticsEnabled} onChange={(e) => setAnalyticsEnabled(e.target.checked)} />
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
                    <button className="w-full glass-card rounded-2xl p-4 flex items-center gap-3 text-destructive hover:bg-destructive/5 transition-colors border border-destructive/20">
                        <div className="p-2 rounded-lg bg-destructive/10 text-destructive">
                            <LogOut size={18} />
                        </div>
                        <div className="flex-1 text-left">
                            <div className="font-semibold text-sm">{t('privacy.signOutAll')}</div>
                            <div className="text-xs opacity-80 font-medium">{t('privacy.revokeWarning')}</div>
                        </div>
                        <ChevronRight size={16} />
                    </button>
                </motion.div>

            </div>
        </div>
    );
}
