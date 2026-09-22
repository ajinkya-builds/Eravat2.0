import type { Position } from '@capacitor/geolocation';

export const LAST_GPS_KEY = 'eravat_last_gps_fix_v1';
export const DEFAULT_LAST_GPS_MAX_AGE_MS = 6 * 60 * 60 * 1000;
export const FRESH_FIX_MAX_AGE_MS = 45_000;
export const GEOLOCATION_TIMEOUT_MS = 12_000;
export const GEOLOCATION_WATCH_TIMEOUT_MS = 30_000;
export const GEOLOCATION_TIMEOUT_OFFLINE_MS = 18_000;
export const GEOLOCATION_GPS_WAIT_MS = 30_000;
export const GEOLOCATION_CELL_ONLY_WAIT_MS = 8_000;
export const CELL_ACCURACY_THRESHOLD_M = 80;
export const LOCATION_ENABLED_EVENT = 'eravat-location-state';

export type LocationSource = 'gps' | 'cell';
export type AcquiredPosition = Position & { source: LocationSource };

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
    requestFreshFix?: (timeoutMs: number) => Promise<AcquiredPosition | null>;
};

export type AcquirePositionOptions = {
    promptIfDisabled?: boolean;
    offline?: boolean;
    now?: number;
    onFix?: (position: AcquiredPosition) => void;
    getCurrentTimeoutMs?: number;
    watchTimeoutMs?: number;
    nativeTimeoutMs?: number;
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

export function sourceFromProvider(provider?: string | null): LocationSource {
    const value = (provider || '').toLowerCase();
    if (value.includes('network') || value === 'passive') return 'cell';
    return 'gps';
}

export function withLocationSource(position: Position, source: LocationSource): AcquiredPosition {
    return { ...position, source };
}

export function asAcquiredPosition(position: Position | AcquiredPosition): AcquiredPosition {
    if ('source' in position && (position.source === 'gps' || position.source === 'cell')) {
        return position;
    }
    return withLocationSource(position, inferLocationSource(position));
}

export function inferLocationSource(position: Position, provider?: string | null): LocationSource {
    if (provider) return sourceFromProvider(provider);
    const accuracy = position.coords.accuracy;
    if (typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy > CELL_ACCURACY_THRESHOLD_M) {
        return 'cell';
    }
    return 'gps';
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

function liveOptions(timeoutMs: number, maximumAgeMs: number, highAccuracy = true): PositionOptionsLike {
    return {
        enableHighAccuracy: highAccuracy,
        timeout: timeoutMs,
        maximumAge: maximumAgeMs,
        enableLocationFallback: true,
        interval: 1000,
        minimumUpdateInterval: 500,
    };
}

function startWatchFix(
    adapters: LocationAdapters,
    timeoutMs: number,
): { promise: Promise<Position>; cancel: () => void } {
    let watchId: string | null = null;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let rejectPromise: ((err: Error) => void) | undefined;

    const cancel = () => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        if (watchId) void adapters.clearWatch(watchId);
        rejectPromise?.(new Error('LOCATION_CANCELLED'));
    };

    const promise = new Promise<Position>((resolve, reject) => {
        rejectPromise = reject;
        timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            if (watchId) void adapters.clearWatch(watchId);
            reject(new Error('LOCATION_TIMEOUT'));
        }, timeoutMs);

        void adapters.watchPosition(liveOptions(timeoutMs, 0), (position, err) => {
            if (settled) return;
            if (position) {
                settled = true;
                if (timer) clearTimeout(timer);
                if (watchId) void adapters.clearWatch(watchId);
                resolve(position);
                return;
            }
            if (err) {
                const code = classifyGeolocationError(err);
                if (code === 'LOCATION_PERMISSION_DENIED' || code === 'LOCATION_DISABLED') {
                    settled = true;
                    if (timer) clearTimeout(timer);
                    if (watchId) void adapters.clearWatch(watchId);
                    reject(err instanceof Error ? err : new Error(code));
                }
            }
        }).then((id) => {
            watchId = id;
            if (settled && id) void adapters.clearWatch(id);
        }).catch((err) => {
            if (settled) return;
            settled = true;
            if (timer) clearTimeout(timer);
            reject(err);
        });
    });

    return { promise, cancel };
}

