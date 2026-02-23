import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Moon, Sun, Smartphone, Wifi, Globe, Map, Languages, Bell, Radio, MapPin, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import i18n from '../../i18n';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../supabase';

// ── Proximity radius helpers ──────────────────────────────────────────────────
const MIN_KM = 1, MAX_KM = 100, DEBOUNCE_MS = 800;
type SaveState = 'idle' | 'saving' | 'saved' | 'error';
function clamp(v: number) { return Math.min(MAX_KM, Math.max(MIN_KM, v)); }

function RadiusSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
    const pct = ((value - MIN_KM) / (MAX_KM - MIN_KM)) * 100;
    return (
        <div className="space-y-3">
            <div className="relative h-2 rounded-full bg-muted overflow-visible">
                <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary to-emerald-400 transition-all duration-150" style={{ width: `${pct}%` }} />
                <input id="radius-slider" type="range" min={MIN_KM} max={MAX_KM} step={1} value={value}
                    onChange={e => onChange(Number(e.target.value))}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" aria-label="Alert radius in kilometres" />
                <div className="absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white border-2 border-primary shadow-lg shadow-primary/30 transition-all duration-150 pointer-events-none"
                    style={{ left: `calc(${pct}% - 10px)` }} />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground select-none">
                <span>{MIN_KM} km</span><span>{MAX_KM} km</span>
            </div>
        </div>
    );
}

function SaveIndicator({ state }: { state: SaveState }) {
    if (state === 'idle') return null;
    const config = {
        saving: { icon: <Loader2 size={14} className="animate-spin" />, text: 'Saving…', cls: 'text-primary' },
        saved:  { icon: <CheckCircle size={14} />, text: 'Saved', cls: 'text-emerald-500' },
        error:  { icon: <AlertCircle size={14} />, text: 'Failed to save', cls: 'text-destructive' },
    }[state];
    return <motion.span key={state} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
        className={`flex items-center gap-1 text-xs font-medium ${config.cls}`}>{config.icon}{config.text}</motion.span>;
}

function RadiusPreview({ km }: { km: number }) {
    const r = 30 + (km / MAX_KM) * 90;
    return (
        <div className="relative mx-auto flex items-center justify-center" style={{ width: 220, height: 220 }} aria-hidden>
            {[1, 0.65, 0.35].map((scale, i) => (
                <div key={i} className="absolute rounded-full border border-primary/20 bg-primary/5 transition-all duration-500"
                    style={{ width: r * 2 * scale, height: r * 2 * scale }} />
            ))}
            <div className="relative z-10 flex flex-col items-center gap-1">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-emerald-400 shadow-lg shadow-primary/40 flex items-center justify-center">
                    <MapPin size={14} className="text-white" />
                </div>
                <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">{km} km</span>
            </div>
        </div>
    );
}

export default function AppSettings() {
    const { user, profile } = useAuth();

    // ── Proximity radius state ────────────────────────────────────────────────
    const [radius, setRadius] = useState<number>((profile as any)?.notification_radius_km ?? 10);
    const [saveState, setSaveState] = useState<SaveState>('idle');

    useEffect(() => {
        const r = (profile as any)?.notification_radius_km;
        if (typeof r === 'number') setRadius(r);
    }, [profile]);

    const persist = useCallback(async (newRadius: number) => {
        if (!user?.id) return;
        setSaveState('saving');
        const { error } = await supabase.from('profiles').update({ notification_radius_km: newRadius }).eq('id', user.id);
        setSaveState(error ? 'error' : 'saved');
        setTimeout(() => setSaveState('idle'), 2500);
    }, [user?.id]);

    useEffect(() => {
        const timer = setTimeout(() => persist(radius), DEBOUNCE_MS);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [radius]);

    const handleRadiusChange = (v: number) => { setRadius(clamp(v)); setSaveState('idle'); };
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const parsed = parseInt(e.target.value, 10);
        if (!isNaN(parsed)) handleRadiusChange(parsed);
    };
    const navigate = useNavigate();

    // Load from local storage synchronously
    const getInitialState = () => {
        try {
            const saved = localStorage.getItem('eravat_app_settings');
            if (saved) return JSON.parse(saved);
        } catch (e) { }
        return {};
    };

    const initial = getInitialState();

    // Local state for settings.
    const [theme, setTheme] = useState<'system' | 'light' | 'dark'>(initial.theme || 'system');
    const [autoSync, setAutoSync] = useState(initial.autoSync !== undefined ? initial.autoSync : true);
    const [wifiOnly, setWifiOnly] = useState(initial.wifiOnly !== undefined ? initial.wifiOnly : false);
    const [mapStyle, setMapStyle] = useState<'terrain' | 'satellite'>(initial.mapStyle || 'terrain');
    const [language, setLanguage] = useState<'english' | 'hindi'>(initial.language || 'english');

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
                <div className="space-y-3 animate-fade-in">
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
                </div>

                {/* Offline Sync Behavior */}
                <div className="space-y-3 animate-fade-in" style={{ animationDelay: '100ms', animationFillMode: 'both' }}>
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
                </div>

                {/* Map Settings */}
                <div className="space-y-3 animate-fade-in" style={{ animationDelay: '200ms', animationFillMode: 'both' }}>
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
                </div>

                {/* Proximity Alert Radius */}
                <div className="space-y-3 animate-fade-in" style={{ animationDelay: '300ms', animationFillMode: 'both' }}>
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider pl-1">Notifications</h2>
                    <div className="glass-card rounded-2xl p-5 space-y-5">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-primary/10 text-primary"><Bell size={18} /></div>
                            <div>
                                <div className="font-medium">Proximity Alert Radius</div>
                                <div className="text-xs text-muted-foreground mt-0.5">Get notified when activity occurs near your region</div>
                            </div>
                        </div>

                        <RadiusPreview km={radius} />

                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <label htmlFor="radius-slider" className="flex items-center gap-2 text-sm font-medium text-foreground">
                                    <Radio size={15} className="text-primary" />
                                    Alert Radius
                                </label>
                                <div className="flex items-center gap-2">
                                    <SaveIndicator state={saveState} />
                                    <div className="flex items-center gap-1 bg-primary/10 rounded-xl px-3 py-1">
                                        <input type="number" min={MIN_KM} max={MAX_KM} value={radius} onChange={handleInputChange}
                                            className="w-10 bg-transparent text-center text-sm font-bold text-primary focus:outline-none"
                                            aria-label="Alert radius value" />
                                        <span className="text-xs font-semibold text-primary/70">km</span>
                                    </div>
                                </div>
                            </div>
                            <RadiusSlider value={radius} onChange={handleRadiusChange} />
                        </div>

                        <p className="text-xs text-muted-foreground leading-relaxed bg-muted/50 rounded-2xl px-4 py-3 border border-border/50">
                            You'll receive a notification whenever a new field report is filed within{' '}
                            <span className="font-semibold text-foreground">{radius} km</span> of your assigned territory's centroid.
                            Drag the slider or type a value (1–100 km).
                        </p>
                    </div>
                </div>

            </div>
        </div>
    );
}
