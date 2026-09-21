import { useState, useCallback, useRef, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation, type Position } from '@capacitor/geolocation';
import { LocationSettings } from '../plugins/LocationSettings';
import {
    acquireDevicePosition,
    classifyGeolocationError,
    geoErrorTranslationKey,
    nativeFixToPosition,
    persistLastGpsFix,
    readLastGpsFix,
    DEFAULT_LAST_GPS_MAX_AGE_MS,
    GEOLOCATION_TIMEOUT_MS,
    LOCATION_ENABLED_EVENT,
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

function toNativePosition(): Promise<Position | null> {
    return LocationSettings.getLastKnown()
        .then((fix) => {
            if (typeof fix.latitude !== 'number' || typeof fix.longitude !== 'number' || typeof fix.timestamp !== 'number') {
                return null;
            }
            return nativeFixToPosition({
                latitude: fix.latitude,
                longitude: fix.longitude,
                accuracy: fix.accuracy,
                timestamp: fix.timestamp,
            });
        })
        .catch(() => null);
}

function createAdapters(): LocationAdapters {
    return {
        getCurrentPosition: (options) => Geolocation.getCurrentPosition(options),
        watchPosition: (options, callback) => Geolocation.watchPosition(options, callback),
        clearWatch: (id) => Geolocation.clearWatch({ id }),
        getNativeLastKnown: toNativePosition,
        ensureLocationEnabled: async () => {
            if (!Capacitor.isNativePlatform()) return true;
            const result = await LocationSettings.ensureEnabled();
            return result.enabled;
        },
    };
}

async function requestWebPosition(): Promise<Position> {
    if (!navigator.geolocation) {
        throw new Error('LOCATION_UNSUPPORTED');
    }
    const coordinates = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: GEOLOCATION_TIMEOUT_MS,
            maximumAge: 15_000,
        });
    });
    return {
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
}

let acquireInflight: Promise<Position> | null = null;

async function acquirePosition(promptIfDisabled: boolean): Promise<Position> {
    if (acquireInflight) return acquireInflight;
    const run = (async () => {
        if (!Capacitor.isNativePlatform()) {
            const pos = await requestWebPosition();
            persistLastGpsFix(pos);
            return pos;
        }
        return acquireDevicePosition(createAdapters(), {
            promptIfDisabled,
            offline: isBrowserOffline(),
        });
    })();
    acquireInflight = run;
    try {
        return await run;
    } finally {
        acquireInflight = null;
    }
}

export function useGeolocation() {
    const [position, setPosition] = useState<Position | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const lastErrorRef = useRef<string | null>(null);

    const lastErrorCode = useCallback(() => lastErrorRef.current, []);
    const getLastKnownLocation = useCallback((maxAgeMs = DEFAULT_LAST_GPS_MAX_AGE_MS): Position | null => {
        return readLastGpsFix(maxAgeMs);
    }, []);

    const requestLocation = useCallback(async (opts?: { promptIfDisabled?: boolean }) => {
        setIsLoading(true);
        setError(null);
        lastErrorRef.current = null;
        try {
            const coordinates = await acquirePosition(opts?.promptIfDisabled ?? false);
            setPosition(coordinates);
            persistLastGpsFix(coordinates);
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
        void acquirePosition(true).catch(() => {
            // Banner in AppLayout covers the denied / still-off case.
        });
    }, []);
}
