import { describe, expect, it } from 'vitest';
import {
    callLogsToCsv,
    formatCallCoordinate,
    summarizeCallLogs,
    type VillagerCallRow,
} from './AdminReportCallsModal';

function row(status: string, name = 'A'): VillagerCallRow {
    return {
        id: name,
        villager_id: name,
        villager_name: name,
        village_name: 'Bedra',
        phone_e164: '+919999999999',
        distance_m: 1200,
        latitude: 23.712345,
        longitude: 80.901234,
        call_status: status,
        failure_reason: status === 'failed' ? 'provider down' : null,
        provider_status_raw: null,
        msg91_uuid: null,
        duration_seconds: status === 'completed' ? 12 : null,
        requested_at: null,
        started_at: null,
        ended_at: null,
        created_at: '2026-09-24T09:56:32Z',
    };
}

const t = (key: string) => key;

describe('call log metrics', () => {
    it('counts triggered as everyone queued, and splits received from failed', () => {
        const metrics = summarizeCallLogs([
            row('completed', 'a'),
            row('completed', 'b'),
            row('failed', 'c'),
            row('queued', 'd'),
            row('no_answer', 'e'),
            row('triggered', 'f'),
        ]);
        expect(metrics.triggered).toBe(6);
        expect(metrics.received).toBe(2);
        expect(metrics.failed).toBe(1);
        expect(metrics.queued).toBe(1);
        expect(metrics.noAnswer).toBe(1);
        expect(metrics.dialed).toBe(1);
    });

    it('does not count a villager already alerted within 4 hours as triggered', () => {
        const metrics = summarizeCallLogs([
            row('queued', 'a'),
            row('recently_alerted', 'b'),
            row('recently_alerted', 'c'),
        ]);
        expect(metrics.triggered).toBe(1);
        expect(metrics.recentlyAlerted).toBe(2);
    });

    it('exports one CSV row per villager', () => {
        const csv = callLogsToCsv([row('failed', 'राम, सिंह')], t);
        expect(csv.split('\n')).toHaveLength(2);
        expect(csv).toContain('"राम, सिंह"');
        expect(csv).toContain('provider down');
        expect(csv).toContain('admin.obs.callStatusFailed');
        expect(csv).toContain('admin.obs.callLatitude');
        expect(csv).toContain('admin.obs.callLongitude');
        expect(csv).toContain('23.712345');
        expect(csv).toContain('80.901234');
    });

    it('formats coordinates for the call-log table', () => {
        expect(formatCallCoordinate(23.712345)).toBe('23.712345');
        expect(formatCallCoordinate(80.901234)).toBe('80.901234');
        expect(formatCallCoordinate(null)).toBe('—');
        expect(formatCallCoordinate(Number.NaN)).toBe('—');
    });
});
