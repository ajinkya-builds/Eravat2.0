import { formatLatLngDms } from './geoFormat';

/**
 * Burn datetime + GPS (DMS) onto a photo data-URL via canvas.
 * Returns the stamped JPEG data-URL (falls back to original on failure).
 */
export async function stampPhotoWithMeta(
    dataUrl: string,
    opts: {
        latitude: number | null;
        longitude: number | null;
        activityDate: string;
        activityTime: string;
    }
): Promise<string> {
    try {
        const img = await loadImage(dataUrl);
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx || canvas.width < 8 || canvas.height < 8) return dataUrl;

        ctx.drawImage(img, 0, 0);

        const stampLines: string[] = [];
        const when = [opts.activityDate, opts.activityTime].filter(Boolean).join(' ');
        if (when) stampLines.push(when);
        if (opts.latitude != null && opts.longitude != null) {
            stampLines.push(formatLatLngDms(opts.latitude, opts.longitude));
        }
        if (stampLines.length === 0) return dataUrl;

        const pad = Math.max(8, Math.round(canvas.width * 0.02));
        const fontSize = Math.max(14, Math.round(canvas.width * 0.028));
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textBaseline = 'bottom';

        const lineHeight = fontSize * 1.25;
        const blockHeight = stampLines.length * lineHeight + pad;
        const maxTextWidth = Math.max(...stampLines.map((l) => ctx.measureText(l).width));
        const blockWidth = maxTextWidth + pad * 2;

        // Semi-transparent bar at bottom-left
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, canvas.height - blockHeight - pad, blockWidth + pad, blockHeight + pad);

        ctx.fillStyle = '#ffffff';
        stampLines.forEach((line, i) => {
            const y = canvas.height - pad - (stampLines.length - 1 - i) * lineHeight;
            ctx.fillText(line, pad, y);
        });

        return canvas.toDataURL('image/jpeg', 0.88);
    } catch {
        return dataUrl;
    }
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to load image for stamping'));
        img.src = src;
    });
}
