import { describe, expect, it } from 'vitest';
import {
  TIER_CRITICAL,
  TIER_HIGH,
  beatIntelligence,
  classifyGroup,
  hourlyConflictProfile,
  isConflict,
  shrinkRates,
  type SightingFact,
} from '../edIntelligence';

function fact(partial: Partial<SightingFact> & { id: string }): SightingFact {
  return {
    at: new Date('2026-08-01T20:00:00Z'),
    beat: 'Beat A',
    range: 'Range 1',
    division: 'Division 1',
    lat: 23.1,
    lng: 81.2,
    male: 0,
    female: 0,
    calf: 0,
    unknown: 0,
    totalElephants: 0,
    crop: false,
    grain: false,
    house: false,
    deaths: 0,
    injuries: 0,
    ...partial,
  };
}

describe('edIntelligence', () => {
  it('classifies lone bulls vs family herds', () => {
    expect(classifyGroup(fact({ id: '1', male: 1, totalElephants: 1 }))).toBe('Lone bull');
    expect(classifyGroup(fact({ id: '2', female: 2, calf: 1, totalElephants: 3 }))).toBe('Family herd');
  });

  it('treats death-only rows as conflict', () => {
    expect(isConflict(fact({ id: 'd', deaths: 1 }))).toBe(true);
  });

  it('shrinks thin 100% rates toward the landscape rate', () => {
    const { adjusted, priorMean } = shrinkRates([1, 90], [1, 200]);
    expect(priorMean).toBeCloseTo(91 / 201, 5);
    expect(adjusted[0]).toBeLessThan(1);
    expect(adjusted[0]).toBeGreaterThan(priorMean);
  });

  it('marks a recent fatality as Critical', () => {
    const rows = beatIntelligence(
      [
        fact({ id: 'c', beat: 'Hot', deaths: 1, at: new Date() }),
        fact({ id: 'q', beat: 'Quiet', male: 2, totalElephants: 2, at: new Date() }),
      ],
      [],
      new Date(),
    );
    expect(rows.find((r) => r.beat === 'Hot')?.tier).toBe(TIER_CRITICAL);
    expect(rows.find((r) => r.beat === 'Quiet')?.tier).not.toBe(TIER_CRITICAL);
  });

  it('promotes historical (not recent) fatality to High', () => {
    const old = new Date();
    old.setDate(old.getDate() - 200);
    const rows = beatIntelligence(
      [fact({ id: 'old', beat: 'OldDeath', deaths: 1, at: old })],
      [],
      new Date(),
    );
    expect(rows[0].tier).toBe(TIER_HIGH);
  });

  it('finds a peak hour window covering most conflict', () => {
    const facts = Array.from({ length: 10 }, (_, i) =>
      fact({ id: `n${i}`, crop: true, at: new Date(`2026-08-01T${String(20 + (i % 2)).padStart(2, '0')}:00:00`) }),
    );
    const { peak } = hourlyConflictProfile(facts);
    expect(peak).not.toBeNull();
    expect(peak!.share).toBeGreaterThanOrEqual(60);
  });
});
