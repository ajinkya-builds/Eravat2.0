import { useState, useCallback } from 'react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

const ALLOWED_FORMATS = ['jpeg', 'jpg', 'png', 'webp'];

function normalizeImageFormat(format: string): 'jpeg' | 'png' | 'webp' {
    const lower = format.toLowerCase();
    if (lower === 'jpg') {
        return 'jpeg';
    }
    if (lower === 'png') {
        return 'png';
    }
    if (lower === 'webp') {
        return 'webp';
    }
    return 'jpeg';
}

export function useCamera() {
    const [photoUrl, setPhotoUrl] = useState<string | null>(null);
    const [base64String, setBase64String] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isCapturing, setIsCapturing] = useState(false);

    const capture = useCallback(async (source: CameraSource) => {
        setIsCapturing(true);
        setError(null);
        try {
            const image = await Camera.getPhoto({
                quality: 80,
                width: 1920,
                height: 1920,
                allowEditing: false,
                resultType: CameraResultType.Base64,
                source,
            });

            if (image.base64String) {
                const format = (image.format || 'jpeg').toLowerCase();
                if (!ALLOWED_FORMATS.includes(format)) {
                    setError(`Unsupported image format: ${format}. Use JPEG, PNG, or WebP.`);
                    return null;
                }

                setBase64String(image.base64String);
                const safeFormat = normalizeImageFormat(format);
                const dataUrl = `data:image/${safeFormat};base64,${image.base64String}`;
                setPhotoUrl(dataUrl);
                return { base64: image.base64String, format: safeFormat, dataUrl };
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

    const takePhoto = useCallback(() => capture(CameraSource.Camera), [capture]);
    const pickFromGallery = useCallback(() => capture(CameraSource.Photos), [capture]);

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
        pickFromGallery,
        clearPhoto
    };
}
