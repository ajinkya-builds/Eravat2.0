import { useState, useCallback, useRef, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation, type Position } from '@capacitor/geolocation';
import { LocationSettings } from '../plugins/LocationSettings';
import {
    acquireDevicePosition,
    classifyGeolocationError,
    geoErrorTranslationKey,
    inferLocationSource,
    nativeFixToPosition,
    persistLastGpsFix,
    readLastGpsFix,
    sourceFromAccuracy,
    withLocationSource,
    DEFAULT_LAST_GPS_MAX_AGE_MS,
    GEOLOCATION_GPS_BUDGET_MS,
    GEOLOCATION_GPS_BUDGET_OFFLINE_MS,
    GEOLOCATION_TIMEOUT_MS,
    LOCATION_ENABLED_EVENT,
    LOCATION_SETTINGS_SETTLE_MS,
    type AcquiredPosition,
    type LocationAdapters,
} from '../lib/deviceLocation';
import { isBrowserOffline } from '../lib/offlineSession';
import {
    newGeoAcquireId,
    trackGeo,
    accuracyBucket,
    roundCoord,
    refreshGeoConnectivity,
} from '../lib/geoTelemetry';

export {
    classifyGeolocationError,
    geoErrorTranslationKey,
    GEOLOCATION_TIMEOUT_MS,
    persistLastGpsFix,
    readLastGpsFix,
};

function toNativePosition(fix: {
    latitude?: number;
    longitude?: number;
    accuracy?: number | null;
    timestamp?: number;
    provider?: string;
}): AcquiredPosition | null {
    if (typeof fix.latitude !== 'number' || typeof fix.longitude !== 'number' || typeof fix.timestamp !== 'number') {
        return null;
    }
    return withLocationSource(
        nativeFixToPosition({
            latitude: fix.latitude,
            longitude: fix.longitude,
            accuracy: fix.accuracy,
            timestamp: fix.timestamp,
        }),
        sourceFromAccuracy(fix.provider, fix.accuracy),
    );
}

function createAdapters(): LocationAdapters {
    return {
        getCurrentPosition: (options) => Geolocation.getCurrentPosition(options),
        watchPosition: (options, callback) => Geolocation.watchPosition(options, callback),
        clearWatch: (id) => Geolocation.clearWatch({ id }),
        getNativeLastKnown: () => LocationSettings.getLastKnown().then((fix) => {
            const position = toNativePosition(fix);
            return position;
        }).catch(() => null),
        requestFreshFix: async (timeoutMs, improveBelowM) => {
            const fix = await LocationSettings.requestFreshFix({ timeoutMs, improveBelowM });
            return toNativePosition(fix);
        },
        cancelFreshFix: async () => {
            await LocationSettings.cancelFreshFix();
        },
        ensureLocationEnabled: () => ensureDeviceLocationOn(),
    };
}

/**
 * Capacitor Geolocation crashes (NPE in startWatch) if watchPosition and
 * getCurrentPosition both try to raise a permission dialog at once — especially
 * the Android "approximate → precise" upgrade. Request fine location once first.
 */
async function ensureFineLocationPermission(): Promise<{
    justGranted: boolean;
    permission_fine: boolean;
    permission_coarse: boolean;
}> {
    if (!Capacitor.isNativePlatform()) {
        return { justGranted: false, permission_fine: true, permission_coarse: true };
    }
    const readStatus = async () => {
        const status = await Geolocation.checkPermissions();
        // Capacitor may expose coarseLocation on newer builds; fall back to location.
        const coarse = (status as { coarseLocation?: string }).coarseLocation ?? status.location;
        return {
            permission_fine: status.location === 'granted',
            permission_coarse: coarse === 'granted' || status.location === 'granted',
        };
    };
    try {
        const before = await readStatus();
        if (before.permission_fine) {
            return { justGranted: false, ...before };
        }
        let status = await Geolocation.requestPermissions({ permissions: ['location', 'coarseLocation'] });
        if (status.location !== 'granted') {
            throw new Error('LOCATION_PERMISSION_DENIED');
        }
        const after = await readStatus();
        return { justGranted: true, ...after };
    } catch (err) {
        const code = classifyGeolocationError(err);
        if (code === 'LOCATION_PERMISSION_DENIED') throw err instanceof Error ? err : new Error(code);
        // Older plugin builds may not accept the permissions arg — retry bare request.
        try {
            const status = await Geolocation.requestPermissions();
            if (status.location !== 'granted') {
                throw new Error('LOCATION_PERMISSION_DENIED');
            }
            return {
                justGranted: true,
                permission_fine: true,
                permission_coarse: true,
            };
        } catch (retryErr) {
            throw retryErr;
        }
    }
}

