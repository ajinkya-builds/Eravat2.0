import { useState, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation, type Position } from '@capacitor/geolocation';

export const GEOLOCATION_TIMEOUT_MS = 10_000;
const LAST_GPS_KEY = 'eravat_last_gps_fix_v1';
const DEFAULT_LAST_GPS_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6h

type LastGpsFix = {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    timestamp: number;
};

function persistLastGpsFix(position: Position): void {
    try {
        const payload: LastGpsFix = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy ?? null,
            timestamp: position.timestamp,
        };
        localStorage.setItem(LAST_GPS_KEY, JSON.stringify(payload));
    } catch {
        // ignore cache write failures
    }
}

export function classifyGeolocationError(err: unknown): string {
    if (typeof GeolocationPositionError !== 'undefined' && err instanceof GeolocationPositionError) {
        const messages: Record<number, string> = {
            [GeolocationPositionError.PERMISSION_DENIED]: 'LOCATION_PERMISSION_DENIED',
            [GeolocationPositionError.POSITION_UNAVAILABLE]: 'LOCATION_UNAVAILABLE',
            [GeolocationPositionError.TIMEOUT]: 'LOCATION_TIMEOUT',
        };
        return messages[err.code] ?? 'LOCATION_FAILED';
    }
    if (err instanceof Error) {
        return err.message || 'LOCATION_FAILED';
    }
    return 'LOCATION_FAILED';
}

export function useGeolocation() {
    const [position, setPosition] = useState<Position | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const lastErrorRef = useRef<string | null>(null);
    const lastErrorCode = useCallback(() => lastErrorRef.current, []);
    const getLastKnownLocation = useCallback((maxAgeMs = DEFAULT_LAST_GPS_MAX_AGE_MS): Position | null => {
        try {
            const raw = localStorage.getItem(LAST_GPS_KEY);
            if (!raw) return null;
            const cached = JSON.parse(raw) as LastGpsFix;
            if (!cached || typeof cached.timestamp !== 'number') return null;
            if (Date.now() - cached.timestamp > maxAgeMs) return null;
            return {
                coords: {
                    latitude: cached.latitude,
                    longitude: cached.longitude,
                    accuracy: cached.accuracy ?? 0,
                    altitude: null,
                    altitudeAccuracy: null,
                    heading: null,
                    speed: null,
                },
                timestamp: cached.timestamp,
            };
        } catch {
            return null;
        }
    }, []);

    const requestLocation = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        lastErrorRef.current = null;
        try {
            if (Capacitor.isNativePlatform()) {
                // Native Android/iOS — use Capacitor geolocation with permission flow
                const permissions = await Geolocation.checkPermissions();
                if (permissions.location !== 'granted') {
                    const req = await Geolocation.requestPermissions();
                    if (req.location !== 'granted') {
                        throw new Error('LOCATION_PERMISSION_DENIED');
                    }
                }
                const coordinates = await Geolocation.getCurrentPosition({
                    enableHighAccuracy: true,
                    timeout: GEOLOCATION_TIMEOUT_MS,
                    maximumAge: 0,
                });
                setPosition(coordinates);
                persistLastGpsFix(coordinates);
                return coordinates;
            } else {
                // Web browser — use the native browser Geolocation API
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
                // Normalise to the same shape as a Capacitor Position
                const pos: Position = {
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
                setPosition(pos);
                persistLastGpsFix(pos);
                return pos;
            }
        } catch (err: unknown) {
            const code = classifyGeolocationError(err);
            lastErrorRef.current = code;
            setError(code);
            return null;
        } finally {
            setIsLoading(false);
        }
    }, []);

    return {
        latitude: position?.coords.latitude,
        longitude: position?.coords.longitude,
        accuracy: position?.coords.accuracy,
        error,
        lastErrorCode,
        getLastKnownLocation,
        loading: isLoading,
        isLoading,
        // fetchLocation is an alias for requestLocation
        fetchLocation: requestLocation,
        requestLocation
    };
}
