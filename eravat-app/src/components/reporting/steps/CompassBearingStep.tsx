import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Compass, Navigation, RefreshCw, Lock, Unlock } from 'lucide-react';
import { useActivityForm } from '../../../contexts/ActivityFormContext';
import { cn } from '../../../lib/utils';
import { useLanguage } from '../../../contexts/LanguageContext';

const SMOOTH_FACTOR = 0.18;
const UI_DEADBAND_DEG = 1.5;
const UI_MIN_INTERVAL_MS = 80;

function normalizeDeg(deg: number): number {
    return ((deg % 360) + 360) % 360;
}

/** Shortest-path lerp on a circle (handles 359° ↔ 1°). */
function circularLerp(current: number, next: number, factor: number): number {
    const diff = ((next - current + 540) % 360) - 180;
    return normalizeDeg(current + diff * factor);
}

function circularDelta(a: number, b: number): number {
    return Math.abs(((b - a + 540) % 360) - 180);
}

function screenOrientationOffset(): number {
    const so = window.screen?.orientation?.angle;
    if (typeof so === 'number' && !Number.isNaN(so)) return so;
    const legacy = (window as unknown as { orientation?: number }).orientation;
    if (typeof legacy === 'number' && !Number.isNaN(legacy)) return legacy;
    return 0;
}

type OrientationSource = 'absolute' | 'relative' | 'webkit';

function extractRawHeading(event: DeviceOrientationEvent, source: OrientationSource): number | null {
    // iOS: true/magnetic north from webkit
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const webkit = (event as any).webkitCompassHeading;
    if (webkit !== undefined && webkit !== null && !Number.isNaN(Number(webkit))) {
        return normalizeDeg(Number(webkit) + screenOrientationOffset());
    }

    if (event.alpha === null || Number.isNaN(event.alpha)) return null;

    // Absolute events: alpha is already degrees from magnetic north (0 = north).
    // Relative deviceorientation: Chrome often needs (360 - alpha).
    const base =
        source === 'absolute' || event.absolute === true
            ? event.alpha
            : 360 - event.alpha;

    return normalizeDeg(base + screenOrientationOffset());
}