type GpsFixListener = (position: AcquiredPosition) => void;
const gpsFixListeners = new Set<GpsFixListener>();

function emitGpsFix(position: AcquiredPosition) {
    if (position.source !== 'cell') persistLastGpsFix(position);
    gpsFixListeners.forEach((listener) => listener(position));
}

let acquireInflight: Promise<AcquiredPosition> | null = null;
let ensureInflight: Promise<boolean> | null = null;

/** One system "Turn on location" / Location Accuracy dialog at a time. */
export function ensureDeviceLocationOn(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return Promise.resolve(true);
    if (!ensureInflight) {
        ensureInflight = LocationSettings.ensureEnabled()
            .then((result) => Boolean(result.enabled))
            .catch(() => false)
            .finally(() => {
                ensureInflight = null;
            });
    }
    return ensureInflight;
}

async function acquirePosition(
    promptIfDisabled: boolean,
    caller = 'hook',
): Promise<AcquiredPosition> {
    if (acquireInflight) {
        trackGeo('geo.acquire_joined_inflight', { caller, prompt_if_disabled: promptIfDisabled });
        return acquireInflight;
    }
    // Prefer Capacitor Network (Offline badge) over navigator alone — UAT showed
    // Offline (Local Save) while geo still logged online:true via navigator.onLine.
    const connectivity = await refreshGeoConnectivity();
    const offline = connectivity.offlineForGeo || isBrowserOffline();
    // Online indoor stays on the normal budget; offline gets a longer cold-GNSS window.
    const nativeBudget = offline ? GEOLOCATION_GPS_BUDGET_OFFLINE_MS : GEOLOCATION_GPS_BUDGET_MS;
    // Hard ceiling so a hung native cancel/plugin call cannot pin the report form forever.
    const hardDeadlineMs = nativeBudget + 15_000;
    const acquireId = newGeoAcquireId(caller === 'bootstrap' ? 'boot' : 'acq');
    const run = (async () => {
        if (!Capacitor.isNativePlatform()) {
            trackGeo('geo.web_path', { acquire_id: acquireId, caller });
            const pos = await requestWebPosition();
            emitGpsFix(pos);
            return pos;
        }
        // Location Accuracy / provider dialog before the permission sheet so the
        // activity can show the Play Services resolution (UAT first-grant path).
        let locationDialogLikely = false;
        if (promptIfDisabled) {
            trackGeo('geo.ensure_location_started', {
                acquire_id: acquireId,
                caller,
                phase: 'pre_permission',
                dialog_kind: 'location_accuracy',
            });
            const ensureStarted = Date.now();
            const enabled = await ensureDeviceLocationOn();
            const ensureElapsed = Date.now() - ensureStarted;
            locationDialogLikely = enabled && ensureElapsed >= 250;
            trackGeo('geo.ensure_location_result', {
                acquire_id: acquireId,
                caller,
                enabled,
                phase: 'pre_permission',
                dialog_kind: 'location_accuracy',
                dialog_likely: locationDialogLikely,
                ensure_elapsed_ms: ensureElapsed,
            });
        }
        trackGeo('geo.permission_check_started', {
            acquire_id: acquireId,
            caller,
            dialog_kind: 'permission',
        });
        let justGrantedPermission = false;
        try {
            const permission = await ensureFineLocationPermission();
            justGrantedPermission = permission.justGranted;
            trackGeo('geo.permission_check_ok', {
                acquire_id: acquireId,
                caller,
                just_granted: justGrantedPermission,
                permission_fine: permission.permission_fine,
                permission_coarse: permission.permission_coarse,
                dialog_kind: 'permission',
            });
        } catch (err) {
            trackGeo('geo.permission_check_failed', {
                acquire_id: acquireId,
                caller,
                error_code: classifyGeolocationError(err),
                dialog_kind: 'permission',
            });
            throw err;
        }
        if (justGrantedPermission || locationDialogLikely) {
            trackGeo('geo.settings_settle', {
                acquire_id: acquireId,
                caller,
                settle_ms: LOCATION_SETTINGS_SETTLE_MS,
                reason: justGrantedPermission ? 'after_permission' : 'after_location_accuracy',
                dialog_kind: justGrantedPermission ? 'permission' : 'location_accuracy',
            });
            await new Promise((resolve) => setTimeout(resolve, LOCATION_SETTINGS_SETTLE_MS));
        }
        const adapters = createAdapters();
        // ensure already handled above when promptIfDisabled — avoid a second dialog.
        // recentlyEnabled only after a real permission/accuracy dialog so everyday
        // reports keep a single full race (online indoor path unchanged).
        const acquire = acquireDevicePosition(adapters, {
            promptIfDisabled: false,
            recentlyEnabled: justGrantedPermission || locationDialogLikely,
            offline,
            onFix: emitGpsFix,
            nativeTimeoutMs: nativeBudget,
            allowCellFallback: true,
            acquireId,
            caller,
        });
        let timer: ReturnType<typeof setTimeout> | undefined;
        let hitHardDeadline = false;
        try {
            return await Promise.race([
                acquire,
                new Promise<AcquiredPosition>((_, reject) => {
                    timer = setTimeout(() => {
                        hitHardDeadline = true;
                        trackGeo('geo.hard_deadline', {
                            acquire_id: acquireId,
                            caller,
                            hard_deadline_ms: hardDeadlineMs,
                            offline,
                        });
                        reject(new Error('LOCATION_TIMEOUT'));
                    }, hardDeadlineMs);
                }),
            ]);
        } finally {
            if (timer) clearTimeout(timer);
            trackGeo('geo.cancel_invoked', {
                acquire_id: acquireId,
                caller,
                reason: hitHardDeadline ? 'hard_deadline' : 'acquire_finished',
                fire_and_forget: true,
            });
            try {
                void adapters.cancelFreshFix?.();
            } catch {
                // ignore
            }
        }
    })();
    acquireInflight = run;
    try {
        return await run;
    } finally {
        if (acquireInflight === run) acquireInflight = null;
    }
}

