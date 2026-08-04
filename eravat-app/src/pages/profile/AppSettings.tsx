import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Moon, Sun, Smartphone, Map, Languages } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';

export default function AppSettings() {
    const { t, language: globalLanguage, setLanguage: setGlobalLanguage } = useLanguage();
    const { theme, setTheme } = useTheme();
    const navigate = useNavigate();

    // Load from local storage synchronously
    const getInitialState = () => {
        try {
            const saved = localStorage.getItem('eravat_app_settings');
            if (saved) return JSON.parse(saved);
        } catch { /* ignore malformed settings */ }
        return {};
    };

    const initial = getInitialState();

    const [mapStyle, setMapStyle] = useState<'terrain' | 'satellite'>(initial.mapStyle || 'terrain');

    // Persist map prefs (theme via ThemeContext; language via LanguageContext).
    // Auto-sync is always on and uploads as soon as connectivity returns, so it
    // no longer has a user toggle; likewise "Wi-Fi only" was removed to avoid
    // field staff accidentally blocking uploads.
    useEffect(() => {
        const settings = { ...initial, mapStyle };
        delete settings.autoSync;
        delete settings.wifiOnly;
        localStorage.setItem('eravat_app_settings', JSON.stringify(settings));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapStyle]);

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
                <h1 className="text-lg font-bold text-foreground">{t('app_settings')}</h1>
            </div>

            <div className="p-6 max-w-lg mx-auto space-y-8">

                {/* Theme & Appearance */}
                <div className="space-y-3 animate-fade-in">
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider pl-1">{t('appearance')}</h2>
                    <div className="glass-card rounded-2xl overflow-hidden divide-y divide-border/50">
                        <div className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                                    {theme === 'system' ? <Smartphone size={18} /> : theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
                                </div>
                                <span className="font-medium">{t('choose_theme')}</span>
                            </div>
                            <div className="flex bg-muted/50 p-1 rounded-xl">
                                <button
                                    type="button"
                                    data-testid="theme-light"
                                    data-ph-action="settings.theme.light"
                                    data-ph-screen="settings"
                                    onClick={() => setTheme('light')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${theme === 'light' ? 'bg-background shadow text-foreground' : 'text-muted-foreground'}`}
                                >
                                    {t('light')}
                                </button>
                                <button
                                    type="button"
                                    data-testid="theme-dark"
                                    data-ph-action="settings.theme.dark"
                                    data-ph-screen="settings"
                                    onClick={() => setTheme('dark')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${theme === 'dark' ? 'bg-background shadow text-foreground' : 'text-muted-foreground'}`}
                                >
                                    {t('dark')}
                                </button>
                                <button
                                    type="button"
                                    data-testid="theme-system"
                                    data-ph-action="settings.theme.system"
                                    data-ph-screen="settings"
                                    onClick={() => setTheme('system')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${theme === 'system' ? 'bg-background shadow text-foreground' : 'text-muted-foreground'}`}
                                >
                                    {t('system')}
                                </button>
                            </div>
                        </div>

                        <div className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                                    <Languages size={18} />
                                </div>
                                <span className="font-medium">{t('language')}</span>
                            </div>
                            <select
                                data-testid="language-select"
                                data-ph-filter="settings.language"
                                data-ph-screen="settings"
                                value={globalLanguage}
                                onChange={(e) => setGlobalLanguage(e.target.value as 'en' | 'hi' | 'mr')}
                                className="bg-background border border-border rounded-lg px-2 py-1 text-sm outline-none"
                            >
                                <option value="en">{t('english')}</option>
                                <option value="hi">{t('hindi')}</option>
                                <option value="mr">{t('marathi')}</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Map Settings */}
                <div className="space-y-3 animate-fade-in" style={{ animationDelay: '100ms', animationFillMode: 'both' }}>
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider pl-1">{t('map_options')}</h2>
                    <div className="glass-card rounded-2xl overflow-hidden divide-y divide-border/50">
                        <div className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                                    <Map size={18} />
                                </div>
                                <span className="font-medium">{t('map_style')}</span>
                            </div>
                            <select
                                data-ph-filter="settings.map_style"
                                data-ph-screen="settings"
                                value={mapStyle}
                                onChange={(e) => setMapStyle(e.target.value as 'terrain' | 'satellite')}
                                className="bg-background border border-border rounded-lg px-2 py-1 text-sm outline-none"
                            >
                                <option value="terrain">{t('terrain')}</option>
                                <option value="satellite">{t('satellite')}</option>
                            </select>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
