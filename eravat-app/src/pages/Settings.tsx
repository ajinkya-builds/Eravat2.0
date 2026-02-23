import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Bell, MapPin, CheckCircle, AlertCircle, Loader2, Radio } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabase';

// ─── Types ───────────────────────────────────────────────────────────────────

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MIN_KM = 1;
const MAX_KM = 100;
const DEBOUNCE_MS = 800;

function clamp(v: number) {
    return Math.min(MAX_KM, Math.max(MIN_KM, v));
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function RadiusSlider({
    value,
    onChange,
}: {
    value: number;
    onChange: (v: number) => void;
}) {
    const pct = ((value - MIN_KM) / (MAX_KM - MIN_KM)) * 100;

    return (
        <div className="space-y-3">
            {/* Track */}
            <div className="relative h-2 rounded-full bg-muted overflow-visible">
                {/* Filled portion */}
                <div
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary to-emerald-400 transition-all duration-150"
                    style={{ width: `${pct}%` }}
                />
                {/* Native input for accessibility & drag */}
                <input
                    id="radius-slider"
                    type="range"
                    min={MIN_KM}
                    max={MAX_KM}
                    step={1}
                    value={value}
                    onChange={e => onChange(Number(e.target.value))}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    aria-label="Alert radius in kilometres"
                />
                {/* Thumb */}
                <div
                    className="absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white border-2 border-primary shadow-lg shadow-primary/30 transition-all duration-150 pointer-events-none"
                    style={{ left: `calc(${pct}% - 10px)` }}
                />
            </div>

            {/* Min / Max labels */}
            <div className="flex justify-between text-xs text-muted-foreground select-none">
                <span>{MIN_KM} km</span>
                <span>{MAX_KM} km</span>
            </div>
        </div>
    );
}

function SaveIndicator({ state }: { state: SaveState }) {
    if (state === 'idle') return null;

    const config = {
        saving: { icon: <Loader2 size={14} className="animate-spin" />, text: 'Saving…', cls: 'text-primary' },
        saved:  { icon: <CheckCircle size={14} />,                       text: 'Saved',   cls: 'text-success' },
        error:  { icon: <AlertCircle size={14} />,                       text: 'Failed to save', cls: 'text-destructive' },
    }[state];

    return (
        <motion.span
            key={state}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`flex items-center gap-1 text-xs font-medium ${config.cls}`}
        >
            {config.icon}
            {config.text}
        </motion.span>
    );
}

// ─── Map preview: a simple concentric-circle visualisation ───────────────────

function RadiusPreview({ km }: { km: number }) {
    // Outer ring maps 1–100 km → 30–120px radius for the preview circle
    const r = 30 + (km / MAX_KM) * 90;
    return (
        <div
            className="relative mx-auto flex items-center justify-center"
            style={{ width: 260, height: 260 }}
            aria-hidden
        >
            {/* Pulse rings */}
            {[1, 0.65, 0.35].map((scale, i) => (
                <div
                    key={i}
                    className="absolute rounded-full border border-primary/20 bg-primary/5 transition-all duration-500"
                    style={{
                        width: r * 2 * scale,
                        height: r * 2 * scale,
                    }}
                />
            ))}

            {/* Centre dot */}
            <div className="relative z-10 flex flex-col items-center gap-1">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-emerald-400 shadow-lg shadow-primary/40 flex items-center justify-center">
                    <MapPin size={14} className="text-white" />
                </div>
                <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                    {km} km
                </span>
            </div>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Settings() {
    const { user, profile } = useAuth();

    // Initialise from profile's existing radius (falls back to 10 if column not yet present)
    const [radius, setRadius] = useState<number>((profile as any)?.notification_radius_km ?? 10);
    const [saveState, setSaveState] = useState<SaveState>('idle');

    // Keep local state in sync if profile reloads
    useEffect(() => {
        const r = (profile as any)?.notification_radius_km;
        if (typeof r === 'number') setRadius(r);
    }, [profile]);

    // Debounced Supabase write
    const persist = useCallback(
        async (newRadius: number) => {
            if (!user?.id) return;
            setSaveState('saving');
            const { error } = await supabase
                .from('profiles')
                .update({ notification_radius_km: newRadius })
                .eq('id', user.id);

            setSaveState(error ? 'error' : 'saved');

            // Auto-reset to idle after 2.5 s
            setTimeout(() => setSaveState('idle'), 2500);
        },
        [user?.id],
    );

    // Debounce slider changes so we don't spam Supabase on every pixel
    useEffect(() => {
        const timer = setTimeout(() => persist(radius), DEBOUNCE_MS);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [radius]);

    const handleRadiusChange = (v: number) => {
        setRadius(clamp(v));
        setSaveState('idle');
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const parsed = parseInt(e.target.value, 10);
        if (!isNaN(parsed)) handleRadiusChange(parsed);
    };

    return (
        <div className="min-h-screen p-6 space-y-6 max-w-lg mx-auto">

            {/* Header */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                <h1 className="text-2xl font-bold text-foreground">Settings</h1>
                <p className="text-sm text-muted-foreground mt-1">Manage your notification preferences</p>
            </motion.div>

            {/* Notification Settings card */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 }}
                className="glass-card rounded-3xl p-6 space-y-6"
            >
                {/* Section title */}
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                        <Bell size={20} />
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-foreground">Proximity Alerts</h2>
                        <p className="text-xs text-muted-foreground">Get notified when activity occurs near your region</p>
                    </div>
                </div>

                {/* Visual radius preview */}
                <RadiusPreview km={radius} />

                {/* Slider row */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <label htmlFor="radius-slider" className="flex items-center gap-2 text-sm font-medium text-foreground">
                            <Radio size={15} className="text-primary" />
                            Alert Radius
                        </label>
                        <div className="flex items-center gap-2">
                            <SaveIndicator state={saveState} />
                            {/* Editable number badge */}
                            <div className="flex items-center gap-1 bg-primary/10 rounded-xl px-3 py-1">
                                <input
                                    type="number"
                                    min={MIN_KM}
                                    max={MAX_KM}
                                    value={radius}
                                    onChange={handleInputChange}
                                    className="w-10 bg-transparent text-center text-sm font-bold text-primary focus:outline-none"
                                    aria-label="Alert radius value"
                                />
                                <span className="text-xs font-semibold text-primary/70">km</span>
                            </div>
                        </div>
                    </div>

                    <RadiusSlider value={radius} onChange={handleRadiusChange} />
                </div>

                {/* Explainer */}
                <p className="text-xs text-muted-foreground leading-relaxed bg-muted/50 rounded-2xl px-4 py-3 border border-border/50">
                    You'll receive a notification whenever a new field report is filed within{' '}
                    <span className="font-semibold text-foreground">{radius} km</span> of the
                    centroid of your assigned territory. Drag the slider or type a value (1–100 km).
                </p>
            </motion.div>

            {/* Future settings placeholder */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.16 }}
                className="glass-card rounded-3xl p-6 space-y-3 opacity-50 pointer-events-none select-none"
            >
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-muted flex items-center justify-center text-muted-foreground">
                        <Bell size={20} />
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-foreground">Push Notifications</h2>
                        <p className="text-xs text-muted-foreground">Coming soon</p>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
