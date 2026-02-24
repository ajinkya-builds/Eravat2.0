import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Compass, Navigation, RefreshCw, Lock, Unlock } from 'lucide-react';
import { useActivityForm } from '../../../contexts/ActivityFormContext';
import { cn } from '../../../lib/utils';
import { useLanguage } from '../../../contexts/LanguageContext';

export function CompassBearingStep() {
    const { formData, updateFormData } = useActivityForm();
    const [heading, setHeading] = useState<number | null>(formData.compass_bearing ?? null);
    const [isTracking, setIsTracking] = useState(false);
    const [isLocked, setIsLocked] = useState(false);
    const [permissionError, setPermissionError] = useState<string | null>(null);
    const { t } = useLanguage();
    const listenerRef = useRef<((e: DeviceOrientationEvent) => void) | null>(null);

    const handleOrientation = (event: DeviceOrientationEvent) => {
        if (isLocked) return;
        let deg: number | null = null;

        // iOS: webkitCompassHeading gives true north bearing
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const webkit = (event as any).webkitCompassHeading;
        if (webkit !== undefined && webkit !== null) {
            deg = Math.round(webkit);
        } else if (event.alpha !== null) {
            // Android fallback
            deg = Math.round((360 - event.alpha) % 360);
        }

        if (deg !== null) {
            setHeading(deg);
            if (!isLocked) updateFormData({ compass_bearing: deg });
        }
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
        listenerRef.current = handleOrientation;

        // Try deviceorientationabsolute first (for Android Chrome), fallback to deviceorientation
        if ('ondeviceorientationabsolute' in window) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (window as any).addEventListener('deviceorientationabsolute', handleOrientation, true);
        } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (window as any).addEventListener('deviceorientation', handleOrientation, true);
        }

        setIsTracking(true);
    };

    const stopTracking = () => {
        if (listenerRef.current) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (window as any).removeEventListener('deviceorientationabsolute', listenerRef.current, true);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (window as any).removeEventListener('deviceorientation', listenerRef.current, true);
            listenerRef.current = null;
        }
        setIsTracking(false);
        setIsLocked(false);
    };

    useEffect(() => () => { if (listenerRef.current) window.removeEventListener('deviceorientation', listenerRef.current, true); }, []);

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
                            "w-56 h-56 rounded-full border-[6px] flex items-center justify-center transition-all duration-300",
                            isTracking && !isLocked
                                ? "border-primary/50 bg-primary/10 shadow-[0_0_40px_rgba(var(--primary),0.3)]"
                                : "border-border bg-muted/20"
                        )}
                        style={{ transform: `rotate(${displayHeading}deg)` }}
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
                            onClick={() => { setIsLocked((l: boolean) => !l); if (!isLocked) updateFormData({ compass_bearing: heading ?? 0 }); }}
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
                            setHeading(v);
                            updateFormData({ compass_bearing: v });
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
