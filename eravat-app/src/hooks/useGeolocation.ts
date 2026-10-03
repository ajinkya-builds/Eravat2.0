import { useState, useCallback, useRef, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation, type Position } from '@capacitor/geolocation';
import { LocationSettings } from '../plugins/LocationSettings';
import {
    acquireDevicePosition,
    classifyGeolocationError,
    geoErrorTranslationKey,
    inferLocationSource,
    nativeFixToPosition,
    persistLastGpsFix,
    readLastGpsFix,
    sourceFromAccuracy,
    withLocationSource,
    DEFAULT_LAST_GPS_MAX_AGE_MS,
    GEOLOCATION_GPS_BUDGET_MS,
    GEOLOCATION_TIMEOUT_MS,
    LOCATION_ENABLED_EVENT,
    type AcquiredPosition,
    type LocationAdapters,
} from '../lib/deviceLocation';
import { isBrowserOffline } from '../lib/offlineSession';
import { newGeoAcquireId, trackGeo, accuracyBucket, roundCoord } from '../lib/geoTelemetry';

export {
    classifyGeolocationError,
    geoErrorTranslationKey,
    GEOLOCATION_TIMEOUT_MS,
    persistLastGpsFix,
    readLastGpsFix,
};

function toNativePosition(fix: {
    latitude?: number;
    longitude?: number;
    accuracy?: number | null;
    timestamp?: number;
    provider?: string;
}): AcquiredPosition | null {
    if (typeof fix.latitude !== 'number' || typeof fix.longitude !== 'number' || typeof fix.timestamp !== 'number') {
        return null;
    }
    return withLocationSource(
        nativeFixToPosition({
            latitude: fix.latitude,
            longitude: fix.longitude,
            accuracy: fix.accuracy,
            timestamp: fix.timestamp,
        }),
        sourceFromAccuracy(fix.provider, fix.accuracy),
    );
}

function createAdapters(): LocationAdapters {
    return {
        getCurrentPosition: (options) => Geolocation.getCurrentPosition(options),
        watchPosition: (options, callback) => Geolocation.watchPosition(options, callback),
        clearWatch: (id) => Geolocation.clearWatch({ id }),
        getNativeLastKnown: () => LocationSettings.getLastKnown().then((fix) => {
            const position = toNativePosition(fix);
            return position;
        }).catch(() => null),
        requestFreshFix: async (timeoutMs, improveBelowM) => {
            const fix = await LocationSettings.requestFreshFix({ timeoutMs, improveBelowM });
            return toNativePosition(fix);
        },
        cancelFreshFix: async () => {
            await LocationSettings.cancelFreshFix();
        },
        ensureLocationEnabled: () => ensureDeviceLocationOn(),
    };
}

/**
 * Capacitor Geolocation crashes (NPE in startWatch) if watchPosition and
 * getCurrentPosition both try to raise a permission dialog at once — especially
 * the Android "approximate → precise" upgrade. Request fine location once first.
 */
async function ensureFineLocationPermission(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try {
        let status = await Geolocation.checkPermissions();
        if (status.location === 'granted') return;
        status = await Geolocation.requestPermissions({ permissions: ['location', 'coarseLocation'] });
        if (status.location !== 'granted') {
            throw new Error('LOCATION_PERMISSION_DENIED');
        }
    } catch (err) {
        const code = classifyGeolocationError(err);
        if (code === 'LOCATION_PERMISSION_DENIED') throw err instanceof Error ? err : new Error(code);
        // Older plugin builds may not accept the permissions arg — retry bare request.
        try {
            const status = await Geolocation.requestPermissions();
            if (status.location !== 'granted') {
                throw new Error('LOCATION_PERMISSION_DENIED');
            }
        } catch (retryErr) {
            throw retryErr;
        }
    }
}

type GpsFixListener = (position: AcquiredPosition) => void;
const gpsFixListeners = new Set<GpsFixListener>();

function emitGpsFix(position: AcquiredPosition) {
    if (position.source !== 'cell') persistLastGpsFix(position);
    gpsFixListeners.forEach((listener) => listener(position));
}

let acquireInflight: Promise<AcquiredPosition> | null = null;
let ensureInflight: Promise<boolean> | null = null;

