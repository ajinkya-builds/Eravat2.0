import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Position } from '@capacitor/geolocation';
import {
    acquireDevicePosition,
    classifyGeolocationError,
    geoErrorTranslationKey,
    persistLastGpsFix,
    readLastGpsFix,
    LAST_GPS_KEY,
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
    });

    it('returns the fused/current position without watching', async () => {
        const live = pos();
        const deps = adapters({
            getCurrentPosition: vi.fn().mockResolvedValue(live),
            watchPosition: vi.fn(),
        });
        const result = await acquireDevicePosition(deps);
        expect(result.coords.latitude).toBe(live.coords.latitude);
        expect(deps.watchPosition).not.toHaveBeenCalled();
        expect(deps.ensureLocationEnabled).not.toHaveBeenCalled();
    });

    it('prompts to enable location when services are off, then retries', async () => {
        const live = pos();
        const deps = adapters({
            getCurrentPosition: vi.fn()
                .mockRejectedValueOnce({ code: 'OS-PLUG-GLOC-0007', message: 'Location services are not enabled.' })
                .mockResolvedValueOnce(live),
            ensureLocationEnabled: vi.fn().mockResolvedValue(true),
        });
        const result = await acquireDevicePosition(deps);
        expect(deps.ensureLocationEnabled).toHaveBeenCalledTimes(1);
        expect(result.coords.latitude).toBe(live.coords.latitude);
    });

    it('falls back to watchPosition after a timeout', async () => {
        const live = pos(24, 81);
        const deps = adapters({
            getCurrentPosition: vi.fn().mockRejectedValue(new Error('LOCATION_TIMEOUT')),
            watchPosition: vi.fn().mockImplementation((_opts, cb) => {
                cb(live);
                return Promise.resolve('watch-1');
            }),
        });
        const result = await acquireDevicePosition(deps);
        expect(result.coords.latitude).toBe(24);
        expect(deps.clearWatch).toHaveBeenCalledWith('watch-1');
    });

    it('uses native last known when live GPS fails', async () => {
        const native = pos(21.5, 80.1, Date.now() - 10_000);
        const deps = adapters({
            getCurrentPosition: vi.fn().mockRejectedValue(new Error('LOCATION_TIMEOUT')),
            watchPosition: vi.fn().mockImplementation((_opts, cb) => {
                cb(null, new Error('LOCATION_TIMEOUT'));
                return Promise.resolve('watch-2');
            }),
            getNativeLastKnown: vi.fn().mockResolvedValue(native),
        });
        const result = await acquireDevicePosition(deps);
        expect(result.coords.latitude).toBe(21.5);
    });
});
