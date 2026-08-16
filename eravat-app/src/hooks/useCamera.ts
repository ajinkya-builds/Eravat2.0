import { useState, useCallback } from 'react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

const ALLOWED_FORMATS = ['jpeg', 'jpg', 'png', 'webp'];
const MAX_EDGE = 2560;

async function blobToJpegDataUrl(blob: Blob): Promise<{ dataUrl: string; base64: string; format: 'jpeg' }> {
    const bitmapUrl = URL.createObjectURL(blob);
    try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new Image();
            el.onload = () => resolve(el);
            el.onerror = () => reject(new Error('Failed to load photo'));
            el.src = bitmapUrl;
        });
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        const scale = Math.min(1, MAX_EDGE / Math.max(w, h, 1));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not process photo');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
        const base64 = dataUrl.split(',')[1] || '';
        return { dataUrl, base64, format: 'jpeg' };
    } finally {
        URL.revokeObjectURL(bitmapUrl);
    }
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
            // Uri + client compress accepts large gallery files (review: no 5MB cap).
            const image = await Camera.getPhoto({
                quality: 90,
                allowEditing: false,
                resultType: CameraResultType.Uri,
                source,
                correctOrientation: true,
            });

            const path = image.webPath;
            if (!path) {
                setError('Could not read the selected photo.');
                return null;
            }

            const format = (image.format || 'jpeg').toLowerCase();
            if (image.format && !ALLOWED_FORMATS.includes(format) && format !== 'heic' && format !== 'heif') {
                setError(`Unsupported image format: ${format}. Use JPEG, PNG, or WebP.`);
                return null;
            }

            const resp = await fetch(path);
            if (!resp.ok) {
                setError('Could not read the selected photo.');
                return null;
            }
            const blob = await resp.blob();
            const processed = await blobToJpegDataUrl(blob);
            setBase64String(processed.base64);
            setPhotoUrl(processed.dataUrl);
            return { base64: processed.base64, format: processed.format, dataUrl: processed.dataUrl };
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
