import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, BookOpen, RefreshCw, ExternalLink, AlertCircle, MessageCircleWarning } from 'lucide-react';
import { syncData } from '../../services/syncService';
import { useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { openReportIssueDialog } from '../../lib/supportIssues';
import { PAGE_STICKY_HEADER } from '../../lib/layout';

export default function HelpSupport() {
    const navigate = useNavigate();
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastSyncTime, setLastSyncTime] = useState<string | null>(localStorage.getItem('last_sync_time'));
    const { t } = useLanguage();

    const handleForceSync = async () => {
        setIsSyncing(true);
        try {
            await syncData();
            const now = new Date().toLocaleTimeString();
            localStorage.setItem('last_sync_time', now);
            setLastSyncTime(now);
        } catch (error) {
            console.error('Failed to force sync:', error);
        } finally {
            setTimeout(() => setIsSyncing(false), 1000); // UI feedback delay
        }
    };

    return (
        <div className="min-h-screen bg-background pb-[80px]">
            {/* Header */}
            <div className={PAGE_STICKY_HEADER}>
                <button
                    onClick={() => navigate(-1)}
                    className="p-2 rounded-xl hover:bg-muted/50 transition-colors"
                >
                    <ArrowLeft size={20} className="text-foreground" />
                </button>
                <h1 className="text-lg font-bold text-foreground">{t('help.title')}</h1>
            </div>

            <div className="p-6 max-w-lg mx-auto space-y-8">

                {/* Contact Support Section */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="space-y-3"
                >
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider pl-1">{t('help.contactAdmin')}</h2>
                    <div className="glass-card rounded-2xl overflow-hidden divide-y divide-border/50">
                        <button
                            type="button"
                            onClick={openReportIssueDialog}
                            className="w-full p-4 flex items-center justify-between text-left hover:bg-muted/40 transition-colors"
                            data-testid="help-report-issue"
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                                    <MessageCircleWarning size={18} />
                                </div>
                                <div>
                                    <div className="font-medium">{t('support.reportIssue')}</div>
                                    <div className="text-xs text-muted-foreground mt-0.5">{t('support.hint')}</div>
                                </div>
                            </div>
                        </button>

                        <div className="p-4 flex items-center justify-between text-left opacity-70">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                                    <Phone size={18} />
                                </div>
                                <div>
                                    <div className="font-medium">{t('help.callIT')}</div>
                                    <div className="text-xs text-muted-foreground mt-0.5">Contact your division office · phone TBD for UAT</div>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 flex items-center justify-between text-left opacity-70">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                                    <Mail size={18} />
                                </div>
                                <div>
                                    <div className="font-medium">{t('help.emailSupport')}</div>
                                    <div className="text-xs text-muted-foreground mt-0.5">Email TBD for UAT</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* App Resources Section */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="space-y-3"
                >
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider pl-1">{t('help.resources')}</h2>
                    <div className="glass-card rounded-2xl overflow-hidden divide-y divide-border/50">
                        <button
                            type="button"
                            onClick={() => navigate('/faq')}
                            className="w-full p-4 flex items-center justify-between hover:bg-muted/20 transition-colors text-left"
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500">
                                    <BookOpen size={18} />
                                </div>
                                <div>
                                    <span className="font-medium">{t('help.userManual')}</span>
                                    <div className="text-xs text-muted-foreground mt-0.5">{t('help.faq')}</div>
                                </div>
                            </div>
                            <ExternalLink size={16} className="text-muted-foreground" />
                        </button>

                        <button onClick={() => navigate('/privacy-policy')} className="w-full p-4 flex items-center justify-between hover:bg-muted/20 transition-colors text-left">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                                    <AlertCircle size={18} />
                                </div>
                                <span className="font-medium">{t('help.privacyPolicy')}</span>
                            </div>
                            <ExternalLink size={16} className="text-muted-foreground" />
                        </button>
                    </div>
                </motion.div>

                {/* Diagnostics Section */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="space-y-3"
                >
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider pl-1">{t('help.diagnostics')}</h2>
                    <div className="glass-card rounded-2xl overflow-hidden divide-y divide-border/50">
                        <div className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                                    <AlertCircle size={18} />
                                </div>
                                <div>
                                    <div className="font-medium">{t('help.appVersion')}</div>
                                    <div className="text-xs text-muted-foreground mt-0.5">Eravat 2.0.0 (Android versionCode 2)</div>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500">
                                    <RefreshCw size={18} className={isSyncing ? 'animate-spin' : ''} />
                                </div>
                                <div>
                                    <div className="font-medium">{t('help.forceSync')}</div>
                                    <div className="text-xs text-muted-foreground mt-0.5">
                                        {t('help.lastSync')}: {lastSyncTime || t('help.never')}
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={handleForceSync}
                                disabled={isSyncing}
                                className="px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                            >
                                {isSyncing ? t('help.syncing') : t('help.syncNow')}
                            </button>
                        </div>
                    </div>
                </motion.div>

            </div>
        </div>
    );
}
