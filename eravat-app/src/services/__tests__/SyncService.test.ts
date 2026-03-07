import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncData } from '../syncService';
import { db } from '../../db';
import { supabase } from '../../supabase';

// --- Hoisted mock state (declared before vi.mock hoisting) ---
const mockUpsert = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }));
const mockFrom = vi.hoisted(() => vi.fn(() => ({ upsert: mockUpsert })));

// --- Mocks ---

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
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user-id' } } }),
    },
    from: mockFrom,
    storage: {
      from: vi.fn(),
    },
  },
}));

// --- Tests ---

describe('SyncService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-apply default return so clearAllMocks doesn't wipe out the implementation
    mockUpsert.mockResolvedValue({ error: null });
    mockFrom.mockImplementation(() => ({ upsert: mockUpsert }));
  });

  it('returns success and count 0 if no pending reports exist', async () => {
    const result = await syncData();
    expect(result).toEqual({ success: true, count: 0 });
    expect(supabase.auth.getUser).toHaveBeenCalledTimes(1);
    expect(db.reports.where).toHaveBeenCalledWith('sync_status');
  });

  it('fails safely if user is not authenticated', async () => {
    (supabase.auth.getUser as any).mockResolvedValueOnce({ data: { user: null } });

    const result = await syncData();
    expect(result).toEqual({ success: false, error: 'Not authenticated' });
    expect(db.reports.where).not.toHaveBeenCalled();
  });

  it('does NOT send total_elephants to the observations table', async () => {
    // Arrange: one pending direct sighting report
    (db.reports.where as any).mockReturnValueOnce({
      anyOf: vi.fn(() => ({
        toArray: vi.fn().mockResolvedValue([{
          id: 'report-uuid-1',
          user_id: 'test-user-id',
          beat_id: 'beat-uuid-1',
          device_timestamp: new Date().toISOString(),
          latitude: 21.5,
          longitude: 80.5,
          notes: null,
          observation_type: 'direct',
          total_elephants: 5,    // stored locally — must NOT be sent to Supabase
          male_count: 2,
          female_count: 2,
          calf_count: 1,
          unknown_count: 0,
          compass_bearing: 90,
          indirect_sign_details: [],
          loss_type: [],
          sync_status: 'pending',
        }]),
      })),
    });

    // No media files for this report
    (db.report_media.where as any).mockReturnValueOnce({
      equals: vi.fn(() => ({
        toArray: vi.fn().mockResolvedValue([]),
      })),
    });

    await syncData();

    // Find the upsert call that has report_id: 'report-uuid-1' (the observation upsert)
    const observationsPayload = mockUpsert.mock.calls
      .map(([payload]) => payload)
      .find((p) => p?.report_id === 'report-uuid-1');

    expect(observationsPayload).toBeDefined();
    // The key assertion — total_elephants must not be present
    expect(observationsPayload).not.toHaveProperty('total_elephants');
    expect(observationsPayload).toMatchObject({
      report_id: 'report-uuid-1',
      type: 'direct_sighting',
      male_count: 2,
      female_count: 2,
      calf_count: 1,
      unknown_count: 0,
    });
  });
});
