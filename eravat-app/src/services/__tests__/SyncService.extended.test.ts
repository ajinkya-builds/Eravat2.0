/**
 * Extended SyncService tests covering security guards, media validation,
 * loss-type mapping, cross-report isolation, and failure recovery paths.
 *
 * The base happy-path tests live in SyncService.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncData } from '../syncService';
import { db } from '../../db';
import { supabase } from '../../supabase';

// ─── Hoisted mock primitives ─────────────────────────────────────────────────

const mockUpsert = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }));
const mockInsert = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }));
const mockSelect = vi.hoisted(() => vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'r1', user_id: 'user-1' }, error: null }) }));
const mockFrom = vi.hoisted(() => vi.fn());
const mockUpload = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }));
const mockStorageFrom = vi.hoisted(() => vi.fn(() => ({ upload: mockUpload })));

vi.mock('../../db', () => ({
  db: {
    reports: {
      where: vi.fn(() => ({
        anyOf: vi.fn(() => ({
          toArray: vi.fn().mockResolvedValue([]),
        })),
      })),
      update: vi.fn(),
    },
    report_media: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          toArray: vi.fn().mockResolvedValue([]),
        })),
      })),
      update: vi.fn(),
    },
  },
}));

vi.mock('../../supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    },
    from: mockFrom,
    storage: { from: mockStorageFrom },
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockPendingReport(overrides: Record<string, unknown> = {}) {
  return {
    id: 'report-uuid-1',
    user_id: 'user-1',
    beat_id: 'beat-1',
    device_timestamp: new Date().toISOString(),
    latitude: 21.5,
    longitude: 80.5,
    notes: null,
    observation_type: 'direct',
    total_elephants: 0,
    male_count: 0,
    female_count: 0,
    calf_count: 0,
    unknown_count: 0,
    compass_bearing: null,
    indirect_sign_details: [],
    conflict_loss_details: [],
    loss_type: [],
    sync_status: 'pending',
    obs_id: null,
    ...overrides,
  };
}

function stubReports(reports: unknown[]) {
  (db.reports.where as any).mockReturnValueOnce({
    anyOf: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue(reports) })),
  });
}

function stubMedia(files: unknown[]) {
  (db.report_media.where as any).mockReturnValueOnce({
    equals: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue(files) })),
  });
}

// ─── Shared setup ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks does NOT drain unconsumed mockReturnValueOnce queues; tests
  // whose report fails before the media step leave stale once-stubs behind,
  // shifting lookups in later tests. mockReset restores factory implementations
  // and empties the once-queues.
  (db.reports.where as any).mockReset();
  (db.report_media.where as any).mockReset();
  mockUpload.mockReset();
  mockUpsert.mockResolvedValue({ error: null });
  mockInsert.mockResolvedValue({ error: null });
  mockUpload.mockResolvedValue({ error: null });
  mockFrom.mockImplementation(() => ({ upsert: mockUpsert, select: mockSelect }));
});

// ─── Security: user_id mismatch guard ────────────────────────────────────────

describe('user_id ownership guard', () => {
  it('marks a report as failed and skips it when user_id does not match authenticated user', async () => {
    stubReports([mockPendingReport({ user_id: 'attacker-uid' })]);

    const result = await syncData();

    expect(result).toMatchObject({ success: false, failed: 1 });
    expect(db.reports.update).toHaveBeenCalledWith('report-uuid-1', { sync_status: 'failed' });
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});

// ─── Security: unsafe ID guard ───────────────────────────────────────────────

describe('unsafe report ID guard', () => {
  it('marks a report with path-traversal characters as failed', async () => {
    stubReports([mockPendingReport({ id: '../etc/passwd', user_id: 'user-1' })]);

    const result = await syncData();

    expect(result).toMatchObject({ success: false, failed: 1 });
    expect(db.reports.update).toHaveBeenCalledWith('../etc/passwd', { sync_status: 'failed' });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('marks a report with null bytes in ID as failed', async () => {
    stubReports([mockPendingReport({ id: 'abc\0def', user_id: 'user-1' })]);

    const result = await syncData();

    expect(result).toMatchObject({ success: false, failed: 1 });
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});

// ─── Observation type mapping ─────────────────────────────────────────────────

describe('observation_type mapping', () => {
  it.each([
    ['direct', 'direct_sighting'],
    ['indirect', 'indirect_sign'],
    ['loss', 'conflict_loss'],
  ])('maps "%s" → "%s" in the observations upsert', async (inputType, expectedType) => {
    stubReports([mockPendingReport({ observation_type: inputType })]);
    stubMedia([]);

    await syncData();

    const payload = mockUpsert.mock.calls
      .map(([p]) => p)
      .find((p) => p?.report_id === 'report-uuid-1');

    expect(payload?.type).toBe(expectedType);
  });

  it('passes through unrecognised observation_type as-is (forward-compat)', async () => {
    stubReports([mockPendingReport({ observation_type: 'future_type' })]);
    stubMedia([]);

    await syncData();

    const payload = mockUpsert.mock.calls
      .map(([p]) => p)
      .find((p) => p?.report_id === 'report-uuid-1');

    expect(payload?.type).toBe('future_type');
  });
});

// ─── Conflict loss: category normalization ────────────────────────────────────

describe('loss_type category mapping', () => {
  it.each([
    ['no loss', 'none'],
    ['No Loss', 'none'],
    ['crop', 'crop'],
    ['CROP', 'crop'],
    ['livestock', 'livestock'],
    ['grain', 'grain'],
    ['Grain', 'grain'],
    ['human injury', 'human_injury'],
    ['Human Injury', 'human_injury'],
    ['human death', 'human_death'],
    ['Human Death', 'human_death'],
    ['fencing', 'property'],
    ['house', 'property'],
    ['other damage', 'property'],
  ])('maps loss string "%s" → category "%s"', async (lossString, expectedCategory) => {
    stubReports([mockPendingReport({
      observation_type: 'loss',
      loss_type: [lossString],
      conflict_loss_details: [lossString],
    })]);
    stubMedia([]);

    // Stub the conflict_damages upsert
    const damagePayloads: unknown[] = [];
    mockFrom.mockImplementation((table: string) => {
      if (table === 'conflict_damages') {
        return {
          upsert: vi.fn((rows) => {
            damagePayloads.push(...(Array.isArray(rows) ? rows : [rows]));
            return Promise.resolve({ error: null });
          }),
        };
      }
      return { upsert: mockUpsert, select: mockSelect };
    });

    await syncData();

    const damageRow = damagePayloads.find((r: any) => r?.description === lossString) as any;
    expect(damageRow?.category).toBe(expectedCategory);
  });
});

// ─── Media validation ─────────────────────────────────────────────────────────

describe('media MIME type validation', () => {
  it('rejects disallowed MIME type and marks report as failed', async () => {
    stubReports([mockPendingReport()]);
    stubMedia([{
      id: 'media-1',
      report_id: 'report-uuid-1',
      mime_type: 'application/pdf',
      file_data: btoa('fake'),
      sync_status: 'pending',
    }]);

    const result = await syncData();

    expect(result).toMatchObject({ success: false, failed: 1 });
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('rejects a media file with unsafe ID and marks report as failed', async () => {
    stubReports([mockPendingReport()]);
    stubMedia([{
      id: '../../evil',
      report_id: 'report-uuid-1',
      mime_type: 'image/jpeg',
      file_data: btoa('fake'),
      sync_status: 'pending',
    }]);

    const result = await syncData();

    expect(result).toMatchObject({ success: false, failed: 1 });
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('normalises image/jpg MIME type to image/jpeg before upload', async () => {
    stubReports([mockPendingReport()]);
    stubMedia([{
      id: 'media-valid',
      report_id: 'report-uuid-1',
      mime_type: 'image/jpg',
      file_data: btoa('fakejpeg'),
      sync_status: 'pending',
    }]);

    // Also stub the report verification step
    mockFrom.mockImplementation((table: string) => {
      if (table === 'report_media') {
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      if (table === 'reports') {
        return {
          upsert: mockUpsert,
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'report-uuid-1', user_id: 'user-1' }, error: null }),
            }),
          }),
        };
      }
      return { upsert: mockUpsert, select: mockSelect };
    });

    await syncData();

    expect(mockUpload).toHaveBeenCalledWith(
      expect.stringContaining('media-valid.jpg'),
      expect.anything(),
      expect.objectContaining({ contentType: 'image/jpeg' })
    );
  });
});

// ─── GPS location handling ────────────────────────────────────────────────────

describe('GPS location handling', () => {
  it('builds a valid SRID POINT string from lat/lng', async () => {
    stubReports([mockPendingReport({ latitude: 21.1234, longitude: 80.5678 })]);
    stubMedia([]);

    await syncData();

    const reportsPayload = mockUpsert.mock.calls
      .map(([p]) => p)
      .find((p) => p?.id === 'report-uuid-1' && p?.location !== undefined);

    expect(reportsPayload?.location).toBe('SRID=4326;POINT(80.5678 21.1234)');
  });

  it('sends null location when lat/lng are null', async () => {
    stubReports([mockPendingReport({ latitude: null, longitude: null })]);
    stubMedia([]);

    await syncData();

    const reportsPayload = mockUpsert.mock.calls
      .map(([p]) => p)
      .find((p) => p?.id === 'report-uuid-1');

    expect(reportsPayload?.location).toBeNull();
  });

  it('sends null location when only longitude is missing', async () => {
    stubReports([mockPendingReport({ latitude: 21.5, longitude: null })]);
    stubMedia([]);

    await syncData();

    const reportsPayload = mockUpsert.mock.calls
      .map(([p]) => p)
      .find((p) => p?.id === 'report-uuid-1');

    expect(reportsPayload?.location).toBeNull();
  });
});

// ─── Report-level upsert error handling ──────────────────────────────────────

describe('report upsert error handling', () => {
  it('marks report as failed when reports upsert returns an error', async () => {
    stubReports([mockPendingReport()]);
    stubMedia([]);

    mockFrom.mockImplementation((table: string) => {
      if (table === 'reports') {
        return { upsert: vi.fn().mockResolvedValue({ error: { message: 'RLS denied' } }) };
      }
      return { upsert: mockUpsert, select: mockSelect };
    });

    const result = await syncData();

    expect(result).toMatchObject({ success: false, failed: 1 });
    expect(db.reports.update).toHaveBeenCalledWith('report-uuid-1', { sync_status: 'failed' });
  });

  it('continues syncing subsequent reports when one report fails', async () => {
    const badReport = mockPendingReport({ id: 'bad-report', user_id: 'user-1' });
    const goodReport = mockPendingReport({ id: 'good-report', user_id: 'user-1' });

    (db.reports.where as any).mockReturnValueOnce({
      anyOf: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([badReport, goodReport]) })),
    });

    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'reports') {
        callCount++;
        // Fail first report upsert, succeed second
        if (callCount === 1) {
          return { upsert: vi.fn().mockResolvedValue({ error: { message: 'fail' } }) };
        }
        return { upsert: vi.fn().mockResolvedValue({ error: null }) };
      }
      return { upsert: mockUpsert, select: mockSelect };
    });

    // Media for each report
    (db.report_media.where as any)
      .mockReturnValueOnce({ equals: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })) })
      .mockReturnValueOnce({ equals: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })) });

    const result = await syncData();

    expect(result).toMatchObject({ success: false, count: 1, failed: 1 });
  });
});

// ─── No-observation reports ───────────────────────────────────────────────────

describe('reports with no observation_type', () => {
  it('skips the observations upsert when observation_type is null', async () => {
    stubReports([mockPendingReport({ observation_type: null })]);
    stubMedia([]);

    await syncData();

    // Only one upsert call for the reports table, none for observations
    const observationPayloads = mockUpsert.mock.calls
      .map(([p]) => p)
      .filter((p) => p?.report_id === 'report-uuid-1' && p?.type !== undefined);

    expect(observationPayloads).toHaveLength(0);
    expect(db.reports.update).toHaveBeenCalledWith('report-uuid-1', { sync_status: 'synced' });
  });
});

// ─── Total elephants calculation ──────────────────────────────────────────────

describe('total_elephants calculation', () => {
  it('calculates total from parts even when local total_elephants is wrong', async () => {
    stubReports([mockPendingReport({
      observation_type: 'direct',
      male_count: 5,
      female_count: 3,
      calf_count: 2,
      unknown_count: 1,
      total_elephants: 999, // stale/wrong value from local DB
    })]);
    stubMedia([]);

    await syncData();

    const obsPayload = mockUpsert.mock.calls
      .map(([p]) => p)
      .find((p) => p?.report_id === 'report-uuid-1' && p?.type === 'direct_sighting');

    // Service should recalculate: 5 + 3 + 2 + 1 = 11
    expect(obsPayload?.total_elephants).toBe(11);
  });

  it('handles all-zero counts (sends 0, not null)', async () => {
    stubReports([mockPendingReport({
      observation_type: 'indirect',
      male_count: 0, female_count: 0, calf_count: 0, unknown_count: 0,
    })]);
    stubMedia([]);

    await syncData();

    const obsPayload = mockUpsert.mock.calls
      .map(([p]) => p)
      .find((p) => p?.report_id === 'report-uuid-1');

    expect(obsPayload?.total_elephants).toBe(0);
  });
});

// ─── Media failure recovery ──────────────────────────────────────────────────

describe('media failure recovery', () => {
  const validMedia = {
    id: 'media-1',
    report_id: 'report-uuid-1',
    mime_type: 'image/jpeg',
    file_data: btoa('fakejpeg'),
    sync_status: 'pending',
  };

  function stubReportsTableWithCheck() {
    // reports table: upsert succeeds + the pre-media existence check succeeds
    return {
      upsert: mockUpsert,
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'report-uuid-1', user_id: 'user-1' },
            error: null,
          }),
        }),
      }),
    };
  }

  it('marks the report failed when storage upload errors, and never marks media synced', async () => {
    stubReports([mockPendingReport()]);
    stubMedia([validMedia]);
    mockUpload.mockResolvedValueOnce({ error: { message: 'storage unavailable' } });

    const result = await syncData();

    expect(result).toMatchObject({ success: false, failed: 1 });
    expect(db.reports.update).toHaveBeenCalledWith('report-uuid-1', { sync_status: 'failed' });
    expect(db.report_media.update).not.toHaveBeenCalled();
  });

  it('inserts media once with the pinned storage_path column and marks media synced', async () => {
    stubReports([mockPendingReport()]);
    stubMedia([validMedia]);

    const insertMock = vi.fn().mockResolvedValue({ error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'report_media') return { insert: insertMock };
      if (table === 'reports') return stubReportsTableWithCheck();
      return { upsert: mockUpsert, select: mockSelect };
    });

    const result = await syncData();

    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledWith({
      id: 'media-1',
      report_id: 'report-uuid-1',
      storage_path: 'report-uuid-1/media-1.jpg',
    });
    expect(db.report_media.update).toHaveBeenCalledWith('media-1', { sync_status: 'synced' });
    expect(db.reports.update).toHaveBeenCalledWith('report-uuid-1', { sync_status: 'synced' });
    expect(result).toMatchObject({ success: true, count: 1 });
  });

  it('fails the report on PGRST204 schema mismatch instead of retrying payload variants', async () => {
    stubReports([mockPendingReport()]);
    stubMedia([validMedia]);

    const insertMock = vi.fn().mockResolvedValue({ error: { code: 'PGRST204', message: 'column not found' } });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'report_media') return { insert: insertMock };
      if (table === 'reports') return stubReportsTableWithCheck();
      return { upsert: mockUpsert, select: mockSelect };
    });

    const result = await syncData();

    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(db.report_media.update).not.toHaveBeenCalledWith('media-1', { sync_status: 'synced' });
    expect(db.reports.update).toHaveBeenCalledWith('report-uuid-1', { sync_status: 'failed' });
    expect(result).toMatchObject({ success: false, failed: 1 });
  });

  it('bubbles a non-schema media insert error immediately (no retry ladder) and fails the report', async () => {
    stubReports([mockPendingReport()]);
    stubMedia([validMedia]);

    const insertMock = vi.fn().mockResolvedValue({ error: { code: '42501', message: 'RLS denied' } });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'report_media') return { insert: insertMock };
      if (table === 'reports') return stubReportsTableWithCheck();
      return { upsert: mockUpsert, select: mockSelect };
    });

    const result = await syncData();

    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ success: false, failed: 1 });
    expect(db.reports.update).toHaveBeenCalledWith('report-uuid-1', { sync_status: 'failed' });
  });

  it('fails the report when the row vanishes before the media insert (RLS pre-check)', async () => {
    stubReports([mockPendingReport()]);
    stubMedia([validMedia]);

    mockFrom.mockImplementation((table: string) => {
      if (table === 'reports') {
        return {
          upsert: mockUpsert,
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
            }),
          }),
        };
      }
      return { upsert: mockUpsert, select: mockSelect };
    });

    const result = await syncData();

    expect(result).toMatchObject({ success: false, failed: 1 });
    expect(db.report_media.update).not.toHaveBeenCalled();
  });

  it('a media failure on one report does not block the next report from syncing', async () => {
    const badReport = mockPendingReport({ id: 'report-bad', user_id: 'user-1' });
    const goodReport = mockPendingReport({ id: 'report-good', user_id: 'user-1' });

    (db.reports.where as any).mockReturnValueOnce({
      anyOf: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([badReport, goodReport]) })),
    });

    // First report has media whose upload fails; second has no media
    (db.report_media.where as any)
      .mockReturnValueOnce({
        equals: vi.fn(() => ({
          toArray: vi.fn().mockResolvedValue([{ ...validMedia, report_id: 'report-bad' }]),
        })),
      })
      .mockReturnValueOnce({
        equals: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
      });

    mockUpload.mockResolvedValueOnce({ error: { message: 'storage unavailable' } });

    const result = await syncData();

    expect(result).toMatchObject({ success: false, count: 1, failed: 1, total: 2 });
    expect(db.reports.update).toHaveBeenCalledWith('report-bad', { sync_status: 'failed' });
    expect(db.reports.update).toHaveBeenCalledWith('report-good', { sync_status: 'synced' });
  });
});

// ─── concurrent call guard ────────────────────────────────────────────────────

describe('concurrent sync guard', () => {
  it('returns early (count=0) when a sync is already in progress', async () => {
    // Start a sync that won't resolve yet
    let resolveFirst!: () => void;
    const firstSyncPromise = new Promise<void>(r => { resolveFirst = r; });

    (supabase.auth.getUser as any).mockImplementationOnce(() => firstSyncPromise.then(() => ({
      data: { user: null },
    })));

    // Fire first sync (will block)
    const first = syncData();
    // Fire second sync immediately
    const second = await syncData();

    expect(second).toMatchObject({ count: 0 });

    resolveFirst();
    await first;
  });
});