export function CompassBearingStep() {
    const { formData, updateFormData } = useActivityForm();
    const [heading, setHeading] = useState<number | null>(formData.compass_bearing ?? null);
    const [isTracking, setIsTracking] = useState(false);
    const [isLocked, setIsLocked] = useState(false);
    const [permissionError, setPermissionError] = useState<string | null>(null);
    const { t } = useLanguage();

    const listenerRef = useRef<((e: DeviceOrientationEvent) => void) | null>(null);
    const eventNameRef = useRef<'deviceorientationabsolute' | 'deviceorientation' | null>(null);
    const isLockedRef = useRef(false);
    const smoothedRef = useRef<number | null>(
        formData.compass_bearing != null ? Number(formData.compass_bearing) : null
    );
    const lastUiHeadingRef = useRef<number | null>(smoothedRef.current);
    const lastUiAtRef = useRef(0);
    const sourceRef = useRef<OrientationSource>('relative');

    const detachListener = () => {
        if (listenerRef.current && eventNameRef.current) {
            window.removeEventListener(eventNameRef.current, listenerRef.current as EventListener, true);
        }
        listenerRef.current = null;
        eventNameRef.current = null;
    };

    const publishHeading = (deg: number, force = false) => {
        const now = performance.now();
        const last = lastUiHeadingRef.current;
        const elapsed = now - lastUiAtRef.current;
        if (
            !force &&
            last != null &&
            circularDelta(last, deg) < UI_DEADBAND_DEG &&
            elapsed < UI_MIN_INTERVAL_MS
        ) {
            return;
        }
        const rounded = Math.round(deg);
        lastUiHeadingRef.current = rounded;
        lastUiAtRef.current = now;
        setHeading(rounded);
        if (!isLockedRef.current) {
            updateFormData({ compass_bearing: rounded });
        }
    };

    const handleOrientation = (event: DeviceOrientationEvent) => {
        if (isLockedRef.current) return;

        const raw = extractRawHeading(event, sourceRef.current);
        if (raw === null) return;

        const prev = smoothedRef.current;
        const smoothed = prev == null ? raw : circularLerp(prev, raw, SMOOTH_FACTOR);
        smoothedRef.current = smoothed;
        publishHeading(smoothed);
    };

    const startTracking = async () => {
        // iOS 13+ requires permission
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const DeviceOrientationEventTyped = DeviceOrientationEvent as any;
        if (typeof DeviceOrientationEventTyped.requestPermission === 'function') {
            try {
                const perm = await DeviceOrientationEventTyped.requestPermission();
                if (perm !== 'granted') {
                    setPermissionError('Compass access denied. Please allow motion sensor access.');
                    return;
                }
            } catch {
                setPermissionError('Could not request compass permission.');
                return;
            }
        }
        setPermissionError(null);
        detachListener();

        const handler = handleOrientation;
        listenerRef.current = handler;

        // Prefer absolute magnetic heading on Android Chrome / WebView.
        // Avoid `'x' in window` — when the prop exists on Window's type, the else
        // branch is narrowed to `never` and tsc fails in CI.
        const supportsAbsolute =
            typeof (window as Window & { ondeviceorientationabsolute?: unknown })
                .ondeviceorientationabsolute !== 'undefined';
        const eventName = supportsAbsolute
            ? 'deviceorientationabsolute'
            : 'deviceorientation';
        sourceRef.current = supportsAbsolute ? 'absolute' : 'relative';
        eventNameRef.current = eventName;
        window.addEventListener(eventName, handler as EventListener, true);

        isLockedRef.current = false;
        setIsLocked(false);
        setIsTracking(true);
    };

    const stopTracking = () => {
        detachListener();
        isLockedRef.current = false;
        setIsTracking(false);
        setIsLocked(false);
    };

    const toggleLock = () => {
        const next = !isLockedRef.current;
        isLockedRef.current = next;
        setIsLocked(next);
        if (next) {
            const locked =
                smoothedRef.current != null
                    ? Math.round(smoothedRef.current)
                    : (heading ?? formData.compass_bearing ?? 0);
            smoothedRef.current = locked;
            lastUiHeadingRef.current = locked;
            setHeading(locked);
            updateFormData({ compass_bearing: locked });
        }
    };

    useEffect(() => () => detachListener(), []);

    const displayHeading = heading ?? formData.compass_bearing ?? 0;

    return (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
            <div className="text-center space-y-2">
                <h3 className="font-semibold text-foreground">{t('cb_compass_bearing')}</h3>
                <p className="text-xs text-muted-foreground">{t('cb_record_direction')}</p>
            </div>

            {/* Compass Rose */}
            <div className="flex justify-center my-8">
                <div className="relative">
                    <div
                        className={cn(
                            "w-56 h-56 rounded-full border-[6px] flex items-center justify-center",
                            isTracking && !isLocked
                                ? "border-primary/50 bg-primary/10 shadow-[0_0_40px_rgba(var(--primary),0.3)]"
                                : "border-border bg-muted/20"
                        )}
                        style={{
                            transform: `rotate(${displayHeading}deg)`,
                            // Avoid CSS transition fighting sensor updates (looks like jitter)
                            transition: isTracking && !isLocked ? 'none' : 'transform 200ms ease-out',
                        }}
                    >
                        <Navigation className={cn("w-20 h-20 transition-colors", isTracking && !isLocked ? "text-primary" : "text-muted-foreground")} />
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-6 h-6 bg-primary rounded-full shadow-lg shadow-primary/40 border-4 border-background" />
                    </div>
                    {/* N E S W labels */}
                    <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold text-foreground">N</span>
                    <span className="absolute top-1/2 -right-6 -translate-y-1/2 text-xs font-bold text-foreground">E</span>
                    <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs font-bold text-foreground">S</span>
                    <span className="absolute top-1/2 -left-6 -translate-y-1/2 text-xs font-bold text-foreground">W</span>
                </div>
            </div>

            {/* Bearing value */}
            <div className="text-center">
                <span className="text-5xl font-bold text-foreground tabular-nums">{displayHeading}°</span>
                <p className="text-xs text-muted-foreground mt-1">
                    {isTracking ? (isLocked ? t('cb_bearing_locked') : t('cb_live_tracking')) : t('cb_manual_tracking')}
                </p>
            </div>

            {/* Controls */}
            <div className="flex gap-3 justify-center flex-wrap">
                {!isTracking ? (
                    <button
                        type="button"
                        onClick={startTracking}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity"
                    >
                        <Compass className="w-4 h-4" /> {t('cb_start_tracking')}
                    </button>
                ) : (
                    <>
                        <button
                            type="button"
                            onClick={toggleLock}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl glass-card border border-border text-sm font-medium"
                        >
                            {isLocked ? <><Unlock className="w-4 h-4" /> {t('cb_unlock')}</> : <><Lock className="w-4 h-4" /> {t('cb_lock')}</>}
                        </button>
                        <button
                            type="button"
                            onClick={stopTracking}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted text-muted-foreground text-sm font-medium hover:bg-muted/70 transition-colors"
                        >
                            {t('cb_stop')}
                        </button>
                    </>
                )}
            </div>

            {/* Manual entry */}
            <div className="glass-card rounded-2xl p-4 space-y-2">
                <label className="text-sm font-medium text-foreground flex items-center gap-2">
                    <RefreshCw className="w-4 h-4" /> {t('cb_manual_entry')}
                </label>
                <input
                    type="number"
                    min={0}
                    max={360}
                    step={1}
                    value={formData.compass_bearing ?? ''}
                    onChange={e => {
                        const v = parseInt(e.target.value);
                        if (!isNaN(v) && v >= 0 && v <= 360) {
                            const deg = normalizeDeg(v);
                            smoothedRef.current = deg;
                            lastUiHeadingRef.current = deg;
                            setHeading(deg);
                            updateFormData({ compass_bearing: deg });
                        }
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder={t('cb_enter_degrees')}
                />
            </div>

            {permissionError && (
                <p className="text-xs text-destructive text-center">⚠ {permissionError}</p>
            )}
        </motion.div>
    );
}
