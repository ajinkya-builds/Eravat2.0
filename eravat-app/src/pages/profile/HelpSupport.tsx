import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, BookOpen, RefreshCw, FileText, ExternalLink, AlertCircle } from 'lucide-react';
import { syncData } from '../../services/syncService';
import { useState } from 'react';

export default function HelpSupport() {
    const navigate = useNavigate();
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastSyncTime, setLastSyncTime] = useState<string | null>(localStorage.getItem('last_sync_time'));

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
            <div className="sticky top-0 z-40 glass-effect border-b border-border/50 px-4 py-4 flex items-center gap-3">
                <button
                    onClick={() => navigate(-1)}
                    className="p-2 rounded-xl hover:bg-muted/50 transition-colors"
                >
                    <ArrowLeft size={20} className="text-foreground" />
                </button>
                <h1 className="text-lg font-bold text-foreground">Help & Support</h1>
            </div>

            <div className="p-6 max-w-lg mx-auto space-y-8">

                {/* Contact Support Section */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="space-y-3"
                >
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider pl-1">Contact Administrator</h2>
                    <div className="glass-card rounded-2xl overflow-hidden divide-y divide-border/50">
                        <a href="tel:+18005550199" className="p-4 flex items-center justify-between hover:bg-muted/20 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                                    <Phone size={18} />
                                </div>
                                <div>
                                    <div className="font-medium">Call Support IT</div>
                                    <div className="text-xs text-muted-foreground mt-0.5">+1 (800) 555-0199 (8AM - 8PM)</div>
                                </div>
                            </div>
                            <ExternalLink size={16} className="text-muted-foreground" />
                        </a>

                        <a href="mailto:support@forestdept.gov" className="p-4 flex items-center justify-between hover:bg-muted/20 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                                    <Mail size={18} />
                                </div>
                                <div>
                                    <div className="font-medium">Email Support</div>
                                    <div className="text-xs text-muted-foreground mt-0.5">Response within 24 hours</div>
                                </div>
                            </div>
                            <ExternalLink size={16} className="text-muted-foreground" />
                        </a>
                    </div>
                </motion.div>

                {/* App Resources Section */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="space-y-3"
                >
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider pl-1">Resources</h2>
                    <div className="glass-card rounded-2xl overflow-hidden divide-y divide-border/50">
                        <a
                            href="https://github.com/ajinkya-builds/Eravat2.0"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full p-4 flex items-center justify-between hover:bg-muted/20 transition-colors text-left"
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500">
                                    <BookOpen size={18} />
                                </div>
                                <div>
                                    <span className="font-medium">User Manual</span>
                                    <div className="text-xs text-muted-foreground mt-0.5">View on GitHub</div>
                                </div>
                            </div>
                            <ExternalLink size={16} className="text-muted-foreground" />
                        </a>

                        <button onClick={() => navigate('/faq')} className="w-full p-4 flex items-center justify-between hover:bg-muted/20 transition-colors text-left">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                                    <FileText size={18} />
                                </div>
                                <span className="font-medium">Frequently Asked Questions</span>
                            </div>
                            <ExternalLink size={16} className="text-muted-foreground" />
                        </button>

                        <button onClick={() => navigate('/privacy-policy')} className="w-full p-4 flex items-center justify-between hover:bg-muted/20 transition-colors text-left">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                                    <AlertCircle size={18} />
                                </div>
                                <span className="font-medium">Privacy Policy</span>
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
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider pl-1">Diagnostics</h2>
                    <div className="glass-card rounded-2xl overflow-hidden divide-y divide-border/50">
                        <div className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                                    <AlertCircle size={18} />
                                </div>
                                <div>
                                    <div className="font-medium">App Version</div>
                                    <div className="text-xs text-muted-foreground mt-0.5">Eravat 2.0 (Build 2025.2.1)</div>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500">
                                    <RefreshCw size={18} className={isSyncing ? 'animate-spin' : ''} />
                                </div>
                                <div>
                                    <div className="font-medium">Force Manual Sync</div>
                                    <div className="text-xs text-muted-foreground mt-0.5">
                                        Last sync: {lastSyncTime || 'Never'}
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={handleForceSync}
                                disabled={isSyncing}
                                className="px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                            >
                                {isSyncing ? 'Syncing...' : 'Sync Now'}
                            </button>
                        </div>
                    </div>
                </motion.div>

            </div>
        </div>
    );
}