async function raceLivePosition(
    adapters: LocationAdapters,
    opts: { getCurrentTimeoutMs: number; watchTimeoutMs: number; nativeTimeoutMs: number },
): Promise<AcquiredPosition> {
    const watch = startWatchFix(adapters, opts.watchTimeoutMs);

    return new Promise<AcquiredPosition>((resolve, reject) => {
        let settled = false;
        let cellFallback: AcquiredPosition | null = null;

        const finishGps = (position: AcquiredPosition) => {
            if (settled) return;
            settled = true;
            watch.cancel();
            resolve(position);
        };

        const holdOrFinish = (position: Position | AcquiredPosition) => {
            if (settled) return;
            const acquired = asAcquiredPosition(position);
            if (acquired.source === 'gps') {
                finishGps(acquired);
                return;
            }
            cellFallback = acquired;
        };

        const failHard = (err: unknown) => {
            if (settled) return;
            const code = classifyGeolocationError(err);
            if (code === 'LOCATION_PERMISSION_DENIED' || code === 'LOCATION_DISABLED') {
                settled = true;
                watch.cancel();
                reject(err);
            }
        };

        const pending: Array<Promise<unknown>> = [
            watch.promise
                .then((position) => holdOrFinish(withLocationSource(position, inferLocationSource(position))))
                .catch(failHard),
        ];
        // Fused getCurrentPosition can return a cached or cell fix. Use it only
        // to detect location-off / permission errors, never as the GPS winner.
        void adapters.getCurrentPosition(liveOptions(opts.getCurrentTimeoutMs, 0))
            .then(() => undefined)
            .catch(failHard);
        if (adapters.requestFreshFix) {
            pending.push(
                adapters.requestFreshFix(opts.nativeTimeoutMs)
                    .then((position) => {
                        if (!position) return;
                        const acquired = asAcquiredPosition(position);
                        if (acquired.source === 'gps') {
                            holdOrFinish(acquired);
                            return;
                        }
                        // Native already waited for GPS. Cell is the worst-case result.
                        cellFallback = acquired;
                        if (settled) return;
                        settled = true;
                        watch.cancel();
                        resolve(acquired);
                    })
                    .catch(() => undefined),
            );
        }

        void Promise.allSettled(pending).then(() => {
            if (settled) return;
            if (cellFallback) {
                settled = true;
                watch.cancel();
                resolve(cellFallback);
                return;
            }
            reject(new Error('LOCATION_TIMEOUT'));
        });
    });
}

export async function acquireDevicePosition(
    adapters: LocationAdapters,
    opts?: AcquirePositionOptions,
): Promise<AcquiredPosition> {
    const offline = opts?.offline ?? false;
    const promptIfDisabled = opts?.promptIfDisabled ?? false;
    const getCurrentTimeoutMs = opts?.getCurrentTimeoutMs
        ?? (offline ? 8_000 : GEOLOCATION_TIMEOUT_MS);
    const watchTimeoutMs = opts?.watchTimeoutMs ?? GEOLOCATION_WATCH_TIMEOUT_MS;
    const nativeTimeoutMs = opts?.nativeTimeoutMs ?? GEOLOCATION_GPS_WAIT_MS;

    const emit = (position: AcquiredPosition) => {
        if (position.source !== 'cell') persistLastGpsFix(position);
        opts?.onFix?.(position);
    };

    if (promptIfDisabled) {
        await adapters.ensureLocationEnabled();
    }

    try {
        const live = await raceLivePosition(adapters, {
            getCurrentTimeoutMs,
            watchTimeoutMs,
            nativeTimeoutMs,
        });
        emit(live);
        return live;
    } catch (err) {
        const code = classifyGeolocationError(err);
        if (isLocationOffError(code) && !promptIfDisabled) {
            const enabled = await adapters.ensureLocationEnabled();
            if (enabled) {
                const live = await raceLivePosition(adapters, {
                    getCurrentTimeoutMs,
                    watchTimeoutMs,
                    nativeTimeoutMs,
                });
                emit(live);
                return live;
            }
        }
        throw err;
    }
}
