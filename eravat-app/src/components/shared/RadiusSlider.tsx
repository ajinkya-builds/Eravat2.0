import { motion } from 'framer-motion';
import { MapPin, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

// ─── Constants ───────────────────────────────────────────────────────────────

export const MIN_KM = 1;
export const MAX_KM = 500;

export function clamp(v: number, min = MIN_KM, max = MAX_KM) {
    return Math.min(max, Math.max(min, v));
}

// ─── SaveIndicator ───────────────────────────────────────────────────────────

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function SaveIndicator({ state }: { state: SaveState }) {
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

// ─── RadiusSlider ────────────────────────────────────────────────────────────

export function RadiusSlider({
    value,
    onChange,
    min = MIN_KM,
    max = MAX_KM,
}: {
    value: number;
    onChange: (v: number) => void;
    min?: number;
    max?: number;
}) {
    const pct = ((value - min) / (max - min)) * 100;

    return (
        <div className="space-y-3">
            <div className="relative h-2 rounded-full bg-muted overflow-visible">
                <div
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary to-emerald-400 transition-all duration-150"
                    style={{ width: `${pct}%` }}
                />
                <input
                    id="radius-slider"
                    type="range"
                    min={min}
                    max={max}
                    step={1}
                    value={value}
                    onChange={e => onChange(Number(e.target.value))}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    aria-label="Alert radius in kilometres"
                />
                <div
                    className="absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white border-2 border-primary shadow-lg shadow-primary/30 transition-all duration-150 pointer-events-none"
                    style={{ left: `calc(${pct}% - 10px)` }}
                />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground select-none">
                <span>{min} km</span>
                <span>{max} km</span>
            </div>
        </div>
    );
}

// ─── RadiusPreview ───────────────────────────────────────────────────────────

export function RadiusPreview({ km, max = MAX_KM }: { km: number; max?: number }) {
    const r = 30 + (km / max) * 90;
    return (
        <div
            className="relative mx-auto flex items-center justify-center"
            style={{ width: 260, height: 260 }}
            aria-hidden
        >
            {[1, 0.65, 0.35].map((scale, i) => (
                <div
                    key={i}
                    className="absolute rounded-full border border-primary/20 bg-primary/5 transition-all duration-500"
                    style={{ width: r * 2 * scale, height: r * 2 * scale }}
                />
            ))}
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
