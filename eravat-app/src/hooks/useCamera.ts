import { useState, useCallback } from 'react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

export function useCamera() {
    const [photoUrl, setPhotoUrl] = useState<string | null>(null);
    const [base64String, setBase64String] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isCapturing, setIsCapturing] = useState(false);

    const takePhoto = useCallback(async () => {
        setIsCapturing(true);
        setError(null);
        try {
            // By using Base64, we can immediately store to Dexie for offline-first sync
            const image = await Camera.getPhoto({
                quality: 80,
                allowEditing: false,
                resultType: CameraResultType.Base64,
                source: CameraSource.Prompt, // Let user choose between Camera & Gallery
            });

            if (image.base64String) {
                setBase64String(image.base64String);
                // We render it immediately using standard data URL
                const dataUrl = `data:image/${image.format};base64,${image.base64String}`;
                setPhotoUrl(dataUrl);
                return { base64: image.base64String, format: image.format, dataUrl };
            }
            return null;
        } catch (err: unknown) {
            if (err instanceof Error && err.message !== 'User cancelled photos app') {
                setError(err.message || 'Failed to capture photo');
            } else if (!(err instanceof Error)) {
                setError('Failed to capture photo');
            }
            return null;
        } finally {
            setIsCapturing(false);
        }
    }, []);

    const clearPhoto = useCallback(() => {
        setPhotoUrl(null);
        setBase64String(null);
    }, []);

    return {
        photoUrl,
        base64String,
        error,
        isCapturing,
        takePhoto,
        clearPhoto
    };
}
