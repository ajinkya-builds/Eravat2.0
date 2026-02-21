import { useState, useCallback } from 'react';
import { Geolocation, type Position } from '@capacitor/geolocation';

export function useGeolocation() {
    const [position, setPosition] = useState<Position | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const requestLocation = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            // First, request permissions (Critical for iOS/Android)
            const permissions = await Geolocation.checkPermissions();
            if (permissions.location !== 'granted') {
                const req = await Geolocation.requestPermissions();
                if (req.location !== 'granted') {
                    throw new Error('Location permission denied');
                }
            }

            const coordinates = await Geolocation.getCurrentPosition({
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 3000
            });
            setPosition(coordinates);
            return coordinates;
        } catch (err: unknown) {
            if (err instanceof Error) {
                setError(err.message || 'Failed to fetch location');
            } else {
                setError('Failed to fetch location');
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
