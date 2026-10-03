import type { Position } from '@capacitor/geolocation';
import {
    accuracyBucket,
    newGeoAcquireId,
    roundCoord,
    trackGeo,
    trackGeoReading,
    type GeoPath,
} from './geoTelemetry';

export const LAST_GPS_KEY = 'eravat_last_gps_fix_v1';
export const DEFAULT_LAST_GPS_MAX_AGE_MS = 6 * 60 * 60 * 1000;
export const FRESH_FIX_MAX_AGE_MS = 45_000;
/** Fast probe for fused getCurrentPosition (outdoors often wins here). */
export const GEOLOCATION_TIMEOUT_MS = 8_000;
/**
 * One continuous GPS budget before cell is allowed.
 * Continuous listen (no restarts) so indoor GNSS lock can accumulate.
 */
export const GEOLOCATION_GPS_BUDGET_MS = 90_000;
/** @deprecated Prefer GEOLOCATION_GPS_BUDGET_MS — kept as alias for callers. */
export const GEOLOCATION_GPS_WAIT_MS = GEOLOCATION_GPS_BUDGET_MS;
/** Single continuous native listen; extra attempts only restart GNSS and hurt lock. */
export const GEOLOCATION_GPS_ATTEMPTS = 1;
export const GEOLOCATION_WATCH_TIMEOUT_MS = GEOLOCATION_GPS_BUDGET_MS;
export const GEOLOCATION_TIMEOUT_OFFLINE_MS = 12_000;
export const GEOLOCATION_CELL_ONLY_WAIT_MS = 8_000;
/**
 * When provider is unknown (fused), only treat very coarse accuracy as cell.
 * Indoor GPS often reports 100–300 m and must still count as GPS.
 */
export const CELL_ACCURACY_THRESHOLD_M = 500;
/**
 * Wi-Fi / indoor fused fixes are typically well inside this.
 * A concrete room often never gets a satellite lock; these fixes must fill
 * coordinates instead of waiting until the user reaches a door.
 * Coarser than this stays a cell-tower last resort.
 */
export const INDOOR_USABLE_ACCURACY_M = 300;
/** Accept immediately when GPS accuracy is this good or better. */
export const GPS_GOOD_ACCURACY_M = 50;
/** If first GPS is coarse, wait this long for a tighter fix before accepting. */
export const GPS_REFINE_MS = 4_000;
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
    /** Second arg, when set, waits for a fix strictly more accurate than that many metres. */
    requestFreshFix?: (timeoutMs: number, improveBelowM?: number) => Promise<AcquiredPosition | null>;
    cancelFreshFix?: () => Promise<void>;
};

export type AcquirePositionOptions = {
    promptIfDisabled?: boolean;
    offline?: boolean;
    now?: number;
    onFix?: (position: AcquiredPosition) => void;
    getCurrentTimeoutMs?: number;
    watchTimeoutMs?: number;
    nativeTimeoutMs?: number;
    /** Dedicated GPS attempts via requestFreshFix before cell is allowed. */
    gpsAttempts?: number;
    /** When false, never return cell — timeout if GPS never locks. Default true. */
    allowCellFallback?: boolean;
    /** Correlation id for PostHog (generated if omitted). */
    acquireId?: string;
    /** Call site label for PostHog (report / bootstrap / nearby / etc.). */
    caller?: string;
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

/** Network/Wi-Fi with room-level accuracy is a usable fix, not a cell-tower fallback. */
export function sourceFromAccuracy(provider?: string | null, accuracy?: number | null): LocationSource {
    const value = (provider || '').toLowerCase();
    const network = value.includes('network') || value === 'passive';
    const meters = typeof accuracy === 'number' && Number.isFinite(accuracy) ? accuracy : null;
    if (network) {
        if (meters != null && meters > 0 && meters <= INDOOR_USABLE_ACCURACY_M) return 'gps';
        return 'cell';
    }
    if (meters != null && meters > CELL_ACCURACY_THRESHOLD_M) return 'cell';
    return 'gps';
}

export function withLocationSource(position: Position, source: LocationSource): AcquiredPosition {
    return { ...position, source };
}

export function asAcquiredPosition(position: Position | AcquiredPosition): AcquiredPosition {
    const accuracy = position.coords.accuracy;
    const indoorUsable = typeof accuracy === 'number'
        && Number.isFinite(accuracy)
        && accuracy > 0
        && accuracy <= INDOOR_USABLE_ACCURACY_M;
    if ('source' in position && (position.source === 'gps' || position.source === 'cell')) {
        if (position.source === 'cell' && indoorUsable) {
            return { ...position, source: 'gps' };
        }
        return position;
    }
    return withLocationSource(position, inferLocationSource(position));
}

export function inferLocationSource(position: Position, provider?: string | null): LocationSource {
    if (provider) return sourceFromAccuracy(provider, position.coords.accuracy);
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
        // Fused is faster outdoors; we still only settle on GPS-classified fixes.
        enableLocationFallback: true,
        interval: 1000,
        minimumUpdateInterval: 500,
    };
}

