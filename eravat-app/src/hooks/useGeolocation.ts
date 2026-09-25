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
    sourceFromProvider,
    withLocationSource,
    DEFAULT_LAST_GPS_MAX_AGE_MS,
    GEOLOCATION_GPS_BUDGET_MS,
    GEOLOCATION_TIMEOUT_MS,
    LOCATION_ENABLED_EVENT,
    type AcquiredPosition,
    type LocationAdapters,
} from '../lib/deviceLocation';
import { isBrowserOffline } from '../lib/offlineSession';

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
        sourceFromProvider(fix.provider),
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
        requestFreshFix: async (timeoutMs) => {
            const fix = await LocationSettings.requestFreshFix({ timeoutMs });
            return toNativePosition(fix);
        },
        cancelFreshFix: async () => {
            await LocationSettings.cancelFreshFix();
        },
        ensureLocationEnabled: async () => {
            if (!Capacitor.isNativePlatform()) return true;
            const result = await LocationSettings.ensureEnabled();
            return result.enabled;
        },
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

async function acquirePosition(promptIfDisabled: boolean): Promise<AcquiredPosition> {
    if (acquireInflight) return acquireInflight;
    const run = (async () => {
        if (!Capacitor.isNativePlatform()) {
            const pos = await requestWebPosition();
            emitGpsFix(pos);
            return pos;
        }
        await ensureFineLocationPermission();
        return acquireDevicePosition(createAdapters(), {
            promptIfDisabled,
            offline: isBrowserOffline(),
            onFix: emitGpsFix,
            nativeTimeoutMs: GEOLOCATION_GPS_BUDGET_MS,
            allowCellFallback: true,
        });
    })();
    acquireInflight = run;
    try {
        return await run;
    } finally {
        acquireInflight = null;
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

    const requestLocation = useCallback(async (opts?: { promptIfDisabled?: boolean }): Promise<AcquiredPosition | null> => {
        setIsLoading(true);
        setError(null);
        lastErrorRef.current = null;
        try {
            const coordinates = await acquirePosition(opts?.promptIfDisabled ?? false);
            setPosition(coordinates);
            if (coordinates.source !== 'cell') persistLastGpsFix(coordinates);
            return coordinates;
        } catch (err: unknown) {
            const code = classifyGeolocationError(err);
            lastErrorRef.current = code;
            setError(code);
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
            try {
                await ensureFineLocationPermission();
                await acquireDevicePosition(createAdapters(), {
                    promptIfDisabled: true,
                    offline: isBrowserOffline(),
                    onFix: emitGpsFix,
                    nativeTimeoutMs: 30_000,
                    allowCellFallback: false,
                });
            } catch {
                // Banner in AppLayout covers the denied / still-off case.
            }
        })();
    }, []);
}