/** One system "Turn on location" dialog at a time. */
function ensureDeviceLocationOn(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return Promise.resolve(true);
    if (!ensureInflight) {
        ensureInflight = LocationSettings.ensureEnabled()
            .then((result) => Boolean(result.enabled))
            .catch(() => false)
            .finally(() => {
                ensureInflight = null;
            });
    }
    return ensureInflight;
}

async function acquirePosition(
    promptIfDisabled: boolean,
    caller = 'hook',
): Promise<AcquiredPosition> {
    if (acquireInflight) {
        trackGeo('geo.acquire_joined_inflight', { caller, prompt_if_disabled: promptIfDisabled });
        return acquireInflight;
    }
    const offline = isBrowserOffline();
    const nativeBudget = GEOLOCATION_GPS_BUDGET_MS;
    // Hard ceiling so a hung native cancel/plugin call cannot pin the report form forever.
    const hardDeadlineMs = nativeBudget + 15_000;
    const acquireId = newGeoAcquireId(caller === 'bootstrap' ? 'boot' : 'acq');
    const run = (async () => {
        if (!Capacitor.isNativePlatform()) {
            trackGeo('geo.web_path', { acquire_id: acquireId, caller });
            const pos = await requestWebPosition();
            emitGpsFix(pos);
            return pos;
        }
        trackGeo('geo.permission_check_started', { acquire_id: acquireId, caller });
        try {
            await ensureFineLocationPermission();
            trackGeo('geo.permission_check_ok', { acquire_id: acquireId, caller });
        } catch (err) {
            trackGeo('geo.permission_check_failed', {
                acquire_id: acquireId,
                caller,
                error_code: classifyGeolocationError(err),
            });
            throw err;
        }
        const adapters = createAdapters();
        const acquire = acquireDevicePosition(adapters, {
            promptIfDisabled,
            offline,
            onFix: emitGpsFix,
            nativeTimeoutMs: nativeBudget,
            allowCellFallback: true,
            acquireId,
            caller,
        });
        let timer: ReturnType<typeof setTimeout> | undefined;
        let hitHardDeadline = false;
        try {
            return await Promise.race([
                acquire,
                new Promise<AcquiredPosition>((_, reject) => {
                    timer = setTimeout(() => {
                        hitHardDeadline = true;
                        trackGeo('geo.hard_deadline', {
                            acquire_id: acquireId,
                            caller,
                            hard_deadline_ms: hardDeadlineMs,
                            offline,
                        });
                        reject(new Error('LOCATION_TIMEOUT'));
                    }, hardDeadlineMs);
                }),
            ]);
        } finally {
            if (timer) clearTimeout(timer);
            trackGeo('geo.cancel_invoked', {
                acquire_id: acquireId,
                caller,
                reason: hitHardDeadline ? 'hard_deadline' : 'acquire_finished',
                fire_and_forget: true,
            });
            try {
                void adapters.cancelFreshFix?.();
            } catch {
                // ignore
            }
        }
    })();
    acquireInflight = run;
    try {
        return await run;
    } finally {
        if (acquireInflight === run) acquireInflight = null;
    }
}

async function requestWebPosition(): Promise<AcquiredPosition> {
    if (!navigator.geolocation) {
        throw new Error('LOCATION_UNSUPPORTED');
    }
    const coordinates = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: GEOLOCATION_TIMEOUT_MS,
            maximumAge: 0,
        });
    });
    const position = {
        coords: {
            latitude: coordinates.coords.latitude,
            longitude: coordinates.coords.longitude,
            accuracy: coordinates.coords.accuracy,
            altitude: coordinates.coords.altitude,
            altitudeAccuracy: coordinates.coords.altitudeAccuracy,
            heading: coordinates.coords.heading,
            speed: coordinates.coords.speed,
        },
        timestamp: coordinates.timestamp,
    };
    return withLocationSource(position, inferLocationSource(position));
}

