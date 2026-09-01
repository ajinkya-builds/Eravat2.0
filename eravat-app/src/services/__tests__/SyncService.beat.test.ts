import { describe, it, expect } from 'vitest';
import { buildReportUpsertRow } from '../syncService';

describe('buildReportUpsertRow beat override', () => {
  const base = {
    id: 'report-1',
    user_id: 'user-1',
    beat_id: 'stale-beat',
    device_timestamp: '2026-08-31T14:18:00.000Z',
    latitude: 23.824439,
    longitude: 80.988653,
    notes: null,
  };

  it('omits beat_id when override is null (server assigns from GPS)', () => {
    const row = buildReportUpsertRow(base, null);
    expect(row.beat_id).toBeUndefined();
    expect(row.location).toContain('80.988653');
  });

  it('uses GPS-resolved beat when override provided', () => {
    const row = buildReportUpsertRow(base, 'correct-beat');
    expect(row.beat_id).toBe('correct-beat');
  });
});
