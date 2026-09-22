import { motion } from 'framer-motion';
import { Shield, Smartphone, Bell, Database, Radio } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { APP_VERSION, formatAppVersionLabel } from '../../lib/appVersion';

// ─── Toggle ──────────────────────────────────────────────────────────────────

function Toggle({ enabled, onToggle, disabled }: { enabled: boolean; onToggle: () => void; disabled?: boolean }) {
    return (
        <button
            onClick={onToggle}
            type="button"
            disabled={disabled}
            className={`relative w-12 h-7 rounded-full transition-colors duration-200 ${enabled ? 'bg-primary' : 'bg-muted border border-border'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
            <motion.div
                animate={{ x: enabled ? 20 : 2 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                className={`absolute top-[3px] w-5 h-5 rounded-full shadow ${enabled ? 'bg-white' : 'bg-muted-foreground/60'}`}
            />
        </button>
    );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function AdminSettings() {
    const { t } = useLanguage();

    return (
        <div className="space-y-6 max-w-4xl">

            <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('admin.settings.title')}</h1>
                <p className="text-muted-foreground mt-1 text-sm">{t('admin.settings.subtitle')}</p>
            </div>

            {/* ── Security ── */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="space-y-6"
            >
                <div className="glass-card rounded-2xl p-6">
                    <h3 className="text-lg font-bold mb-4 border-b border-border pb-2 flex items-center gap-2">
                        <Shield size={18} className="text-primary" />
                        {t('admin.settings.sessionSecurity')}
                    </h3>
                    <div className="flex items-center justify-between opacity-60">
                        <div>
                            <p className="font-medium text-sm">{t('admin.settings.forceReauth')}</p>
                            <p className="text-xs text-muted-foreground">
                                {t('admin.settings.forceReauthDesc')} — coming soon
                            </p>
                        </div>
                        <Toggle enabled={false} onToggle={() => {}} disabled />
                    </div>
                </div>
            </motion.div>

            {/* ── Data Sync ── */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="glass-card rounded-2xl p-6"
            >
                <h3 className="text-lg font-bold mb-4 border-b border-border pb-2 flex items-center gap-2">
                    <Database size={18} className="text-primary" />
                    {t('admin.settings.dataSync')}
                </h3>
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-medium text-sm">{t('as_media_quality')}</p>
                            <p className="text-xs text-muted-foreground">{t('as_media_quality_desc')}</p>
                        </div>
                        <span className="text-sm font-medium text-primary bg-primary/10 px-3 py-1 rounded-lg">High</span>
                    </div>
                </div>
            </motion.div>

            {/* ── Notifications ── */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="space-y-6"
            >
                <div className="glass-card rounded-2xl p-6">
                    <h3 className="text-lg font-bold mb-4 border-b border-border pb-2 flex items-center gap-2">
                        <Bell size={18} className="text-primary" />
                        {t('admin.settings.notifications')}
                    </h3>
                    <div className="flex items-center justify-between opacity-60">
                        <div>
                            <p className="font-medium text-sm">{t('as_enable_proximity')}</p>
                            <p className="text-xs text-muted-foreground">
                                {t('as_proximity_desc')} — {t('as_proximity_always_on')}
                            </p>
                        </div>
                        <Toggle enabled={true} onToggle={() => {}} disabled />
                    </div>
                </div>

                <div className="glass-card rounded-2xl p-6 space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                            <Radio size={20} />
                        </div>
                        <div>
                            <h3 className="text-base font-semibold text-foreground">{t('as_alert_radius_policy')}</h3>
                            <p className="text-xs text-muted-foreground">{t('as_alert_radius_policy_desc')}</p>
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed bg-muted/50 rounded-2xl px-4 py-3 border border-border/50">
                        {t('as_alert_radius_policy_detail')}
                    </p>
                </div>
            </motion.div>

            {/* ── App Versions ── */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="glass-card rounded-2xl p-6"
            >
                <h3 className="text-lg font-bold mb-4 border-b border-border pb-2 flex items-center gap-2">
                    <Smartphone size={18} className="text-primary" />
                    {t('admin.settings.appVersions')}
                </h3>
                <div className="space-y-4">
                    {[
                        { label: 'Web App', version: APP_VERSION.versionName, status: 'Current' },
                        { label: 'Android APK', version: formatAppVersionLabel(APP_VERSION), status: 'Current' },
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
        </div>
    );
}
