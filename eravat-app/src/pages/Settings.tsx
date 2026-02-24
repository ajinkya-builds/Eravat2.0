import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Palette, Globe, HardDrive, Bell, Sun, Moon, Monitor,
    ChevronDown, Trash2,
} from 'lucide-react';
import { useTheme, type Theme } from '../contexts/ThemeContext';
import { useLanguage, LANGUAGES } from '../contexts/LanguageContext';

// ─── Toggle Switch ───────────────────────────────────────────────────────────

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

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function Settings() {
    const navigate = useNavigate();
    const { theme, setTheme } = useTheme();
    const { language, setLanguage, t } = useLanguage();

    const [pushEnabled, setPushEnabled] = useState(false);
    const [langOpen, setLangOpen] = useState(false);
    const [clearing, setClearing] = useState(false);
    const [cleared, setCleared] = useState(false);

    const handleClearCache = async () => {
        setClearing(true);
        try {
            if ('caches' in window) {
                const keys = await caches.keys();
                await Promise.all(keys.filter(k => k.includes('map')).map(k => caches.delete(k)));
            }
        } catch { /* no-op */ }
        setTimeout(() => {
            setClearing(false);
            setCleared(true);
            setTimeout(() => setCleared(false), 2500);
        }, 800);
    };

    const themeOptions: { value: Theme; icon: React.ElementType; label: string }[] = [
        { value: 'light', icon: Sun, label: t('light') },
        { value: 'dark', icon: Moon, label: t('dark') },
        { value: 'system', icon: Monitor, label: t('system') },
    ];

    const selectedLang = LANGUAGES.find(l => l.value === language)!;

    return (
        <div className="min-h-screen p-6 space-y-6 max-w-lg mx-auto">

            {/* Header */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3">
                <button onClick={() => navigate(-1)}
                    className="w-10 h-10 rounded-2xl bg-muted/50 flex items-center justify-center text-foreground hover:bg-muted transition-colors">
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-foreground">{t('settings')}</h1>
                    <p className="text-sm text-muted-foreground">{t('app_preferences')}</p>
                </div>
            </motion.div>

            {/* Theme Card */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}
                className="glass-card rounded-3xl p-6 space-y-5">

                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                        <Palette size={20} />
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-foreground">{t('appearance')}</h2>
                        <p className="text-xs text-muted-foreground">{t('choose_theme')}</p>
                    </div>
                </div>

                {/* Segmented Control */}
                <div className="flex bg-muted/50 rounded-2xl p-1 border border-border/50">
                    {themeOptions.map((opt) => {
                        const active = theme === opt.value;
                        const Icon = opt.icon;
                        return (
                            <button
                                key={opt.value}
                                onClick={() => setTheme(opt.value)}
                                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all ${active ? 'bg-card shadow-sm text-foreground border border-border/50' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                <Icon size={15} />
                                {opt.label}
                            </button>
                        );
                    })}
                </div>
            </motion.div>

            {/* Language Card — z-20 so dropdown renders above subsequent cards */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
                className="glass-card rounded-3xl p-6 space-y-5 relative z-20">

                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                        <Globe size={20} />
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-foreground">{t('language')}</h2>
                        <p className="text-xs text-muted-foreground">{t('select_language')}</p>
                    </div>
                </div>

                {/* Dropdown */}
                <div className="relative">
                    <button
                        onClick={() => setLangOpen(!langOpen)}
                        className="w-full flex items-center justify-between bg-muted/50 border border-border/50 rounded-2xl px-4 py-3 text-sm font-medium text-foreground hover:border-primary/30 transition-colors"
                    >
                        <span>{selectedLang.label} ({selectedLang.native})</span>
                        <motion.div animate={{ rotate: langOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                            <ChevronDown size={16} className="text-muted-foreground" />
                        </motion.div>
                    </button>

                    {langOpen && (
                        <motion.div
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-2xl shadow-lg overflow-hidden z-50"
                        >
                            {LANGUAGES.map((lang) => (
                                <button
                                    key={lang.value}
                                    onClick={() => { setLanguage(lang.value); setLangOpen(false); }}
                                    className={`w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-muted/50 transition-colors ${language === lang.value ? 'text-primary font-semibold' : 'text-foreground'}`}
                                >
                                    <span>{lang.label}</span>
                                    <span className="text-muted-foreground text-xs">{lang.native}</span>
                                </button>
                            ))}
                        </motion.div>
                    )}
                </div>
            </motion.div>

            {/* Push Notifications Card */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}
                className="glass-card rounded-3xl p-6 relative z-10">

                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                            <Bell size={20} />
                        </div>
                        <div>
                            <h2 className="text-base font-semibold text-foreground">{t('push_notifications')}</h2>
                            <p className="text-xs text-muted-foreground">{t('receive_alerts')}</p>
                        </div>
                    </div>
                    <Toggle enabled={pushEnabled} onToggle={() => setPushEnabled(!pushEnabled)} />
                </div>

                {pushEnabled && (
                    <motion.p
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="text-xs text-muted-foreground leading-relaxed bg-muted/50 rounded-2xl px-4 py-3 border border-border/50 mt-4"
                    >
                        {t('push_desc')}
                    </motion.p>
                )}
            </motion.div>

            {/* Offline Storage Card */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }}
                className="glass-card rounded-3xl p-6 space-y-5">

                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                        <HardDrive size={20} />
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-foreground">{t('offline_storage')}</h2>
                        <p className="text-xs text-muted-foreground">{t('manage_cached')}</p>
                    </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-muted/30 rounded-2xl border border-border/30">
                    <div>
                        <p className="text-sm font-medium text-foreground">{t('clear_cache')}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{t('clear_cache_desc')}</p>
                    </div>
                    <button
                        onClick={handleClearCache}
                        disabled={clearing}
                        className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${cleared ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive hover:bg-destructive/20'}`}
                    >
                        {clearing ? (
                            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}>
                                <Trash2 size={14} />
                            </motion.div>
                        ) : cleared ? (
                            t('cleared')
                        ) : (
                            <><Trash2 size={14} /> {t('clear')}</>
                        )}
                    </button>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed bg-muted/50 rounded-2xl px-4 py-3 border border-border/50">
                    {t('offline_note')}
                </p>
            </motion.div>
        </div>
    );
}
