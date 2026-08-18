import { describe, expect, it } from 'vitest';
import { captureDeviceDateTime } from './captureDeviceDateTime';

describe('captureDeviceDateTime', () => {
    it('formats local date and 24h time', () => {
        const now = new Date(2026, 7, 18, 9, 5, 30);
        expect(captureDeviceDateTime(now)).toEqual({ date: '2026-08-18', time: '09:05' });
    });
});
