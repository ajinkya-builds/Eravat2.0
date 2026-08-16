import { useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation, type Position } from '@capacitor/geolocation';

export function useGeolocation() {
    const [position, setPosition] = useState<Position | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const requestLocation = useCallback(async () => {
        setIsLoading(true);
        setError(null);
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
                    timeout: 10000,
                    maximumAge: 3000
                });
                setPosition(coordinates);
                return coordinates;
            } else {
                // Web browser — use the native browser Geolocation API
                if (!navigator.geolocation) {
                    throw new Error('LOCATION_UNSUPPORTED');
                }
                const coordinates = await new Promise<GeolocationPosition>((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                        enableHighAccuracy: true,
                        timeout: 10000,
                        maximumAge: 3000
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
                return pos;
            }
        } catch (err: unknown) {
            if (err instanceof GeolocationPositionError) {
                const messages: Record<number, string> = {
                    [GeolocationPositionError.PERMISSION_DENIED]: 'LOCATION_PERMISSION_DENIED',
                    [GeolocationPositionError.POSITION_UNAVAILABLE]: 'LOCATION_UNAVAILABLE',
                    [GeolocationPositionError.TIMEOUT]: 'LOCATION_TIMEOUT',
                };
                setError(messages[err.code] ?? 'LOCATION_FAILED');
            } else if (err instanceof Error) {
                setError(err.message || 'LOCATION_FAILED');
            } else {
                setError('LOCATION_FAILED');
            }
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
        loading: isLoading,
        isLoading,
        // fetchLocation is an alias for requestLocation
        fetchLocation: requestLocation,
        requestLocation
    };
}
