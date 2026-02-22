import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Moon, Sun, Smartphone, Wifi, Globe, Map, Languages } from 'lucide-react';
import i18n from '../../i18n';

export default function AppSettings() {
    const navigate = useNavigate();

    // Local state for settings. In a real app these sync to localStorage or a central settings context.
    const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('system');
    const [autoSync, setAutoSync] = useState(true);
    const [wifiOnly, setWifiOnly] = useState(false);
    const [mapStyle, setMapStyle] = useState<'terrain' | 'satellite'>('terrain');
    const [language, setLanguage] = useState<'english' | 'hindi'>('english');

    // Load from local storage
    useEffect(() => {
        try {
            const saved = localStorage.getItem('eravat_app_settings');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.theme) setTheme(parsed.theme);
                if (parsed.autoSync !== undefined) setAutoSync(parsed.autoSync);
                if (parsed.wifiOnly !== undefined) setWifiOnly(parsed.wifiOnly);
                if (parsed.mapStyle) setMapStyle(parsed.mapStyle);
                if (parsed.language) setLanguage(parsed.language);
            }
        } catch (e) { }
    }, []);

    // Save on change
    useEffect(() => {
        const settings = { theme, autoSync, wifiOnly, mapStyle, language };
        localStorage.setItem('eravat_app_settings', JSON.stringify(settings));

        // Apply theme immediately to HTML root
        const root = document.documentElement;
        if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }

        // Apply language immediately across the app
        const langCode = language === 'hindi' ? 'hi' : 'en';
        document.documentElement.lang = langCode;
        i18n.changeLanguage(langCode);

    }, [theme, autoSync, wifiOnly, mapStyle, language]);

    // Simple translation dictionary for the settings page
    const isHindi = language === 'hindi';
    const t = {
        title: isHindi ? 'ऐप सेटिंग्स' : 'App Settings',
        appearance: isHindi ? 'दिखावट' : 'Appearance',
        theme: isHindi ? 'थीम' : 'Theme',
        themeDesc: isHindi ? 'ऐप्लिकेशन का रंग चुनें' : 'Choose application colors',
        light: isHindi ? 'हल्का' : 'Light',
        dark: isHindi ? 'गहरा' : 'Dark',
        system: isHindi ? 'सिस्टम' : 'System',
        lang: isHindi ? 'भाषा' : 'Language',
        langDesc: isHindi ? 'अपनी पसंदीदा भाषा चुनें' : 'Choose your preferred language',
        english: 'English',
        hindi: 'हिन्दी',
        sync: isHindi ? 'ऑफ़लाइन सिंक' : 'Offline Sync',
        autoSync: isHindi ? 'ऑनलाइन होने पर ऑटो-सिंक' : 'Auto-Sync When Online',
        autoSyncDesc: isHindi ? 'लंबित रिपोर्ट स्वचालित रूप से अपलोड करें' : 'Upload pending reports automatically',
        wifi: isHindi ? 'केवल वाई-फाई पर सिंक करें' : 'Sync over Wi-Fi Only',
        wifiDesc: isHindi ? 'फ़ील्ड में मोबाइल डेटा बचाएं' : 'Save mobile data in the field',
        mapOptions: isHindi ? 'मानचित्र विकल्प' : 'Map Options',
        mapStyle: isHindi ? 'डिफ़ॉल्ट मानचित्र शैली' : 'Default Map Style',
        mapStyleDesc: isHindi ? 'ऑफलाइन क्षेत्र बेस मैप' : 'Offline territory base map',
        terrain: isHindi ? 'भू-भाग' : 'Terrain',
        satellite: isHindi ? 'उपग्रह' : 'Satellite',
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
                <h1 className="text-lg font-bold text-foreground">App Settings</h1>
            </div>

            <div className="p-6 max-w-lg mx-auto space-y-8">

                {/* Theme & Appearance */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="space-y-3"
                >
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider pl-1">{t.appearance}</h2>
                    <div className="glass-card rounded-2xl overflow-hidden divide-y divide-border/50">
                        <div className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                                    {theme === 'system' ? <Smartphone size={18} /> : theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
                                </div>
                                <span className="font-medium">{t.theme}</span>
                            </div>
                            <div className="flex bg-muted/50 p-1 rounded-xl">
                                <button
                                    onClick={() => setTheme('light')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${theme === 'light' ? 'bg-background shadow text-foreground' : 'text-muted-foreground'}`}
                                >
                                    {t.light}
                                </button>
                                <button
                                    onClick={() => setTheme('dark')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${theme === 'dark' ? 'bg-background shadow text-foreground' : 'text-muted-foreground'}`}
                                >
                                    {t.dark}
                                </button>
                                <button
                                    onClick={() => setTheme('system')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${theme === 'system' ? 'bg-background shadow text-foreground' : 'text-muted-foreground'}`}
                                >
                                    {t.system}
                                </button>
                            </div>
                        </div>

                        <div className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                                    <Languages size={18} />
                                </div>
                                <span className="font-medium">{t.lang}</span>
                            </div>
                            <select
                                value={language}
                                onChange={(e) => setLanguage(e.target.value as any)}
                                className="bg-background border border-border rounded-lg px-2 py-1 text-sm outline-none"
                            >
                                <option value="english">{t.english}</option>
                                <option value="hindi">{t.hindi}</option>
                            </select>
                        </div>
                    </div>
                </motion.div>

                {/* Offline Sync Behavior */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="space-y-3"
                >
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider pl-1">{t.sync}</h2>
                    <div className="glass-card rounded-2xl overflow-hidden divide-y divide-border/50">
                        <label className="p-4 flex items-center justify-between cursor-pointer hover:bg-muted/20 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                                    <Globe size={18} />
                                </div>
                                <div>
                                    <div className="font-medium">{t.autoSync}</div>
                                    <div className="text-xs text-muted-foreground mt-0.5">{t.autoSyncDesc}</div>
                                </div>
                            </div>
                            <div className="relative inline-block w-12 h-6 align-middle select-none">
                                <input type="checkbox" className="toggle-checkbox peer absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer z-10" checked={autoSync} onChange={(e) => setAutoSync(e.target.checked)} />
                                <label className="toggle-label block overflow-hidden h-6 rounded-full cursor-pointer bg-muted peer-checked:bg-primary transition-colors"></label>
                            </div>
                        </label>

                        <label className={`p-4 flex items-center justify-between transition-colors ${!autoSync ? 'opacity-50 pointer-events-none' : 'cursor-pointer hover:bg-muted/20'}`}>
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500">
                                    <Wifi size={18} />
                                </div>
                                <div>
                                    <div className="font-medium">{t.wifi}</div>
                                    <div className="text-xs text-muted-foreground mt-0.5">{t.wifiDesc}</div>
                                </div>
                            </div>
                            <div className="relative inline-block w-12 h-6 align-middle select-none">
                                <input type="checkbox" className="toggle-checkbox peer absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer z-10" checked={wifiOnly} onChange={(e) => setWifiOnly(e.target.checked)} />
                                <label className="toggle-label block overflow-hidden h-6 rounded-full cursor-pointer bg-muted peer-checked:bg-primary transition-colors"></label>
                            </div>
                        </label>
                    </div>
                </motion.div>

                {/* Map Settings */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="space-y-3"
                >
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider pl-1">{t.mapOptions}</h2>
                    <div className="glass-card rounded-2xl overflow-hidden divide-y divide-border/50">
                        <div className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                                    <Map size={18} />
                                </div>
                                <span className="font-medium">{t.mapStyle}</span>
                            </div>
                            <select
                                value={mapStyle}
                                onChange={(e) => setMapStyle(e.target.value as any)}
                                className="bg-background border border-border rounded-lg px-2 py-1 text-sm outline-none"
                            >
                                <option value="terrain">{t.terrain}</option>
                                <option value="satellite">{t.satellite}</option>
                            </select>
                        </div>
                    </div>
                </motion.div>

            </div>
        </div>
    );
}