function accuracyMeters(position: AcquiredPosition): number {
    const accuracy = position.coords.accuracy;
    return typeof accuracy === 'number' && Number.isFinite(accuracy)
        ? accuracy
        : Number.POSITIVE_INFINITY;
}

function preferBetterFix(
    current: AcquiredPosition | null,
    next: AcquiredPosition,
): AcquiredPosition {
    if (!current) return next;
    return accuracyMeters(next) < accuracyMeters(current) ? next : current;
}

function isGoodGps(position: AcquiredPosition): boolean {
    return position.source === 'gps' && accuracyMeters(position) <= GPS_GOOD_ACCURACY_M;
}

function isRecentFix(position: AcquiredPosition, now = Date.now()): boolean {
    if (!position.timestamp) return true;
    return now - position.timestamp <= 2 * 60 * 1000;
}

/**
 * Watch for a GPS fix. Cell/network updates are reported via onCell and never
 * settle the watch. Coarse GPS is reported via onGps so the race can refine briefly.
 */
function startWatchFix(
    adapters: LocationAdapters,
    timeoutMs: number,
    onGps: (position: AcquiredPosition) => void,
    onCell?: (position: AcquiredPosition) => void,
): { promise: Promise<AcquiredPosition>; cancel: () => void } {
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

    const promise = new Promise<AcquiredPosition>((resolve, reject) => {
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
                const acquired = withLocationSource(position, inferLocationSource(position));
                if (acquired.source === 'gps') {
                    onGps(acquired);
                    // Watch promise resolves when race accepts GPS (or times out).
                    // Good fixes are finished by the race; keep watching while refining.
                    if (isGoodGps(acquired)) {
                        settled = true;
                        if (timer) clearTimeout(timer);
                        if (watchId) void adapters.clearWatch(watchId);
                        resolve(acquired);
                    }
                    return;
                }
                onCell?.(acquired);
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

async function runNativeGpsListen(
    adapters: LocationAdapters,
    opts: {
        budgetMs: number;
        isSettled: () => boolean;
        onGps: (position: AcquiredPosition) => void;
        onCell: (position: AcquiredPosition) => void;
    },
): Promise<void> {
    if (!adapters.requestFreshFix) return;
    if (opts.isSettled()) return;
    try {
        // One continuous listen — restarting clears GNSS lock progress indoors.
        const position = await adapters.requestFreshFix(opts.budgetMs);
        if (opts.isSettled()) return;
        if (!position) return;
        const acquired = asAcquiredPosition(position);
        if (acquired.source === 'gps') {
            opts.onGps(acquired);
            return;
        }
        opts.onCell(acquired);
    } catch {
        // Watch / other paths may still succeed.
    }
}

async function raceLivePosition(
    adapters: LocationAdapters,
    opts: {
        getCurrentTimeoutMs: number;
        watchTimeoutMs: number;
        nativeTimeoutMs: number;
        allowCellFallback: boolean;
        acquireId: string;
        offline: boolean;
        caller: string;
    },
): Promise<AcquiredPosition> {
    return new Promise<AcquiredPosition>((resolve, reject) => {
        let settled = false;
        let cellFallback: AcquiredPosition | null = null;
        let bestGps: AcquiredPosition | null = null;
        let refineTimer: ReturnType<typeof setTimeout> | undefined;
        let watchCancel: (() => void) | null = null;
        let readingN = 0;
        const raceStarted = Date.now();
        const logReading = (
            path: GeoPath,
            position: AcquiredPosition,
            extra?: { accepted?: boolean; reason?: string },
        ) => {
            readingN += 1;
            const acc = position.coords.accuracy;
            trackGeoReading({
                acquire_id: opts.acquireId,
                path,
                source: position.source,
                accuracy_m: typeof acc === 'number' ? acc : null,
                lat: position.coords.latitude,
                lng: position.coords.longitude,
                age_ms: position.timestamp ? Date.now() - position.timestamp : null,
                accepted: extra?.accepted,
                reason: extra?.reason,
                offline: opts.offline,
                reading_n: readingN,
            });
        };
        trackGeo('geo.race_started', {
            acquire_id: opts.acquireId,
            caller: opts.caller,
            offline: opts.offline,
            get_current_timeout_ms: opts.getCurrentTimeoutMs,
            watch_timeout_ms: opts.watchTimeoutMs,
            native_timeout_ms: opts.nativeTimeoutMs,
            allow_cell_fallback: opts.allowCellFallback,
        });

        const clearRefine = () => {
            if (refineTimer) {
                clearTimeout(refineTimer);
                refineTimer = undefined;
            }
        };

        const stopListeners = (reason: string) => {
            watchCancel?.();
            // Never await cancel — OnePlus/OxygenOS has hung the Capacitor bridge
            // on cancelFreshFix, which previously blocked delivering a good fix.
            trackGeo('geo.cancel_invoked', {
                acquire_id: opts.acquireId,
                reason,
                fire_and_forget: true,
                elapsed_ms: Date.now() - raceStarted,
            });
            try {
                void adapters.cancelFreshFix?.();
            } catch {
                // ignore
            }
        };

        const finishGps = (position: AcquiredPosition, reason: string, path: GeoPath = 'unknown') => {
            if (settled) return;
            settled = true;
            clearRefine();
            const acc = accuracyMeters(position);
            trackGeo('geo.accepted', {
                acquire_id: opts.acquireId,
                caller: opts.caller,
                reason,
                path,
                location_source: position.source,
                accuracy_m: Number.isFinite(acc) ? Math.round(acc) : undefined,
                accuracy_bucket: accuracyBucket(acc),
                lat_r4: roundCoord(position.coords.latitude),
                lng_r4: roundCoord(position.coords.longitude),
                offline: opts.offline,
                elapsed_ms: Date.now() - raceStarted,
                reading_n: readingN,
            });
            stopListeners(`accepted:${reason}`);
            resolve(position);
        };

        const considerGps = (position: AcquiredPosition, alreadyRefined = false, path: GeoPath = 'unknown') => {
            if (settled || position.source !== 'gps' || !isRecentFix(position)) {
                if (!settled && position.source === 'gps' && !isRecentFix(position)) {
                    trackGeo('geo.stale_reading_ignored', {
                        acquire_id: opts.acquireId,
                        path,
                        age_ms: position.timestamp ? Date.now() - position.timestamp : undefined,
                    });
                }
                return;
            }
            logReading(path, position);
            bestGps = preferBetterFix(bestGps, position);
            if (!bestGps) return;
            const indoorReady = accuracyMeters(bestGps) <= INDOOR_USABLE_ACCURACY_M;
            // Native listen already held the best indoor fix across its refine window.
            if (isGoodGps(bestGps)) {
                finishGps(bestGps, 'good_gps', path);
                return;
            }
            if (alreadyRefined && indoorReady) {
                finishGps(bestGps, 'indoor_live_refined', path);
                return;
            }
            // Coarse GPS (typical indoors early on): brief refine, then accept best GPS.
            if (!refineTimer) {
                trackGeo('geo.refine_started', {
                    acquire_id: opts.acquireId,
                    path,
                    accuracy_m: Math.round(accuracyMeters(bestGps)),
                    refine_ms: GPS_REFINE_MS,
                });
                refineTimer = setTimeout(() => {
                    if (!settled && bestGps) finishGps(bestGps, 'refine_timeout', path);
                }, GPS_REFINE_MS);
            }
        };

        const holdCell = (position: AcquiredPosition, path: GeoPath = 'unknown') => {
            if (settled || !isRecentFix(position)) return;
            logReading(path, position);
            cellFallback = preferBetterFix(cellFallback, position);
            trackGeo('geo.cell_held', {
                acquire_id: opts.acquireId,
                path,
                accuracy_m: Math.round(accuracyMeters(position)),
                accuracy_bucket: accuracyBucket(accuracyMeters(position)),
            });
        };

        const failHard = (err: unknown, path: GeoPath = 'unknown') => {
            if (settled) return;
            const code = classifyGeolocationError(err);
            trackGeo('geo.path_error', {
                acquire_id: opts.acquireId,
                path,
                error_code: code,
                elapsed_ms: Date.now() - raceStarted,
            });
            if (code === 'LOCATION_PERMISSION_DENIED' || code === 'LOCATION_DISABLED') {
                settled = true;
                clearRefine();
                trackGeo('geo.failed', {
                    acquire_id: opts.acquireId,
                    caller: opts.caller,
                    error_code: code,
                    offline: opts.offline,
                    elapsed_ms: Date.now() - raceStarted,
                });
                stopListeners(`fail:${code}`);
                reject(err);
            }
        };

        trackGeo('geo.path_started', { acquire_id: opts.acquireId, path: 'watch' });
        const watch = startWatchFix(
            adapters,
            opts.watchTimeoutMs,
            (p) => considerGps(p, false, 'watch'),
            (p) => holdCell(p, 'watch'),
        );
        watchCancel = watch.cancel;

        const acceptReading = (position: Position) => {
            if (settled) return;
            const acquired = asAcquiredPosition(
                withLocationSource(position, inferLocationSource(position)),
            );
            if (acquired.source === 'gps') {
                considerGps(acquired, false, 'get_current');
                return;
            }
            holdCell(acquired, 'get_current');
        };

        // One Capacitor getCurrent only — dual concurrent getCurrent+watch hangs on
        // some OxygenOS/OnePlus builds. Native requestFreshFix covers indoor Wi-Fi.
        trackGeo('geo.path_started', { acquire_id: opts.acquireId, path: 'get_current' });
        void adapters.getCurrentPosition(liveOptions(opts.getCurrentTimeoutMs, 0, true))
            .then(acceptReading)
            .catch((err) => failHard(err, 'get_current'));

        trackGeo('geo.path_started', { acquire_id: opts.acquireId, path: 'native' });
        const nativeListen = runNativeGpsListen(adapters, {
            budgetMs: opts.nativeTimeoutMs,
            isSettled: () => settled,
            onGps: (position) => considerGps(position, true, 'native'),
            onCell: (position) => holdCell(position, 'native'),
        });

        const pending: Array<Promise<unknown>> = [
            watch.promise
                .then((position) => considerGps(position, false, 'watch'))
                .catch((err) => failHard(err, 'watch')),
            nativeListen,
        ];

        void Promise.allSettled(pending).then(() => {
            if (settled) return;
            clearRefine();
            // Prefer any GPS we held during refine over cell.
            if (bestGps) {
                finishGps(bestGps, 'budget_best_gps', 'unknown');
                return;
            }
            // Absolute last resort: only after the full continuous GPS budget.
            if (opts.allowCellFallback && cellFallback) {
                settled = true;
                trackGeo('geo.accepted', {
                    acquire_id: opts.acquireId,
                    caller: opts.caller,
                    reason: 'cell_fallback_after_budget',
                    path: 'unknown',
                    location_source: 'cell',
                    accuracy_m: Math.round(accuracyMeters(cellFallback)),
                    accuracy_bucket: accuracyBucket(accuracyMeters(cellFallback)),
                    lat_r4: roundCoord(cellFallback.coords.latitude),
                    lng_r4: roundCoord(cellFallback.coords.longitude),
                    offline: opts.offline,
                    elapsed_ms: Date.now() - raceStarted,
                });
                stopListeners('accepted:cell_fallback');
                resolve(cellFallback);
                return;
            }
            trackGeo('geo.failed', {
                acquire_id: opts.acquireId,
                caller: opts.caller,
                error_code: 'LOCATION_TIMEOUT',
                offline: opts.offline,
                elapsed_ms: Date.now() - raceStarted,
                reading_n: readingN,
                had_best_gps: false,
                had_cell: Boolean(cellFallback),
            });
            stopListeners('timeout');
            reject(new Error('LOCATION_TIMEOUT'));
        });
    });
}

/**
 * After an indoor/coarse fix is shown, keep listening so a doorway GPS lock
 * can replace it. The first result must not be the last one.
 */
function scheduleGpsUpgrade(
    adapters: LocationAdapters,
    current: AcquiredPosition,
    emit: (position: AcquiredPosition) => void,
    budgetMs: number,
    acquireId: string,
): void {
    if (!adapters.requestFreshFix) return;
    if (current.source !== 'gps') return;
    if (accuracyMeters(current) <= GPS_GOOD_ACCURACY_M) return;
    const below = accuracyMeters(current);
    trackGeo('geo.upgrade_started', {
        acquire_id: acquireId,
        improve_below_m: Math.round(below),
        budget_ms: budgetMs,
    });
    void (async () => {
        try {
            const next = await adapters.requestFreshFix!(budgetMs, below);
            if (!next) {
                trackGeo('geo.upgrade_noop', { acquire_id: acquireId, reason: 'empty' });
                return;
            }
            const acquired = asAcquiredPosition(next);
            if (acquired.source !== 'gps' || !isRecentFix(acquired)) {
                trackGeo('geo.upgrade_noop', { acquire_id: acquireId, reason: 'not_fresh_gps' });
                return;
            }
            if (accuracyMeters(acquired) < below) {
                trackGeo('geo.upgrade_succeeded', {
                    acquire_id: acquireId,
                    accuracy_m: Math.round(accuracyMeters(acquired)),
                    previous_accuracy_m: Math.round(below),
                    lat_r4: roundCoord(acquired.coords.latitude),
                    lng_r4: roundCoord(acquired.coords.longitude),
                });
                emit(acquired);
                return;
            }
            trackGeo('geo.upgrade_noop', { acquire_id: acquireId, reason: 'not_tighter' });
        } catch (err) {
            trackGeo('geo.upgrade_noop', {
                acquire_id: acquireId,
                reason: 'error',
                error_code: classifyGeolocationError(err),
            });
        }
    })();
}

export async function acquireDevicePosition(
    adapters: LocationAdapters,
    opts?: AcquirePositionOptions,
): Promise<AcquiredPosition> {
    const offline = opts?.offline ?? false;
    const promptIfDisabled = opts?.promptIfDisabled ?? false;
    const acquireId = opts?.acquireId ?? newGeoAcquireId();
    const caller = opts?.caller ?? 'unknown';
    // Never fill reports from last-known — that can be outdoors / another beat.
    // Always wait for a live fix (Wi-Fi/network indoor or GNSS outdoors).
    const getCurrentTimeoutMs = opts?.getCurrentTimeoutMs
        ?? (offline ? 6_000 : GEOLOCATION_TIMEOUT_MS);
    const nativeTimeoutMs = opts?.nativeTimeoutMs ?? GEOLOCATION_GPS_BUDGET_MS;
    const watchTimeoutMs = opts?.watchTimeoutMs ?? Math.max(GEOLOCATION_WATCH_TIMEOUT_MS, nativeTimeoutMs);
    const allowCellFallback = opts?.allowCellFallback ?? true;
    const started = Date.now();

    const emit = (position: AcquiredPosition) => {
        if (position.source !== 'cell') persistLastGpsFix(position);
        opts?.onFix?.(position);
    };

    trackGeo('geo.acquire_started', {
        acquire_id: acquireId,
        caller,
        offline,
        prompt_if_disabled: promptIfDisabled,
        get_current_timeout_ms: getCurrentTimeoutMs,
        watch_timeout_ms: watchTimeoutMs,
        native_timeout_ms: nativeTimeoutMs,
        allow_cell_fallback: allowCellFallback,
    });

    if (promptIfDisabled) {
        trackGeo('geo.ensure_location_started', { acquire_id: acquireId, caller });
        const enabled = await adapters.ensureLocationEnabled();
        trackGeo('geo.ensure_location_result', {
            acquire_id: acquireId,
            caller,
            enabled,
            elapsed_ms: Date.now() - started,
        });
    }

    const raceOnce = () => raceLivePosition(adapters, {
        getCurrentTimeoutMs,
        watchTimeoutMs,
        nativeTimeoutMs,
        allowCellFallback,
        acquireId,
        offline,
        caller,
    });

    try {
        const live = await raceOnce();
        emit(live);
        scheduleGpsUpgrade(adapters, live, emit, nativeTimeoutMs, acquireId);
        trackGeo('geo.acquire_succeeded', {
            acquire_id: acquireId,
            caller,
            location_source: live.source,
            accuracy_m: Math.round(accuracyMeters(live)),
            accuracy_bucket: accuracyBucket(accuracyMeters(live)),
            lat_r4: roundCoord(live.coords.latitude),
            lng_r4: roundCoord(live.coords.longitude),
            offline,
            elapsed_ms: Date.now() - started,
        });
        return live;
    } catch (err) {
        const code = classifyGeolocationError(err);
        if (isLocationOffError(code) && !promptIfDisabled) {
            trackGeo('geo.ensure_location_started', {
                acquire_id: acquireId,
                caller,
                reason: 'location_off_retry',
            });
            const enabled = await adapters.ensureLocationEnabled();
            trackGeo('geo.ensure_location_result', {
                acquire_id: acquireId,
                caller,
                enabled,
                reason: 'location_off_retry',
            });
            if (enabled) {
                const live = await raceOnce();
                emit(live);
                scheduleGpsUpgrade(adapters, live, emit, nativeTimeoutMs, acquireId);
                trackGeo('geo.acquire_succeeded', {
                    acquire_id: acquireId,
                    caller,
                    location_source: live.source,
                    accuracy_m: Math.round(accuracyMeters(live)),
                    accuracy_bucket: accuracyBucket(accuracyMeters(live)),
                    lat_r4: roundCoord(live.coords.latitude),
                    lng_r4: roundCoord(live.coords.longitude),
                    offline,
                    elapsed_ms: Date.now() - started,
                    after_location_on_retry: true,
                });
                return live;
            }
        }
        trackGeo('geo.acquire_failed', {
            acquire_id: acquireId,
            caller,
            error_code: code,
            offline,
            elapsed_ms: Date.now() - started,
        });
        throw err;
    }
}
