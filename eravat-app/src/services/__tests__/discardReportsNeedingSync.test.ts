import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalMedia, LocalReport } from '../../db';

const store = vi.hoisted(() => ({
    reports: [] as LocalReport[],
    media: [] as LocalMedia[],
}));

function rowsBy<T extends object>(rows: T[], index: string, value: unknown) {
    return rows.filter((row) => (row as Record<string, unknown>)[index] === value);
}

vi.mock('../../db', () => ({
    db: {
        reports: {
            where: (index: string) => ({
                anyOf: (values: string[]) => ({
                    toArray: async () => store.reports.filter((report) => values.includes(String(report[index as keyof LocalReport]))),
                }),
                equals: (value: string) => ({
                    toArray: async () => rowsBy(store.reports, index, value),
                }),
            }),
            delete: async (id: string) => {
                store.reports = store.reports.filter((report) => report.id !== id);
            },
        },
        report_media: {
            where: (index: string) => ({
                equals: (value: string) => {
                    const matched = () => rowsBy(store.media, index, value);
                    return {
                        toArray: async () => matched(),
                        filter: (predicate: (row: LocalMedia) => boolean) => ({
                            count: async () => matched().filter(predicate).length,
                        }),
                        delete: async () => {
                            const before = store.media.length;
                            store.media = store.media.filter((item) => item[index as keyof LocalMedia] !== value);
                            return before - store.media.length;
                        },
                    };
                },
            }),
            delete: async (id: string) => {
                store.media = store.media.filter((item) => item.id !== id);
            },
        },
        transaction: async (_mode: string, _reports: unknown, _media: unknown, fn: () => Promise<void>) => fn(),
    },
}));

vi.mock('../../supabase', () => ({
    supabase: { auth: { getSession: vi.fn() }, from: vi.fn() },
}));

vi.mock('../../lib/analytics', () => ({ track: vi.fn() }));

vi.mock('../../lib/logger', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { discardReportsNeedingSync } from '../syncService';
import { track } from '../../lib/analytics';

function report(partial: Partial<LocalReport> & Pick<LocalReport, 'id' | 'sync_status'>): LocalReport {
    return {
        user_id: 'owner-a',
        division_id: null,
        range_id: null,
        beat_id: null,
        latitude: 1,
        longitude: 2,
        device_timestamp: '2026-10-05T12:56:03.714Z',
        activity_date: '2026-10-05',
        activity_time: '18:25',
        observation_type: 'direct',
        male_count: 1,
        total_elephants: 1,
        female_count: 0,
        calf_count: 0,
        unknown_count: 0,
        compass_bearing: null,
        indirect_sign_details: [],
        conflict_loss_details: [],
        loss_type: [],
        photo_url: null,
        obs_id: null,
        notes: null,
        status: 'submitted',
        ...partial,
    };
}

describe('discardReportsNeedingSync', () => {
    beforeEach(() => {
        store.reports = [];
        store.media = [];
        vi.clearAllMocks();
    });

    it('removes failed reports and leaves an already synced report on the phone', async () => {
        store.reports = [
            report({ id: 'failed-report', user_id: 'other-user', sync_status: 'failed' }),
            report({ id: 'synced-report', sync_status: 'synced' }),
        ];
        store.media = [
            { id: 'failed-media', report_id: 'failed-report', mime_type: 'image/png', file_data: 'abc', sync_status: 'pending' },
            { id: 'synced-media', report_id: 'synced-report', mime_type: 'image/png', file_data: 'abc', sync_status: 'synced' },
        ];

        const snapshot = await discardReportsNeedingSync('actor-user');

        expect(snapshot.reports.map((item) => item.id)).toEqual(['failed-report']);
        expect(store.reports.map((item) => item.id)).toEqual(['synced-report']);
        expect(store.media.map((item) => item.id)).toEqual(['synced-media']);
        expect(track).toHaveBeenCalledWith('sign_out.unsynced_discarded', expect.objectContaining({
            actor_user_id: 'actor-user',
            pending_count: 1,
            foreign_count: 1,
            report_ids: 'failed-report',
            owner_user_ids: 'other-user',
            media_ids: 'failed-media',
        }));
    });

    it('drops only unsent media when the report row already synced', async () => {
        store.reports = [report({ id: 'synced-report', sync_status: 'synced' })];
        store.media = [
            { id: 'pending-media', report_id: 'synced-report', mime_type: 'image/jpeg', file_data: 'abc', sync_status: 'pending' },
            { id: 'synced-media', report_id: 'synced-report', mime_type: 'image/jpeg', file_data: 'abc', sync_status: 'synced' },
        ];

        await discardReportsNeedingSync('owner-a');

        expect(store.reports.map((item) => item.id)).toEqual(['synced-report']);
        expect(store.media.map((item) => item.id)).toEqual(['synced-media']);
    });
});
