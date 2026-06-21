/**
 * Unit tests for adminAnalyticsService — the pure helper functions that power
 * all five admin dashboards.  These functions run entirely in the browser
 * (no network calls), so they are tested without mocking Supabase.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeObsType,
  elephantTotal,
  mapDamageCategory,
  inferGrainDamage,
  countDamages,
  buildDivisionSummaries,
  latestEntryPerDivision,
  reportDivisionId,
  reportDivisionName,
  type AdminReportRow,
} from '../adminAnalyticsService';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeReport(overrides: Partial<AdminReportRow> = {}): AdminReportRow {
  return {
    id: 'report-1',
    user_id: 'user-1',
    device_timestamp: '2026-03-14T10:00:00Z',
    beat_id: 'beat-1',
    geo_beats: {
      name: 'Pali Beat',
      geo_ranges: {
        name: 'Pali Range',
        geo_divisions: { id: 'div-1', name: 'Sanjay Division' },
      },
    },
    observations: [],
    conflict_damages: [],
    ...overrides,
  };
}

// ─── normalizeObsType ─────────────────────────────────────────────────────────

describe('normalizeObsType', () => {
  it.each([
    ['direct_sighting', 'direct'],
    ['direct', 'direct'],
    ['indirect_sign', 'indirect'],
    ['indirect', 'indirect'],
    ['conflict_loss', 'loss'],
    ['loss', 'loss'],
  ])('maps "%s" → "%s"', (raw, expected) => {
    expect(normalizeObsType(raw)).toBe(expected);
  });

  it('returns "direct" as default for unknown type without conflict damages', () => {
    expect(normalizeObsType('unknown_value', false)).toBe('direct');
  });

  it('returns "loss" as default when hasConflict=true even for unknown type', () => {
    expect(normalizeObsType('unknown_value', true)).toBe('loss');
  });

  it('returns "loss" as default when type is undefined and hasConflict=true', () => {
    expect(normalizeObsType(undefined, true)).toBe('loss');
  });

  it('returns "direct" as default when both type and hasConflict are falsy', () => {
    expect(normalizeObsType(undefined, false)).toBe('direct');
  });
});

// ─── elephantTotal ────────────────────────────────────────────────────────────

describe('elephantTotal', () => {
  it('sums all four count fields correctly', () => {
    expect(elephantTotal({ male_count: 2, female_count: 3, calf_count: 1, unknown_count: 4 })).toBe(10);
  });

  it('handles zero counts for all fields', () => {
    expect(elephantTotal({ male_count: 0, female_count: 0, calf_count: 0, unknown_count: 0 })).toBe(0);
  });

  it('treats missing fields (undefined) as 0', () => {
    expect(elephantTotal({ male_count: 5 })).toBe(5);
  });

  it('returns 0 for undefined observation', () => {
    expect(elephantTotal(undefined)).toBe(0);
  });

  it('returns 0 for null observation', () => {
    expect(elephantTotal(null as any)).toBe(0);
  });

  it('handles very large counts without overflow', () => {
    expect(elephantTotal({ male_count: 1_000_000, female_count: 1_000_000, calf_count: 0, unknown_count: 0 }))
      .toBe(2_000_000);
  });
});

// ─── mapDamageCategory ────────────────────────────────────────────────────────

describe('mapDamageCategory', () => {
  it.each([
    ['human_death', 'human_death'],
    ['human_injury', 'human_injury'],
    ['crop', 'crop'],
    ['property', 'property'],
    ['livestock', 'livestock'],
  ])('maps exact category "%s" → "%s"', (input, expected) => {
    expect(mapDamageCategory(input)).toBe(expected);
  });

  it('detects grain via regex (case-insensitive)', () => {
    expect(mapDamageCategory('grain_storage')).toBe('grain');
    expect(mapDamageCategory('GRAIN')).toBe('grain');
    expect(mapDamageCategory('grain')).toBe('grain');
  });

  it('falls through to "other" for unrecognized categories', () => {
    expect(mapDamageCategory('fencing')).toBe('other');
    expect(mapDamageCategory('')).toBe('other');
    expect(mapDamageCategory('none')).toBe('other');
  });
});

// ─── inferGrainDamage ─────────────────────────────────────────────────────────

describe('inferGrainDamage', () => {
  it('returns true when conflict_loss_details contains "grain"', () => {
    const report = makeReport({
      observations: [{ conflict_loss_details: ['grain storage', 'crop'] }],
    });
    expect(inferGrainDamage(report)).toBe(true);
  });

  it('returns true when conflict_damages description mentions grain', () => {
    const report = makeReport({
      conflict_damages: [{ category: 'property', description: 'grain sack destroyed' }],
    });
    expect(inferGrainDamage(report)).toBe(true);
  });

  it('is case-insensitive', () => {
    const report = makeReport({
      observations: [{ conflict_loss_details: ['GRAIN'] }],
    });
    expect(inferGrainDamage(report)).toBe(true);
  });

  it('returns false when neither observations nor damages mention grain', () => {
    const report = makeReport({
      observations: [{ conflict_loss_details: ['crop', 'livestock'] }],
      conflict_damages: [{ category: 'crop', description: 'crops destroyed' }],
    });
    expect(inferGrainDamage(report)).toBe(false);
  });

  it('returns false for a report with no observations or damages', () => {
    const report = makeReport({ observations: [], conflict_damages: [] });
    expect(inferGrainDamage(report)).toBe(false);
  });
});

// ─── countDamages ─────────────────────────────────────────────────────────────

describe('countDamages', () => {
  it('returns all-zero counts for an empty report list', () => {
    const result = countDamages([]);
    expect(result.total).toBe(0);
    expect(result.crop).toBe(0);
    expect(result.human_death).toBe(0);
  });

  it('counts each damage category correctly from conflict_damages', () => {
    const report = makeReport({
      conflict_damages: [
        { category: 'crop', description: 'paddy field' },
        { category: 'property', description: 'wall broken' },
        { category: 'human_death', description: 'one fatality' },
      ],
    });
    const result = countDamages([report]);
    expect(result.crop).toBe(1);
    expect(result.property).toBe(1);
    expect(result.human_death).toBe(1);
    expect(result.total).toBe(3);
  });

  it('does NOT double-count grain when it is both in category AND in description', () => {
    // grain in conflict_damages.category AND grain in observations
    const report = makeReport({
      id: 'grain-double',
      conflict_damages: [{ category: 'grain_storage', description: 'grain' }],
      observations: [{ conflict_loss_details: ['grain'] }],
    });
    const result = countDamages([report]);
    // grain counted once from conflict_damages (category maps to 'grain')
    // inferGrainDamage returns true but the de-dup filter removes the report since it already has category='grain'
    expect(result.grain).toBe(1);
  });

  it('adds grain from inferred text when not present in conflict_damages categories', () => {
    const report = makeReport({
      id: 'inferred-grain',
      conflict_damages: [{ category: 'property', description: 'grain sack destroyed' }],
      observations: [],
    });
    const result = countDamages([report]);
    // property counted from category, grain inferred from description text
    expect(result.property).toBe(1);
    expect(result.grain).toBe(1);
    // total = property + 1 extra for inferred grain
    expect(result.total).toBe(2);
  });

  it('aggregates across multiple reports', () => {
    const reports = [
      makeReport({ id: 'r1', conflict_damages: [{ category: 'crop' }] }),
      makeReport({ id: 'r2', conflict_damages: [{ category: 'crop' }] }),
      makeReport({ id: 'r3', conflict_damages: [{ category: 'livestock' }] }),
    ];
    const result = countDamages(reports);
    expect(result.crop).toBe(2);
    expect(result.livestock).toBe(1);
    expect(result.total).toBe(3);
  });
});

// ─── reportDivisionId / reportDivisionName ────────────────────────────────────

describe('reportDivisionId', () => {
  it('returns the division id from nested geo_beats chain', () => {
    expect(reportDivisionId(makeReport())).toBe('div-1');
  });

  it('returns null when geo_beats is missing', () => {
    expect(reportDivisionId(makeReport({ geo_beats: undefined }))).toBeNull();
  });

  it('returns null when geo_ranges is missing', () => {
    expect(reportDivisionId(makeReport({
      geo_beats: { name: 'Beat', geo_ranges: null },
    }))).toBeNull();
  });

  it('returns null when geo_divisions is missing', () => {
    expect(reportDivisionId(makeReport({
      geo_beats: { name: 'Beat', geo_ranges: { name: 'Range', geo_divisions: null } },
    }))).toBeNull();
  });
});

describe('reportDivisionName', () => {
  it('returns the division name from the nested chain', () => {
    expect(reportDivisionName(makeReport())).toBe('Sanjay Division');
  });

  it('returns "Unassigned" when the chain is broken', () => {
    expect(reportDivisionName(makeReport({ geo_beats: undefined }))).toBe('Unassigned');
  });
});

// ─── buildDivisionSummaries ───────────────────────────────────────────────────

describe('buildDivisionSummaries', () => {
  it('counts sightings separately from damages', () => {
    const reports = [
      makeReport({ id: 'r1', observations: [{ type: 'direct_sighting' }], conflict_damages: [] }),
      makeReport({ id: 'r2', observations: [{ type: 'conflict_loss' }], conflict_damages: [{ category: 'crop' }] }),
    ];
    const result = buildDivisionSummaries(reports, {});
    expect(result).toHaveLength(1);
    expect(result[0].sightings).toBe(1);
    expect(result[0].damages).toBe(1);
  });

  it('groups reports from the same division into one row', () => {
    const reports = [
      makeReport({ id: 'r1', observations: [{ type: 'direct_sighting' }] }),
      makeReport({ id: 'r2', observations: [{ type: 'direct_sighting' }] }),
    ];
    const result = buildDivisionSummaries(reports, {});
    expect(result).toHaveLength(1);
    expect(result[0].sightings).toBe(2);
  });

  it('creates separate rows for different divisions', () => {
    const r1 = makeReport({ id: 'r1' });
    const r2: AdminReportRow = {
      ...makeReport({ id: 'r2' }),
      geo_beats: {
        name: 'Other Beat',
        geo_ranges: {
          name: 'Other Range',
          geo_divisions: { id: 'div-2', name: 'Other Division' },
        },
      },
    };
    const result = buildDivisionSummaries([r1, r2], {});
    expect(result).toHaveLength(2);
    expect(result.map(r => r.divisionId)).toContain('div-1');
    expect(result.map(r => r.divisionId)).toContain('div-2');
  });

  it('assigns personnel counts from the provided map', () => {
    const reports = [makeReport()];
    const result = buildDivisionSummaries(reports, { 'div-1': 7 });
    expect(result[0].personnel).toBe(7);
  });

  it('returns zero personnel for divisions absent from the map', () => {
    const reports = [makeReport()];
    const result = buildDivisionSummaries(reports, {});
    expect(result[0].personnel).toBe(0);
  });

  it('places reports with no beat in __unassigned__ bucket', () => {
    const report = makeReport({ id: 'r1', geo_beats: undefined });
    const result = buildDivisionSummaries([report], {});
    expect(result).toHaveLength(1);
    expect(result[0].divisionId).toBeNull();
    expect(result[0].divisionName).toBe('Unassigned');
  });

  it('sorts by sightings + damages descending', () => {
    const r1 = makeReport({ id: 'r1' }); // 1 sighting in div-1
    const r2: AdminReportRow = {
      ...makeReport({ id: 'r2' }),
      geo_beats: {
        name: 'B',
        geo_ranges: { name: 'R', geo_divisions: { id: 'div-2', name: 'AAA Division' } },
      },
      observations: [{ type: 'direct_sighting' }],
    };
    const r3: AdminReportRow = {
      ...makeReport({ id: 'r3' }),
      geo_beats: r2.geo_beats,
      observations: [{ type: 'direct_sighting' }],
    };
    const result = buildDivisionSummaries([r1, r2, r3], {});
    // div-2 has 2 sightings, div-1 has 1 — div-2 should sort first
    expect(result[0].divisionId).toBe('div-2');
  });
});

// ─── latestEntryPerDivision ───────────────────────────────────────────────────

describe('latestEntryPerDivision', () => {
  it('returns the first (latest) report per division and skips subsequent ones', () => {
    const reports = [
      makeReport({ id: 'newer', device_timestamp: '2026-05-01T10:00:00Z', observations: [{ male_count: 3 }] }),
      makeReport({ id: 'older', device_timestamp: '2026-04-01T10:00:00Z', observations: [{ male_count: 1 }] }),
    ];
    // reports are assumed pre-sorted descending (as fetchAdminReports returns them)
    const result = latestEntryPerDivision(reports);
    expect(result).toHaveLength(1);
    expect(result[0].reportId).toBe('newer');
    expect(result[0].elephantCount).toBe(3);
  });

  it('returns one entry per distinct division', () => {
    const r1 = makeReport({ id: 'r1' });
    const r2: AdminReportRow = {
      ...makeReport({ id: 'r2' }),
      geo_beats: {
        name: 'B2',
        geo_ranges: { name: 'R2', geo_divisions: { id: 'div-2', name: 'Div 2' } },
      },
    };
    const result = latestEntryPerDivision([r1, r2]);
    expect(result).toHaveLength(2);
  });

  it('returns empty array for empty input', () => {
    expect(latestEntryPerDivision([])).toEqual([]);
  });

  it('uses beat name from geo_beats or falls back to em-dash', () => {
    const withBeat = makeReport({ id: 'r1' });
    const noBeat = makeReport({
      id: 'r2',
      geo_beats: { name: undefined as any, geo_ranges: { name: 'R', geo_divisions: { id: 'div-2', name: 'D2' } } },
    });
    const results = latestEntryPerDivision([withBeat, noBeat]);
    const d1 = results.find(r => r.divisionId === 'div-1')!;
    const d2 = results.find(r => r.divisionId === 'div-2')!;
    expect(d1.beatName).toBe('Pali Beat');
    expect(d2.beatName).toBe('—');
  });

  it('sorts results alphabetically by divisionName', () => {
    const r1 = makeReport({ id: 'r1' }); // 'Sanjay Division'
    const r2: AdminReportRow = {
      ...makeReport({ id: 'r2' }),
      geo_beats: { name: 'B', geo_ranges: { name: 'R', geo_divisions: { id: 'div-2', name: 'Achanakmar Division' } } },
    };
    const result = latestEntryPerDivision([r1, r2]);
    expect(result[0].divisionName).toBe('Achanakmar Division');
    expect(result[1].divisionName).toBe('Sanjay Division');
  });
});
