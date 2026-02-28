import { useState, useCallback } from 'react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

const ALLOWED_FORMATS = ['jpeg', 'jpg', 'png', 'webp'];
const MAX_BASE64_SIZE = 5 * 1024 * 1024; // ~5MB in base64 characters

export function useCamera() {
    const [photoUrl, setPhotoUrl] = useState<string | null>(null);
    const [base64String, setBase64String] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isCapturing, setIsCapturing] = useState(false);

    const takePhoto = useCallback(async () => {
        setIsCapturing(true);
        setError(null);
        try {
            const image = await Camera.getPhoto({
                quality: 80,
                allowEditing: false,
                resultType: CameraResultType.Base64,
                source: CameraSource.Prompt,
            });

            if (image.base64String) {
                // Validate format against whitelist
                const format = (image.format || 'jpeg').toLowerCase();
                if (!ALLOWED_FORMATS.includes(format)) {
                    setError(`Unsupported image format: ${format}. Use JPEG, PNG, or WebP.`);
                    return null;
                }

                // Validate file size
                if (image.base64String.length > MAX_BASE64_SIZE) {
                    setError('Image is too large. Please use a smaller image (max 5MB).');
                    return null;
                }

                setBase64String(image.base64String);
                const safeFormat = ALLOWED_FORMATS.includes(format) ? format : 'jpeg';
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
