import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Position } from '@capacitor/geolocation';
import {
    acquireDevicePosition,
    asAcquiredPosition,
    classifyGeolocationError,
    geoErrorTranslationKey,
    inferLocationSource,
    persistLastGpsFix,
    readLastGpsFix,
    sourceFromProvider,
    LAST_GPS_KEY,
    GPS_REFINE_MS,
    type AcquiredPosition,
    type LocationAdapters,
} from './deviceLocation';

function pos(lat = 23.18, lng = 80.98, timestamp = Date.now(), accuracy = 12): Position {
    return {
        coords: {
            latitude: lat,
            longitude: lng,
            accuracy,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
        },
        timestamp,
    };
}

function acquired(
    lat = 23.18,
    lng = 80.98,
    timestamp = Date.now(),
    accuracy = 12,
    source: AcquiredPosition['source'] = 'gps',
): AcquiredPosition {
    return { ...pos(lat, lng, timestamp, accuracy), source };
}

function adapters(overrides: Partial<LocationAdapters> = {}): LocationAdapters {
    return {
        getCurrentPosition: vi.fn(),
        watchPosition: vi.fn(),
        clearWatch: vi.fn().mockResolvedValue(undefined),
        getNativeLastKnown: vi.fn().mockResolvedValue(null),
        ensureLocationEnabled: vi.fn().mockResolvedValue(true),
        ...overrides,
    };
}

describe('classifyGeolocationError', () => {
    it('maps Capacitor location-disabled codes', () => {
        expect(classifyGeolocationError({ code: 'OS-PLUG-GLOC-0007', message: 'Location services are not enabled.' }))
            .toBe('LOCATION_DISABLED');
        expect(classifyGeolocationError({ code: 'OS-PLUG-GLOC-0010', message: 'Could not obtain location in time.' }))
            .toBe('LOCATION_TIMEOUT');
        expect(classifyGeolocationError({ code: 'OS-PLUG-GLOC-0003', message: 'denied' }))
            .toBe('LOCATION_PERMISSION_DENIED');
    });

    it('reads Error.message', () => {
        expect(classifyGeolocationError(new Error('LOCATION_TIMEOUT'))).toBe('LOCATION_TIMEOUT');
    });

    it('falls back for unknown values', () => {
        expect(classifyGeolocationError(null)).toBe('LOCATION_FAILED');
        expect(classifyGeolocationError(new Error(''))).toBe('LOCATION_FAILED');
    });
});

describe('geoErrorTranslationKey', () => {
    it('maps disabled to geo_err_disabled', () => {
        expect(geoErrorTranslationKey('LOCATION_DISABLED')).toBe('geo_err_disabled');
        expect(geoErrorTranslationKey('LOCATION_PERMISSION_DENIED')).toBe('geo_err_denied');
    });
});

describe('location source', () => {
    it('treats gps/fused providers as GPS and network as cell', () => {
        expect(sourceFromProvider('gps')).toBe('gps');
        expect(sourceFromProvider('fused')).toBe('gps');
        expect(sourceFromProvider('network')).toBe('cell');
        expect(sourceFromProvider('passive')).toBe('cell');
    });

    it('infers cell only from very coarse accuracy when provider is unknown', () => {
        expect(inferLocationSource(pos(23, 81, Date.now(), 12))).toBe('gps');
        expect(inferLocationSource(pos(23, 81, Date.now(), 180))).toBe('gps');
        expect(inferLocationSource(pos(23, 81, Date.now(), 400))).toBe('gps');
        expect(inferLocationSource(pos(23, 81, Date.now(), 650))).toBe('cell');
        expect(asAcquiredPosition(pos(23, 81, Date.now(), 12)).source).toBe('gps');
    });
});

describe('last GPS cache', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('round-trips a fresh fix', () => {
        const now = 1_700_000_000_000;
        persistLastGpsFix(pos(22.1, 79.2, now, 8));
        const cached = readLastGpsFix(60_000, now + 10_000);
        expect(cached?.coords.latitude).toBe(22.1);
        expect(cached?.coords.longitude).toBe(79.2);
        expect(localStorage.getItem(LAST_GPS_KEY)).toBeTruthy();
    });

    it('ignores stale fixes', () => {
        const now = 1_700_000_000_000;
        persistLastGpsFix(pos(22.1, 79.2, now - 10 * 60 * 60 * 1000, 8));
        expect(readLastGpsFix(60_000, now)).toBeNull();
    });
});

