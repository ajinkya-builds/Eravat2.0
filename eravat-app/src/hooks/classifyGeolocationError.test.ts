import { describe, expect, it } from 'vitest';
import { classifyGeolocationError } from './useGeolocation';

describe('classifyGeolocationError', () => {
    it('reads Error.message', () => {
        expect(classifyGeolocationError(new Error('LOCATION_TIMEOUT'))).toBe('LOCATION_TIMEOUT');
    });

    it('falls back for unknown values', () => {
        expect(classifyGeolocationError(null)).toBe('LOCATION_FAILED');
        expect(classifyGeolocationError(new Error(''))).toBe('LOCATION_FAILED');
    });
});
