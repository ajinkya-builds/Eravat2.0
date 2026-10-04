import { describe, expect, it } from 'vitest';
import {
  SEEDED_ONBOARD_ROLES,
  VILLAGER_BROWSE_ONLY_ROLES,
  canBrowseVillagersReadOnly,
  canEditVillagerRecord,
  canLeadVillagers,
  canReadVillagers,
  seededCanAddHathiMitra,
  seededCanAddVillager,
  showOwnRecordsTile,
} from './rbac';

describe('onboarding seed', () => {
  it('matches today\'s Hathi Mitra and villager add roles', () => {
    for (const role of SEEDED_ONBOARD_ROLES) {
      expect(seededCanAddHathiMitra(role)).toBe(true);
      expect(seededCanAddVillager(role)).toBe(true);
    }
    for (const role of ['rrt', 'biologist', 'veterinarian', 'volunteer']) {
      expect(seededCanAddHathiMitra(role)).toBe(false);
      expect(seededCanAddVillager(role)).toBe(false);
    }
  });

  it('keeps villager browse on the read-only roles only', () => {
    for (const role of VILLAGER_BROWSE_ONLY_ROLES) {
      expect(canBrowseVillagersReadOnly(role)).toBe(true);
      expect(canReadVillagers(role)).toBe(true);
    }
    expect(canBrowseVillagersReadOnly('beat_guard')).toBe(false);
    expect(canReadVillagers('beat_guard')).toBe(true);
    expect(canReadVillagers('volunteer')).toBe(false);
  });
});

describe('own records tile', () => {
  it('stays visible after add permission is turned off when the user already has rows', () => {
    expect(showOwnRecordsTile(true, 0)).toBe(true);
    expect(showOwnRecordsTile(true, null)).toBe(true);
    expect(showOwnRecordsTile(false, 2)).toBe(true);
    expect(showOwnRecordsTile(false, 0)).toBe(false);
    expect(showOwnRecordsTile(false, null)).toBe(false);
  });
});

describe('villager RBAC', () => {
  it('lets beat guards edit only their own villagers while add is enabled', () => {
    expect(canLeadVillagers('beat_guard')).toBe(false);
    expect(canEditVillagerRecord('beat_guard', 'me', 'me', true)).toBe(true);
    expect(canEditVillagerRecord('beat_guard', 'me', 'other', true)).toBe(false);
    expect(canEditVillagerRecord('beat_guard', 'me', 'me', false)).toBe(false);
  });

  it('lets Command Center leadership edit any villager even if add is off', () => {
    expect(canLeadVillagers('dfo')).toBe(true);
    expect(canEditVillagerRecord('dfo', 'boss', 'field-user', false)).toBe(true);
  });

  it('blocks volunteers from villager edits', () => {
    expect(canEditVillagerRecord('volunteer', 'v', 'v', false)).toBe(false);
    expect(canEditVillagerRecord('volunteer', 'v', 'v', true)).toBe(true);
  });
});
