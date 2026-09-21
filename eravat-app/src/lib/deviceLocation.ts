import type { Position } from '@capacitor/geolocation';

export const LAST_GPS_KEY = 'eravat_last_gps_fix_v1';
export const DEFAULT_LAST_GPS_MAX_AGE_MS = 6 * 60 * 60 * 1000;
export const FRESH_FIX_MAX_AGE_MS = 45_000;
export const GEOLOCATION_TIMEOUT_MS = 12_000;
export const GEOLOCATION_WATCH_TIMEOUT_MS = 20_000;
export const GEOLOCATION_TIMEOUT_OFFLINE_MS = 18_000;
export const LOCATION_ENABLED_EVENT = 'eravat-location-state';

export type LastGpsFix = {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    timestamp: number;
};

export type PositionOptionsLike = {
    enableHighAccuracy?: boolean;
    timeout?: number;
    maximumAge?: number;
    enableLocationFallback?: boolean;
    interval?: number;
    minimumUpdateInterval?: number;
};

export type LocationAdapters = {
    getCurrentPosition: (options: PositionOptionsLike) => Promise<Position>;
    watchPosition: (
        options: PositionOptionsLike,
        callback: (position: Position | null, err?: unknown) => void,
    ) => Promise<string>;
    clearWatch: (id: string) => Promise<void>;
    getNativeLastKnown: () => Promise<Position | null>;
    ensureLocationEnabled: () => Promise<boolean>;
};

export function persistLastGpsFix(position: Position): void {
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

export function readLastGpsFix(maxAgeMs = DEFAULT_LAST_GPS_MAX_AGE_MS, now = Date.now()): Position | null {
    try {
        const raw = localStorage.getItem(LAST_GPS_KEY);
        if (!raw) return null;
        const cached = JSON.parse(raw) as LastGpsFix;
        if (!cached || typeof cached.timestamp !== 'number') return null;
        if (now - cached.timestamp > maxAgeMs) return null;
        return nativeFixToPosition(cached);
    } catch {
        return null;
    }
}

export function nativeFixToPosition(fix: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
    timestamp: number;
}): Position {
    return {
        coords: {
            latitude: fix.latitude,
            longitude: fix.longitude,
            accuracy: fix.accuracy ?? 0,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
        },
        timestamp: fix.timestamp,
    };
}

export function isFixFresh(position: Position | null, maxAgeMs: number, now = Date.now()): boolean {
    if (!position) return false;
    return now - position.timestamp <= maxAgeMs;
}

function capacitorErrorCode(err: unknown): string | undefined {
    if (!err || typeof err !== 'object') return undefined;
    const code = (err as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
}

function capacitorErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message || '';
    if (err && typeof err === 'object' && 'message' in err) {
        const message = (err as { message?: unknown }).message;
        return typeof message === 'string' ? message : '';
    }
    return '';
}

const CAPACITOR_GEO_CODE_MAP: Record<string, string> = {
    'OS-PLUG-GLOC-0002': 'LOCATION_UNAVAILABLE',
    'OS-PLUG-GLOC-0003': 'LOCATION_PERMISSION_DENIED',
    'OS-PLUG-GLOC-0007': 'LOCATION_DISABLED',
    'OS-PLUG-GLOC-0009': 'LOCATION_DISABLED',
    'OS-PLUG-GLOC-0010': 'LOCATION_TIMEOUT',
    'OS-PLUG-GLOC-0014': 'LOCATION_DISABLED',
    'OS-PLUG-GLOC-0016': 'LOCATION_DISABLED',
    'OS-PLUG-GLOC-0017': 'LOCATION_DISABLED',
};

export function classifyGeolocationError(err: unknown): string {
    const pluginCode = capacitorErrorCode(err);
    if (pluginCode && CAPACITOR_GEO_CODE_MAP[pluginCode]) {
        return CAPACITOR_GEO_CODE_MAP[pluginCode];
    }

    if (typeof GeolocationPositionError !== 'undefined' && err instanceof GeolocationPositionError) {
        const messages: Record<number, string> = {
            [GeolocationPositionError.PERMISSION_DENIED]: 'LOCATION_PERMISSION_DENIED',
            [GeolocationPositionError.POSITION_UNAVAILABLE]: 'LOCATION_UNAVAILABLE',
            [GeolocationPositionError.TIMEOUT]: 'LOCATION_TIMEOUT',
        };
        return messages[err.code] ?? 'LOCATION_FAILED';
    }

    const message = capacitorErrorMessage(err).toLowerCase();
    if (message.includes('location services are not enabled') || message.includes('location services are disabled')) {
        return 'LOCATION_DISABLED';
    }
    if (message.includes('permission')) return 'LOCATION_PERMISSION_DENIED';
    if (message.includes('timeout')) return 'LOCATION_TIMEOUT';
    if (message.includes('unavailable')) return 'LOCATION_UNAVAILABLE';
    if (err instanceof Error) return err.message || 'LOCATION_FAILED';
    return 'LOCATION_FAILED';
}

