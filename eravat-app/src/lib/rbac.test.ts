import { describe, expect, it } from 'vitest';
import { canEditVillagerRecord, canLeadVillagers, canOnboardVillagers } from './rbac';

describe('villager RBAC', () => {
  it('lets beat guards onboard and edit only their own villagers', () => {
    expect(canOnboardVillagers('beat_guard')).toBe(true);
    expect(canLeadVillagers('beat_guard')).toBe(false);
    expect(canEditVillagerRecord('beat_guard', 'me', 'me')).toBe(true);
    expect(canEditVillagerRecord('beat_guard', 'me', 'other')).toBe(false);
  });

  it('lets Command Center leadership edit any villager', () => {
    expect(canLeadVillagers('dfo')).toBe(true);
    expect(canEditVillagerRecord('dfo', 'boss', 'field-user')).toBe(true);
  });

  it('blocks volunteers from villager management', () => {
    expect(canOnboardVillagers('volunteer')).toBe(false);
    expect(canEditVillagerRecord('volunteer', 'v', 'v')).toBe(false);
  });
});
