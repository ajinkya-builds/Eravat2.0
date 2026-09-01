import { describe, expect, it } from 'vitest';
import { rankVillageOptions, type VillageOption } from './VillageAutocomplete';

describe('rankVillageOptions', () => {
  const rows: VillageOption[] = [
    { id: '1', name: 'Zebra', division_id: 'other' },
    { id: '2', name: 'Alpha', division_id: 'pref' },
    { id: '3', name: 'Beta', division_id: null },
    { id: '4', name: 'Gamma', division_id: 'other' },
  ];

  it('sorts alphabetically when no preferred division', () => {
    expect(rankVillageOptions(rows).map((r) => r.name)).toEqual(['Alpha', 'Beta', 'Gamma', 'Zebra']);
  });

  it('prefers matching division and null before others', () => {
    expect(rankVillageOptions(rows, 'pref').map((r) => r.name)).toEqual([
      'Alpha',
      'Beta',
      'Gamma',
      'Zebra',
    ]);
  });
});
