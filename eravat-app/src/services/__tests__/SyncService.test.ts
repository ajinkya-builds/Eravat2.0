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
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: 'test-user-id' } } },
      }),
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
    expect(result).toEqual({
      success: true,
      count: 0,
      total: 0,
      message: 'Nothing to sync',
    });
    expect(supabase.auth.getSession).toHaveBeenCalledTimes(1);
    expect(db.reports.where).toHaveBeenCalledWith('sync_status');
  });

  it('fails safely if user is not authenticated', async () => {
    (supabase.auth.getSession as any).mockResolvedValueOnce({ data: { session: null } });

    const result = await syncData();
    expect(result).toEqual({ success: false, error: 'Not authenticated' });
    expect(db.reports.where).not.toHaveBeenCalled();
  });

  it('sends total_elephants as the sum of sex/age counts on observations upsert', async () => {
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
          total_elephants: 5,
          male_count: 2,
          female_count: 2,
          calf_count: 1,
          unknown_count: 0,
          compass_bearing: 90,
          indirect_sign_details: [],
          conflict_loss_details: [],
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
    expect(observationsPayload).toMatchObject({
      report_id: 'report-uuid-1',
      type: 'direct_sighting',
      male_count: 2,
      female_count: 2,
      calf_count: 1,
      unknown_count: 0,
      total_elephants: 5,
    });
  });

  it('sends conflict_loss_details to observations for loss reports', async () => {
    (db.reports.where as any).mockReturnValueOnce({
      anyOf: vi.fn(() => ({
        toArray: vi.fn().mockResolvedValue([{
          id: 'report-uuid-2',
          user_id: 'test-user-id',
          beat_id: 'beat-uuid-1',
          device_timestamp: new Date().toISOString(),
          latitude: 21.5,
          longitude: 80.5,
          notes: null,
          observation_type: 'loss',
          male_count: 0,
          female_count: 0,
          calf_count: 0,
          unknown_count: 0,
          compass_bearing: null,
          indirect_sign_details: [],
          conflict_loss_details: ['crop', 'fencing'],
          loss_type: ['crop', 'fencing'],
          sync_status: 'pending',
        }]),
      })),
    });

    (db.report_media.where as any).mockReturnValueOnce({
      equals: vi.fn(() => ({
        toArray: vi.fn().mockResolvedValue([]),
      })),
    });

    await syncData();

    const observationsPayload = mockUpsert.mock.calls
      .map(([payload]) => payload)
      .find((p) => p && !Array.isArray(p) && p.report_id === 'report-uuid-2' && p.type === 'conflict_loss');

    expect(observationsPayload).toBeDefined();
    expect(observationsPayload).toMatchObject({
      report_id: 'report-uuid-2',
      type: 'conflict_loss',
      conflict_loss_details: ['crop', 'fencing'],
    });
  });

  it('sends damage_description and damage_value to conflict_damages for loss reports', async () => {
    (db.reports.where as any).mockReturnValueOnce({
      anyOf: vi.fn(() => ({
        toArray: vi.fn().mockResolvedValue([{
          id: 'report-uuid-3',
          user_id: 'test-user-id',
          beat_id: 'beat-uuid-1',
          device_timestamp: new Date().toISOString(),
          latitude: 21.5,
          longitude: 80.5,
          notes: null,
          observation_type: 'loss',
          male_count: 0,
          female_count: 0,
          calf_count: 0,
          unknown_count: 0,
          compass_bearing: null,
          indirect_sign_details: [],
          conflict_loss_details: ['crop'],
          loss_type: ['crop'],
          damage_description: 'Custom crop damage detail text',
          damage_value: 5000,
          sync_status: 'pending',
        }]),
      })),
    });

    (db.report_media.where as any).mockReturnValueOnce({
      equals: vi.fn(() => ({
        toArray: vi.fn().mockResolvedValue([]),
      })),
    });

    await syncData();

    // Find the upsert call that has an array of rows and report_id: 'report-uuid-3'
    const damagesPayload = mockUpsert.mock.calls
      .map(([payload]) => payload)
      .find((p) => Array.isArray(p) && p.length > 0 && p[0]?.report_id === 'report-uuid-3');

    expect(damagesPayload).toBeDefined();
    expect(damagesPayload[0]).toMatchObject({
      report_id: 'report-uuid-3',
      category: 'crop',
      description: 'Custom crop damage detail text',
      estimated_value: 5000,
    });
  });
});
