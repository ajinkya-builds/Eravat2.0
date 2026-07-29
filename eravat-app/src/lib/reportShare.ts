/**
 * Helpers for sharing / downloading a report's data (review §9.3).
 *
 * `shareOrCopy` uses the Web Share API when available (so users can send the
 * report to WhatsApp/SMS/etc.), and falls back to copying the text to the
 * clipboard. `downloadTextFile` saves the report summary as a .txt file.
 */

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed';

interface SharePayload {
    title: string;
    text: string;
    url?: string;
    /** Optional image to attach (e.g. the sighting photo) when supported. */
    file?: File;
}

export async function shareOrCopy({ title, text, url, file }: SharePayload): Promise<ShareResult> {
    const composed = url ? `${text}\n${url}` : text;

    // Prefer sharing a file (photo + text) when the platform supports it.
    if (file && typeof navigator !== 'undefined' && 'canShare' in navigator) {
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if ((navigator as any).canShare({ files: [file] })) {
                await navigator.share({ title, text: composed, files: [file] });
                return 'shared';
            }
        } catch (err) {
            if ((err as Error)?.name === 'AbortError') return 'cancelled';
            // fall through to text share / clipboard
        }
    }

    if (typeof navigator !== 'undefined' && navigator.share) {
        try {
            await navigator.share({ title, text: composed });
            return 'shared';
        } catch (err) {
            if ((err as Error)?.name === 'AbortError') return 'cancelled';
            // fall through to clipboard
        }
    }

    try {
        await navigator.clipboard.writeText(composed);
        return 'copied';
    } catch {
        return 'failed';
    }
}

export function downloadTextFile(filename: string, content: string): void {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

/** Build a Google Maps link for a coordinate pair. */
export function mapsLink(lat: number, lng: number): string {
    return `https://www.google.com/maps?q=${lat},${lng}`;
}