describe('acquireDevicePosition', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.useRealTimers();
    });

    it('accepts a good fused getCurrentPosition GPS immediately', async () => {
        const fused = pos(23.18, 80.98, Date.now(), 18);
        const deps = adapters({
            getCurrentPosition: vi.fn().mockResolvedValue(fused),
            watchPosition: vi.fn().mockImplementation(() => new Promise(() => {})),
            requestFreshFix: vi.fn().mockImplementation(() => new Promise(() => {})),
        });
        const started = Date.now();
        const result = await acquireDevicePosition(deps, {
            watchTimeoutMs: 5_000,
            getCurrentTimeoutMs: 200,
            nativeTimeoutMs: 5_000,
        });
        expect(result.source).toBe('gps');
        expect(result.coords.latitude).toBe(23.18);
        expect(Date.now() - started).toBeLessThan(500);
    });

    it('returns a live GPS watch fix even if fused getCurrent hangs', async () => {
        const live = pos();
        const deps = adapters({
            getCurrentPosition: vi.fn().mockImplementation(() => new Promise(() => {})),
            watchPosition: vi.fn().mockImplementation((_opts, cb) => {
                cb(live);
                return Promise.resolve('watch-1');
            }),
        });
        const result = await acquireDevicePosition(deps, { watchTimeoutMs: 50, nativeTimeoutMs: 50 });
        expect(result.coords.latitude).toBe(live.coords.latitude);
        expect(result.source).toBe('gps');
        expect(deps.ensureLocationEnabled).not.toHaveBeenCalled();
    });

    it('prompts to enable location when services are off, then retries', async () => {
        const live = pos();
        const deps = adapters({
            getCurrentPosition: vi.fn()
                .mockRejectedValueOnce({ code: 'OS-PLUG-GLOC-0007', message: 'Location services are not enabled.' })
                .mockImplementation(() => new Promise(() => {})),
            watchPosition: vi.fn()
                .mockImplementationOnce(() => new Promise(() => {}))
                .mockImplementation((_opts, cb) => {
                    cb(live);
                    return Promise.resolve('watch-1');
                }),
            ensureLocationEnabled: vi.fn().mockResolvedValue(true),
        });
        const result = await acquireDevicePosition(deps, { watchTimeoutMs: 100, nativeTimeoutMs: 50 });
        expect(deps.ensureLocationEnabled).toHaveBeenCalledTimes(1);
        expect(result.coords.latitude).toBe(live.coords.latitude);
        expect(result.source).toBe('gps');
    });

    it('does not stamp a last-known fix when live GPS fails', async () => {
        const native = pos(21.5, 80.1, Date.now() - 10_000);
        const deps = adapters({
            getCurrentPosition: vi.fn().mockRejectedValue(new Error('LOCATION_TIMEOUT')),
            watchPosition: vi.fn().mockImplementation((_opts, cb) => {
                cb(null, new Error('LOCATION_TIMEOUT'));
                return Promise.resolve('watch-2');
            }),
            getNativeLastKnown: vi.fn().mockResolvedValue(native),
        });
        await expect(
            acquireDevicePosition(deps, { watchTimeoutMs: 50, getCurrentTimeoutMs: 20, nativeTimeoutMs: 20 }),
        ).rejects.toThrow(/LOCATION_TIMEOUT/);
    });

    it('uses native GPS requestFreshFix when fused location hangs', async () => {
        const nativeLive = acquired(23.72, 81.01, Date.now(), 8, 'gps');
        const deps = adapters({
            getCurrentPosition: vi.fn().mockImplementation(() => new Promise(() => {})),
            watchPosition: vi.fn().mockImplementation(() => new Promise(() => {})),
            requestFreshFix: vi.fn().mockResolvedValue(nativeLive),
        });
        const result = await acquireDevicePosition(deps, {
            watchTimeoutMs: 200,
            getCurrentTimeoutMs: 200,
            nativeTimeoutMs: 200,
        });
        expect(result.coords.latitude).toBe(23.72);
        expect(result.source).toBe('gps');
        expect(deps.requestFreshFix).toHaveBeenCalledTimes(1);
    });

    it('keeps watching after an early cell fix and prefers later GPS', async () => {
        const cell = acquired(21.1, 80.1, Date.now(), 650, 'cell');
        const gps = acquired(23.72, 81.01, Date.now(), 9, 'gps');
        let watchCb: ((position: Position | null, err?: unknown) => void) | null = null;
        const deps = adapters({
            getCurrentPosition: vi.fn().mockImplementation(() => new Promise(() => {})),
            watchPosition: vi.fn().mockImplementation((_opts, cb) => {
                watchCb = cb;
                cb(cell);
                return Promise.resolve('watch-cell');
            }),
            requestFreshFix: vi.fn().mockImplementation(
                () => new Promise((resolve) => setTimeout(() => resolve(null), 80)),
            ),
        });
        const resultPromise = acquireDevicePosition(deps, {
            watchTimeoutMs: 200,
            getCurrentTimeoutMs: 200,
            nativeTimeoutMs: 50,
        });
        await new Promise((r) => setTimeout(r, 20));
        watchCb?.(gps);
        const result = await resultPromise;
        expect(result.coords.latitude).toBe(23.72);
        expect(result.source).toBe('gps');
    });

    it('waits for native GPS even if a cell fix arrives first', async () => {
        const cell = acquired(21.1, 80.1, Date.now(), 650, 'cell');
        const gps = acquired(23.72, 81.01, Date.now(), 9, 'gps');
        const deps = adapters({
            getCurrentPosition: vi.fn().mockImplementation(() => new Promise(() => {})),
            watchPosition: vi.fn().mockImplementation((_opts, cb) => {
                cb(cell);
                return Promise.resolve('watch-cell');
            }),
            requestFreshFix: vi.fn().mockImplementation(
                () => new Promise((resolve) => setTimeout(() => resolve(gps), 30)),
            ),
        });
        const result = await acquireDevicePosition(deps, {
            watchTimeoutMs: 200,
            getCurrentTimeoutMs: 200,
            nativeTimeoutMs: 50,
        });
        expect(result.coords.latitude).toBe(23.72);
        expect(result.source).toBe('gps');
    });

    it('does not offer cell while GPS is still possible within the budget', async () => {
        const cell = acquired(21.1, 80.1, Date.now(), 800, 'cell');
        const gps = acquired(23.72, 81.01, Date.now(), 9, 'gps');
        const deps = adapters({
            getCurrentPosition: vi.fn().mockImplementation(() => new Promise(() => {})),
            watchPosition: vi.fn().mockImplementation(() => new Promise(() => {})),
            requestFreshFix: vi.fn().mockImplementation(
                () => new Promise((resolve) => {
                    // Native holds cell until budget ends; GPS arrives mid-listen.
                    setTimeout(() => resolve(gps), 40);
                }),
            ),
        });
        // Simulate cell arriving via watch while native is still listening for GPS.
        const deps2 = adapters({
            getCurrentPosition: vi.fn().mockImplementation(() => new Promise(() => {})),
            watchPosition: vi.fn().mockImplementation((_opts, cb) => {
                cb(cell);
                return Promise.resolve('watch-hold-cell');
            }),
            requestFreshFix: deps.requestFreshFix,
        });
        const result = await acquireDevicePosition(deps2, {
            watchTimeoutMs: 200,
            getCurrentTimeoutMs: 200,
            nativeTimeoutMs: 80,
        });
        expect(result.source).toBe('gps');
        expect(result.coords.latitude).toBe(23.72);
        expect(deps2.requestFreshFix).toHaveBeenCalledTimes(1);
    });

    it('returns a cell fix only after the continuous GPS budget is exhausted', async () => {
        const cell = acquired(21.1, 80.1, Date.now(), 800, 'cell');
        const deps = adapters({
            getCurrentPosition: vi.fn().mockImplementation(() => new Promise(() => {})),
            watchPosition: vi.fn().mockImplementation(() => new Promise(() => {})),
            requestFreshFix: vi.fn().mockResolvedValue(cell),
        });
        const result = await acquireDevicePosition(deps, {
            watchTimeoutMs: 40,
            getCurrentTimeoutMs: 20,
            nativeTimeoutMs: 30,
        });
        expect(deps.requestFreshFix).toHaveBeenCalledTimes(1);
        expect(result.source).toBe('cell');
        expect(result.coords.latitude).toBe(21.1);
        expect(localStorage.getItem(LAST_GPS_KEY)).toBeNull();
    });

    it('can disable cell fallback entirely (boot warm-up)', async () => {
        const cell = acquired(21.1, 80.1, Date.now(), 800, 'cell');
        const deps = adapters({
            getCurrentPosition: vi.fn().mockImplementation(() => new Promise(() => {})),
            watchPosition: vi.fn().mockImplementation(() => new Promise(() => {})),
            requestFreshFix: vi.fn().mockResolvedValue(cell),
        });
        await expect(
            acquireDevicePosition(deps, {
                watchTimeoutMs: 40,
                getCurrentTimeoutMs: 20,
                nativeTimeoutMs: 15,
                allowCellFallback: false,
            }),
        ).rejects.toThrow(/LOCATION_TIMEOUT/);
    });

    it('does not treat fused getCurrentPosition cell as the GPS winner', async () => {
        const fusedCell = pos(22.2, 79.9, Date.now(), 800);
        const gps = acquired(23.72, 81.01, Date.now(), 9, 'gps');
        const deps = adapters({
            getCurrentPosition: vi.fn().mockResolvedValue(fusedCell),
            watchPosition: vi.fn().mockImplementation(() => new Promise(() => {})),
            requestFreshFix: vi.fn().mockImplementation(
                () => new Promise((resolve) => setTimeout(() => resolve(gps), 20)),
            ),
        });
        const result = await acquireDevicePosition(deps, {
            watchTimeoutMs: 200,
            getCurrentTimeoutMs: 200,
            nativeTimeoutMs: 50,
        });
        expect(result.coords.latitude).toBe(23.72);
        expect(result.source).toBe('gps');
    });

    it('accepts indoor-accuracy GPS without treating it as cell', async () => {
        const indoorGps = pos(23.7, 81.0, Date.now(), 160);
        const deps = adapters({
            getCurrentPosition: vi.fn().mockImplementation(() => new Promise(() => {})),
            watchPosition: vi.fn().mockImplementation((_opts, cb) => {
                cb(indoorGps);
                return Promise.resolve('watch-indoor');
            }),
        });
        const result = await acquireDevicePosition(deps, {
            watchTimeoutMs: GPS_REFINE_MS + 500,
            nativeTimeoutMs: 100,
        });
        expect(result.source).toBe('gps');
        expect(result.coords.accuracy).toBe(160);
    }, 10_000);

    it('briefly refines a coarse GPS fix before accepting', async () => {
        const coarse = pos(23.7, 81.0, Date.now(), 180);
        const tighter = pos(23.701, 81.002, Date.now() + 1, 35);
        let watchCb: ((position: Position | null, err?: unknown) => void) | null = null;
        const deps = adapters({
            getCurrentPosition: vi.fn().mockImplementation(() => new Promise(() => {})),
            watchPosition: vi.fn().mockImplementation((_opts, cb) => {
                watchCb = cb;
                cb(coarse);
                return Promise.resolve('watch-refine');
            }),
            requestFreshFix: vi.fn().mockImplementation(() => new Promise(() => {})),
        });
        const resultPromise = acquireDevicePosition(deps, {
            watchTimeoutMs: GPS_REFINE_MS + 200,
            nativeTimeoutMs: GPS_REFINE_MS + 200,
        });
        await new Promise((r) => setTimeout(r, 30));
        watchCb?.(tighter);
        const result = await resultPromise;
        expect(result.source).toBe('gps');
        expect(result.coords.accuracy).toBe(35);
        expect(result.coords.latitude).toBe(23.701);
    });
});
