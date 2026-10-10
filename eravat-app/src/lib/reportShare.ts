/**
 * Share a sighting the way field staff already forward Gaj Rakshak messages:
 * one text body (place, counts, damage, photo link, map link) sent through
 * the system share sheet so WhatsApp and the other apps open directly.
 */
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { supabase } from '../supabase';

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed';

interface SharePayload {
    title: string;
    text: string;
    /** Appended only when the caller has not already placed the link in `text`. */
    url?: string;
}

/** Signed photo links stay valid long enough to forward the message onward. */
export const SIGHTING_PHOTO_SHARE_SECONDS = 7 * 24 * 60 * 60;

const IST = 'Asia/Kolkata';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export async function shareOrCopy({ title, text, url }: SharePayload): Promise<ShareResult> {
    const composed = url ? `${text}\n${url}` : text;

    // Android WebView often has no navigator.share, which is why Share used to
    // copy the text. The native plugin opens the system chooser (WhatsApp, etc.).
    // The photo stays a link inside the text — no image file attachment.
    if (Capacitor.isNativePlatform()) {
        try {
            await Share.share({
                title,
                text: composed,
                dialogTitle: title,
            });
            return 'shared';
        } catch (err) {
            if (isShareCancel(err)) return 'cancelled';
        }
    } else if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        try {
            await navigator.share({ title, text: composed });
            return 'shared';
        } catch (err) {
            if (isShareCancel(err)) return 'cancelled';
        }
    }

    try {
        await navigator.clipboard.writeText(composed);
        return 'copied';
    } catch {
        return 'failed';
    }
}