async function requestWebPosition(): Promise<AcquiredPosition> {
    if (!navigator.geolocation) {
        throw new Error('LOCATION_UNSUPPORTED');
    }
    const coordinates = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: GEOLOCATION_TIMEOUT_MS,
            maximumAge: 0,
        });
    });
    const position = {
        coords: {
            latitude: coordinates.coords.latitude,
            longitude: coordinates.coords.longitude,
            accuracy: coordinates.coords.accuracy,
            altitude: coordinates.coords.altitude,
            altitudeAccuracy: coordinates.coords.altitudeAccuracy,
            heading: coordinates.coords.heading,
            speed: coordinates.coords.speed,
        },
        timestamp: coordinates.timestamp,
    };
    return withLocationSource(position, inferLocationSource(position));
}

export function useGeolocation() {
    const [position, setPosition] = useState<AcquiredPosition | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const lastErrorRef = useRef<string | null>(null);

    const lastErrorCode = useCallback(() => lastErrorRef.current, []);
    const getLastKnownLocation = useCallback((maxAgeMs = DEFAULT_LAST_GPS_MAX_AGE_MS): Position | null => {
        return readLastGpsFix(maxAgeMs);
    }, []);

    const requestLocation = useCallback(async (opts?: {
        promptIfDisabled?: boolean;
        caller?: string;
    }): Promise<AcquiredPosition | null> => {
        setIsLoading(true);
        setError(null);
        lastErrorRef.current = null;
        const caller = opts?.caller ?? 'hook';
        const started = Date.now();
        try {
            const coordinates = await acquirePosition(opts?.promptIfDisabled ?? false, caller);
            setPosition(coordinates);
            if (coordinates.source !== 'cell') persistLastGpsFix(coordinates);
            trackGeo('geo.hook_succeeded', {
                caller,
                location_source: coordinates.source,
                accuracy_m: coordinates.coords.accuracy != null
                    ? Math.round(coordinates.coords.accuracy)
                    : undefined,
                accuracy_bucket: accuracyBucket(coordinates.coords.accuracy),
                lat_r4: roundCoord(coordinates.coords.latitude),
                lng_r4: roundCoord(coordinates.coords.longitude),
                elapsed_ms: Date.now() - started,
            });
            return coordinates;
        } catch (err: unknown) {
            const code = classifyGeolocationError(err);
            lastErrorRef.current = code;
            setError(code);
            trackGeo('geo.hook_failed', {
                caller,
                error_code: code,
                elapsed_ms: Date.now() - started,
            });
            return null;
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        const onFix: GpsFixListener = (next) => setPosition(next);
        gpsFixListeners.add(onFix);
        return () => {
            gpsFixListeners.delete(onFix);
        };
    }, []);

    useEffect(() => {
        const onLocationState = (event: Event) => {
            const enabled = Boolean((event as CustomEvent<{ enabled?: boolean }>).detail?.enabled);
            if (!enabled) return;
            if (position) return;
            void requestLocation({ promptIfDisabled: false });
        };
        window.addEventListener(LOCATION_ENABLED_EVENT, onLocationState);
        return () => window.removeEventListener(LOCATION_ENABLED_EVENT, onLocationState);
    }, [position, requestLocation]);

    return {
        latitude: position?.coords.latitude,
        longitude: position?.coords.longitude,
        accuracy: position?.coords.accuracy,
        locationSource: position?.source ?? null,
        error,
        lastErrorCode,
        getLastKnownLocation,
        loading: isLoading,
        isLoading,
        fetchLocation: requestLocation,
        requestLocation,
    };
}

/** Prompt to turn on device location and warm GPS as soon as the native app boots. */
export function useDeviceLocationBootstrap() {
    const startedRef = useRef(false);

    useEffect(() => {
        if (startedRef.current) return;
        startedRef.current = true;
        if (!Capacitor.isNativePlatform()) return;
        // Share the report acquire lock so bootstrap cannot cancelFreshFix mid-report
        // (first-grant race with concurrent native listens).
        void (async () => {
            const acquireId = newGeoAcquireId('boot');
            const started = Date.now();
            trackGeo('geo.bootstrap_started', { acquire_id: acquireId });
            try {
                // Activity must be resumed before the Location Accuracy dialog can show.
                await new Promise((resolve) => setTimeout(resolve, 400));
                const pos = await acquirePosition(true, 'bootstrap');
                trackGeo('geo.bootstrap_succeeded', {
                    acquire_id: acquireId,
                    location_source: pos.source,
                    accuracy_m: pos.coords.accuracy != null ? Math.round(pos.coords.accuracy) : undefined,
                    accuracy_bucket: accuracyBucket(pos.coords.accuracy),
                    lat_r4: roundCoord(pos.coords.latitude),
                    lng_r4: roundCoord(pos.coords.longitude),
                    elapsed_ms: Date.now() - started,
                });
            } catch (err) {
                trackGeo('geo.bootstrap_failed', {
                    acquire_id: acquireId,
                    error_code: classifyGeolocationError(err),
                    elapsed_ms: Date.now() - started,
                });
                // Banner in AppLayout covers the denied / still-off case.
            }
        })();
    }, []);
}