export function isLocationOffError(code: string | null | undefined): boolean {
    return code === 'LOCATION_DISABLED';
}

export function geoErrorTranslationKey(code: string | null | undefined): string {
    switch (code) {
        case 'LOCATION_PERMISSION_DENIED':
            return 'geo_err_denied';
        case 'LOCATION_DISABLED':
            return 'geo_err_disabled';
        case 'LOCATION_UNAVAILABLE':
            return 'geo_err_unavailable';
        case 'LOCATION_TIMEOUT':
            return 'geo_err_timeout';
        case 'LOCATION_UNSUPPORTED':
            return 'geo_err_unsupported';
        default:
            return 'geo_err_failed';
    }
}

function liveOptions(timeoutMs: number, maximumAgeMs: number): PositionOptionsLike {
    return {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: maximumAgeMs,
        enableLocationFallback: true,
        interval: 2000,
        minimumUpdateInterval: 1000,
    };
}

async function waitForWatchFix(
    adapters: LocationAdapters,
    timeoutMs: number,
): Promise<Position> {
    let watchId: string | null = null;
    let settled = false;
    return new Promise<Position>((resolve, reject) => {
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            if (watchId) void adapters.clearWatch(watchId);
            reject(new Error('LOCATION_TIMEOUT'));
        }, timeoutMs);

        void adapters.watchPosition(liveOptions(timeoutMs, 0), (position, err) => {
            if (settled) return;
            if (position) {
                settled = true;
                clearTimeout(timer);
                if (watchId) void adapters.clearWatch(watchId);
                resolve(position);
                return;
            }
            if (err) {
                settled = true;
                clearTimeout(timer);
                if (watchId) void adapters.clearWatch(watchId);
                reject(err);
            }
        }).then((id) => {
            watchId = id;
            if (settled && id) void adapters.clearWatch(id);
        }).catch((err) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            reject(err);
        });
    });
}

async function getLivePosition(adapters: LocationAdapters, offline: boolean): Promise<Position> {
    const timeoutMs = offline ? GEOLOCATION_TIMEOUT_OFFLINE_MS : GEOLOCATION_TIMEOUT_MS;
    try {
        return await adapters.getCurrentPosition(liveOptions(timeoutMs, FRESH_FIX_MAX_AGE_MS));
    } catch (err) {
        const code = classifyGeolocationError(err);
        if (code === 'LOCATION_PERMISSION_DENIED' || code === 'LOCATION_DISABLED') {
            throw err;
        }
        return waitForWatchFix(adapters, GEOLOCATION_WATCH_TIMEOUT_MS);
    }
}

export async function acquireDevicePosition(
    adapters: LocationAdapters,
    opts?: { promptIfDisabled?: boolean; offline?: boolean; now?: number },
): Promise<Position> {
    const now = opts?.now ?? Date.now();
    const offline = opts?.offline ?? false;
    const promptIfDisabled = opts?.promptIfDisabled ?? false;

    if (promptIfDisabled) {
        await adapters.ensureLocationEnabled();
    }

    try {
        const live = await getLivePosition(adapters, offline);
        persistLastGpsFix(live);
        return live;
    } catch (err) {
        const code = classifyGeolocationError(err);
        if (isLocationOffError(code) && !promptIfDisabled) {
            const enabled = await adapters.ensureLocationEnabled();
            if (enabled) {
                const live = await getLivePosition(adapters, offline);
                persistLastGpsFix(live);
                return live;
            }
        }

        const native = await adapters.getNativeLastKnown();
        if (native && isFixFresh(native, DEFAULT_LAST_GPS_MAX_AGE_MS, now)) {
            persistLastGpsFix(native);
            return native;
        }

        const cached = readLastGpsFix(DEFAULT_LAST_GPS_MAX_AGE_MS, now);
        if (cached) return cached;

        throw err;
    }
}