function isShareCancel(err: unknown): boolean {
    const name = err instanceof Error ? err.name : '';
    const message = err instanceof Error ? err.message : String(err ?? '');
    return name === 'AbortError' || /cancel/i.test(message);
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

export async function sightingPhotoShareUrl(path: string | null | undefined): Promise<string | null> {
    if (!path) return null;
    try {
        const { data } = await supabase.storage
            .from('report_media')
            .createSignedUrl(path, SIGHTING_PHOTO_SHARE_SECONDS);
        return data?.signedUrl ?? null;
    } catch {
        return null;
    }
}

/** Date and time in the Gaj Rakshak style, always in India time. */
export function formatShareDateParts(isoOrTimestamp: string): { date: string; time: string } | null {
    const d = new Date(isoOrTimestamp);
    if (isNaN(d.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: IST,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(d);
    const bag = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const month = Number(bag.month);
    const day = Number(bag.day);
    const year = Number(bag.year);
    const hour = Number(bag.hour);
    const minute = Number(bag.minute);
    if (![month, day, year, hour, minute].every((n) => Number.isFinite(n))) return null;
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return {
        date: `${MONTHS[month - 1]} ${day}, ${String(year).slice(-2)}`,
        time: `${hour12}:${String(minute).padStart(2, '0')} ${ampm}`,
    };
}

export type ShareDamageFlags = {
    crop: boolean;
    grain: boolean;
    house: boolean;
    human: boolean;
};

function tokensOf(values?: Array<string | null | undefined> | null): string[] {
    return (values ?? [])
        .flatMap((value) => (value ?? '').split(/[;,]/))
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
}

/**
 * Crop and grain are separate in the form, but grain is stored as category
 * `crop`. Original tokens live in conflict_loss_details.
 */
export function shareDamageFlags(input: {
    details?: Array<string | null | undefined> | null;
    categories?: Array<string | null | undefined> | null;
    description?: string | null;
}): ShareDamageFlags {
    const details = tokensOf(input.details);
    const categories = tokensOf(input.categories);
    const description = (input.description ?? '').toLowerCase();
    const isGrain = (token: string) => token === 'grain' || /\bgrain\b/.test(token);
    const grain = details.some(isGrain) || categories.some(isGrain) || /\bgrain\b/.test(description);
    const cropFromDetails = details.some((token) => token === 'crop');
    const cropFromCategory = categories.some((token) => token === 'crop');
    const grainOnly = grain && !cropFromDetails;
    const crop = cropFromDetails || (cropFromCategory && !grainOnly);
    const house = [...details, ...categories].some((token) => token === 'property' || token === 'house');
    const human = [...details, ...categories].some(
        (token) => token === 'human_death' || token === 'human_injury' || token === 'death' || token === 'injury',
    );
    return { crop, grain, house, human };
}

const BARE_DAMAGE_TOKEN =
    /^(crop|grain|property|house|livestock|fencing|naka_chaouki|human_injury|human_death|death|injury|other|none|no loss)$/i;

export function shareNarrative(notes?: string | null, damageDescription?: string | null): string | null {
    const note = notes?.trim() ?? '';
    const damage = damageDescription?.trim() ?? '';
    const extra = damage && !BARE_DAMAGE_TOKEN.test(damage) && damage !== note ? damage : '';
    const text = [note, extra].filter(Boolean).join('\n');
    return text || null;
}

export type SightingShareLabels = {
    date: string;
    time: string;
    division: string;
    range: string;
    beat: string;
    totalElephants: string;
    countDetails: string;
    male: string;
    female: string;
    calf: string;
    unknown: string;
    cropDamage: string;
    grainDamage: string;
    houseDamage: string;
    humanLoss: string;
    yes: string;
    no: string;
    description: string;
    gps: string;
    dms: string;
};

export function sightingShareLabels(t: (key: string) => string): SightingShareLabels {
    return {
        date: t('share.date'),
        time: t('share.time'),
        division: t('share.division'),
        range: t('share.range'),
        beat: t('share.beat'),
        totalElephants: t('share.totalElephants'),
        countDetails: t('share.countDetails'),
        male: t('share.male'),
        female: t('share.female'),
        calf: t('share.calf'),
        unknown: t('share.unknown'),
        cropDamage: t('share.cropDamage'),
        grainDamage: t('share.grainDamage'),
        houseDamage: t('share.houseDamage'),
        humanLoss: t('share.humanLoss'),
        yes: t('share.yes'),
        no: t('share.no'),
        description: t('share.description'),
        gps: t('share.coordinates'),
        dms: t('dtl_dms_location'),
    };
}

export type SightingShareFields = {
    observedAt?: string | null;
    division?: string | null;
    range?: string | null;
    beat?: string | null;
    male?: number | null;
    female?: number | null;
    calf?: number | null;
    unknown?: number | null;
    lossDetails?: Array<string | null | undefined> | null;
    damageCategories?: Array<string | null | undefined> | null;
    damageDescription?: string | null;
    notes?: string | null;
    lat?: number | null;
    lng?: number | null;
    dms?: string | null;
    photoUrl?: string | null;
    labels: SightingShareLabels;
};

export function buildSightingShareText(fields: SightingShareFields): string {
    const labels = fields.labels;
    const lines: string[] = [];
    const dash = (label: string, value: string) => `${label} - ${value}`;
    const when = fields.observedAt ? formatShareDateParts(fields.observedAt) : null;
    if (when) {
        lines.push(dash(labels.date, when.date));
        lines.push(dash(labels.time, when.time));
    }
    if (fields.division) lines.push(dash(labels.division, fields.division));
    if (fields.range) lines.push(dash(labels.range, fields.range));
    if (fields.beat) lines.push(dash(labels.beat, fields.beat));

    const male = fields.male ?? 0;
    const female = fields.female ?? 0;
    const calf = fields.calf ?? 0;
    const unknown = fields.unknown ?? 0;
    const total = male + female + calf + unknown;
    lines.push(dash(labels.totalElephants, String(total)));

    const counts = [
        male > 0 ? `${labels.male} - ${male}` : null,
        female > 0 ? `${labels.female} - ${female}` : null,
        calf > 0 ? `${labels.calf} - ${calf}` : null,
        unknown > 0 ? `${labels.unknown} - ${unknown}` : null,
    ].filter(Boolean);
    if (counts.length) lines.push(dash(labels.countDetails, counts.join(', ')));

    const damage = shareDamageFlags({
        details: fields.lossDetails,
        categories: fields.damageCategories,
        description: fields.damageDescription,
    });
    const yesNo = (flag: boolean) => (flag ? labels.yes : labels.no);
    lines.push(dash(labels.cropDamage, yesNo(damage.crop)));
    lines.push(dash(labels.grainDamage, yesNo(damage.grain)));
    lines.push(dash(labels.houseDamage, yesNo(damage.house)));
    lines.push(dash(labels.humanLoss, yesNo(damage.human)));

    const narrative = shareNarrative(fields.notes, fields.damageDescription);
    if (narrative) lines.push(`${labels.description}: ${narrative}`);

    if (fields.lat != null && fields.lng != null) {
        lines.push(`${labels.gps}: ${fields.lat.toFixed(6)}, ${fields.lng.toFixed(6)}`);
        if (fields.dms) lines.push(`${labels.dms}: ${fields.dms}`);
        if (fields.photoUrl) lines.push(`📷  ${fields.photoUrl}`);
        lines.push(`📍 - ${mapsLink(fields.lat, fields.lng)}`);
    } else if (fields.photoUrl) {
        lines.push(`📷  ${fields.photoUrl}`);
    }

    return lines.join('\n');
}
