import { motion } from 'framer-motion';
import { Save, Shield, Smartphone, Bell, Database } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function AdminSettings() {
    const { t } = useTranslation();
    return (
        <div className="space-y-6 max-w-4xl">

            <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('admin.settings.title')}</h1>
                <p className="text-muted-foreground mt-1 text-sm">{t('admin.settings.subtitle')}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mt-8">

                {/* Settings Nav */}
                <div className="space-y-2">
                    <button className="w-full text-left px-4 py-3 rounded-xl bg-primary/10 text-primary font-medium text-sm flex items-center gap-3">
                        <Shield size={18} /> {t('admin.settings.security')}
                    </button>
                    <button className="w-full text-left px-4 py-3 rounded-xl hover:bg-muted text-muted-foreground font-medium text-sm flex items-center gap-3 transition-colors">
                        <Database size={18} /> {t('admin.settings.dataSync')}
                    </button>
                    <button className="w-full text-left px-4 py-3 rounded-xl hover:bg-muted text-muted-foreground font-medium text-sm flex items-center gap-3 transition-colors">
                        <Bell size={18} /> {t('admin.settings.notifications')}
                    </button>
                    <button className="w-full text-left px-4 py-3 rounded-xl hover:bg-muted text-muted-foreground font-medium text-sm flex items-center gap-3 transition-colors">
                        <Smartphone size={18} /> {t('admin.settings.appVersions')}
                    </button>
                </div>

                {/* Settings Content */}
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="md:col-span-3 space-y-6"
                >
                    <div className="glass-card rounded-2xl p-6">
                        <h3 className="text-lg font-bold mb-4 border-b border-border pb-2">{t('admin.settings.sessionSecurity')}</h3>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-medium text-sm">{t('admin.settings.forceReauth')}</p>
                                    <p className="text-xs text-muted-foreground">{t('admin.settings.forceReauthDesc')}</p>
                                </div>
                                <div className="w-12 h-6 bg-primary rounded-full relative cursor-pointer">
                                    <div className="w-4 h-4 rounded-full bg-white absolute top-1 right-1 shadow" />
                                </div>
                            </div>

                            <div className="flex items-center justify-between pt-4 border-t border-border">
                                <div>
                                    <p className="font-medium text-sm">{t('admin.settings.twoFactor')}</p>
                                    <p className="text-xs text-muted-foreground">{t('admin.settings.twoFactorDesc')}</p>
                                </div>
                                <div className="w-12 h-6 bg-muted rounded-full relative cursor-pointer border border-border">
                                    <div className="w-4 h-4 rounded-full bg-muted-foreground absolute top-[3px] left-1 shadow" />
                                </div>
                            </div>
                        </div>

                        <button className="mt-8 bg-foreground text-background px-6 py-2.5 rounded-xl font-medium text-sm flex items-center gap-2 hover:opacity-90 transition-opacity">
                            <Save size={16} /> {t('admin.settings.saveChanges')}
                        </button>
                    </div>
                </motion.div>

            </div>

        </div>
    );
}