export function useGeolocation() {
    const [position, setPosition] = useState<AcquiredPosition | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const lastErrorRef = useRef<string | null>(null);

    const lastErrorCode = useCallback(() => lastErrorRef.current, []);
    const getLastKnownLocation = useCallback((maxAgeMs = DEFAULT_LAST_GPS_MAX_AGE_MS): Position | null => {
        return readLastGpsFix(maxAgeMs);
    }, []);

    const requestLocation = useCallback(async (opts?: {
        promptIfDisabled?: boolean;
        caller?: string;
    }): Promise<AcquiredPosition | null> => {
        setIsLoading(true);
        setError(null);
        lastErrorRef.current = null;
        const caller = opts?.caller ?? 'hook';
        const started = Date.now();
        try {
            const coordinates = await acquirePosition(opts?.promptIfDisabled ?? false, caller);
            setPosition(coordinates);
            if (coordinates.source !== 'cell') persistLastGpsFix(coordinates);
            trackGeo('geo.hook_succeeded', {
                caller,
                location_source: coordinates.source,
                accuracy_m: coordinates.coords.accuracy != null
                    ? Math.round(coordinates.coords.accuracy)
                    : undefined,
                accuracy_bucket: accuracyBucket(coordinates.coords.accuracy),
                lat_r4: roundCoord(coordinates.coords.latitude),
                lng_r4: roundCoord(coordinates.coords.longitude),
                elapsed_ms: Date.now() - started,
            });
            return coordinates;
        } catch (err: unknown) {
            const code = classifyGeolocationError(err);
            lastErrorRef.current = code;
            setError(code);
            trackGeo('geo.hook_failed', {
                caller,
                error_code: code,
                elapsed_ms: Date.now() - started,
            });
            return null;
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        const onFix: GpsFixListener = (next) => setPosition(next);
        gpsFixListeners.add(onFix);
        return () => {
            gpsFixListeners.delete(onFix);
        };
    }, []);

    useEffect(() => {
        const onLocationState = (event: Event) => {
            const enabled = Boolean((event as CustomEvent<{ enabled?: boolean }>).detail?.enabled);
            if (!enabled) return;
            if (position) return;
            void requestLocation({ promptIfDisabled: false });
        };
        window.addEventListener(LOCATION_ENABLED_EVENT, onLocationState);
        return () => window.removeEventListener(LOCATION_ENABLED_EVENT, onLocationState);
    }, [position, requestLocation]);

    return {
        latitude: position?.coords.latitude,
        longitude: position?.coords.longitude,
        accuracy: position?.coords.accuracy,
        locationSource: position?.source ?? null,
        error,
        lastErrorCode,
        getLastKnownLocation,
        loading: isLoading,
        isLoading,
        fetchLocation: requestLocation,
        requestLocation,
    };
}

/** Prompt to turn on device location and warm GPS as soon as the native app boots. */
export function useDeviceLocationBootstrap() {
    const startedRef = useRef(false);

    useEffect(() => {
        if (startedRef.current) return;
        startedRef.current = true;
        if (!Capacitor.isNativePlatform()) return;
        // Warm GPS / prompt location-on only. Do not share the report capture lock,
        // do not settle on cell, and keep the wait to a single attempt.
        void (async () => {
            const acquireId = newGeoAcquireId('boot');
            const started = Date.now();
            trackGeo('geo.bootstrap_started', { acquire_id: acquireId });
            try {
                // Activity is resumed before the system location dialog can show.
                // Ask to turn location on before the permission sheet, and do not
                // let a permission failure skip that dialog.
                await new Promise((resolve) => setTimeout(resolve, 400));
                const enabled = await ensureDeviceLocationOn();
                trackGeo('geo.bootstrap_ensure_enabled', {
                    acquire_id: acquireId,
                    enabled,
                    elapsed_ms: Date.now() - started,
                });
                await ensureFineLocationPermission();
                trackGeo('geo.bootstrap_permission_ok', { acquire_id: acquireId });
                const pos = await acquireDevicePosition(createAdapters(), {
                    promptIfDisabled: true,
                    offline: isBrowserOffline(),
                    onFix: emitGpsFix,
                    nativeTimeoutMs: 30_000,
                    allowCellFallback: false,
                    acquireId,
                    caller: 'bootstrap',
                });
                trackGeo('geo.bootstrap_succeeded', {
                    acquire_id: acquireId,
                    location_source: pos.source,
                    accuracy_m: pos.coords.accuracy != null ? Math.round(pos.coords.accuracy) : undefined,
                    accuracy_bucket: accuracyBucket(pos.coords.accuracy),
                    lat_r4: roundCoord(pos.coords.latitude),
                    lng_r4: roundCoord(pos.coords.longitude),
                    elapsed_ms: Date.now() - started,
                });
            } catch (err) {
                trackGeo('geo.bootstrap_failed', {
                    acquire_id: acquireId,
                    error_code: classifyGeolocationError(err),
                    elapsed_ms: Date.now() - started,
                });
                // Banner in AppLayout covers the denied / still-off case.
            }
        })();
    }, []);
}
