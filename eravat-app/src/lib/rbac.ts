export const VALID_ROLES = [
  'admin', 'ccf', 'biologist', 'veterinarian',
  'dfo', 'rrt', 'range_officer', 'beat_guard', 'volunteer',
] as const;

export type UserRole = (typeof VALID_ROLES)[number];

export const ROLE_HIERARCHY: Record<string, string[]> = {
  admin: ['*'],
  ccf: ['*'],
  biologist: [],
  veterinarian: [],
  dfo: ['range_officer', 'beat_guard', 'volunteer'],
  rrt: ['beat_guard'],
  range_officer: ['beat_guard', 'volunteer'],
  beat_guard: ['volunteer'],
  volunteer: [],
};

export const GEOGRAPHIC_ROLES = ['dfo', 'rrt', 'range_officer', 'beat_guard'] as const;

/** Region-agnostic roles that may later receive profile-GPS proximity alerts. */
export const REGION_AGNOSTIC_ROLES = ['admin', 'ccf', 'biologist', 'veterinarian'] as const;

export function canManageRole(callerRole?: string, targetRole?: string): boolean {
  if (!callerRole || !targetRole) return false;
  if (!VALID_ROLES.includes(targetRole as UserRole)) return false;
  const allowed = ROLE_HIERARCHY[callerRole];
  if (!allowed) return false;
  if (allowed.includes('*')) return true;
  return allowed.includes(targetRole);
}

/**
 * Roles seeded with can_add_hathi_mitra / can_add_villager = true.
 * Runtime gates must use role_onboarding_config, not these helpers.
 */
export const SEEDED_ONBOARD_ROLES = ['admin', 'ccf', 'dfo', 'range_officer', 'beat_guard'] as const;

/** Read-only villager browse. Not expanded when an onboard role loses add permission. */
export const VILLAGER_BROWSE_ONLY_ROLES = ['rrt', 'biologist', 'veterinarian'] as const;

export function seededCanAddHathiMitra(role?: string): boolean {
  return !!role && (SEEDED_ONBOARD_ROLES as readonly string[]).includes(role);
}

export function seededCanAddVillager(role?: string): boolean {
  return seededCanAddHathiMitra(role);
}

/** @deprecated Use role_onboarding_config via useOnboardingPermissions. Documents the seed only. */
export function canOnboardVolunteers(role?: string): boolean {
  return seededCanAddHathiMitra(role);
}

/** @deprecated Use role_onboarding_config via useOnboardingPermissions. Documents the seed only. */
export function canOnboardVillagers(role?: string): boolean {
  return seededCanAddVillager(role);
}

/** Staff who may search / list villagers for ops. Independent of the add toggle. */
export function canReadVillagers(role?: string): boolean {
  return seededCanAddVillager(role) || canBrowseVillagersReadOnly(role);
}

export function canBrowseVillagersReadOnly(role?: string): boolean {
  return !!role && (VILLAGER_BROWSE_ONLY_ROLES as readonly string[]).includes(role);
}

/** Home tile for records the user added. Stays visible after add permission is revoked. */
export function showOwnRecordsTile(canAdd: boolean, ownCount: number | null): boolean {
  return canAdd || (ownCount ?? 0) > 0;
}

/** Command Center leadership — edit any villager, hard-delete. */
export function canLeadVillagers(role?: string): boolean {
  return !!role && ['admin', 'ccf', 'dfo'].includes(role);
}

/**
 * Leadership may edit any villager. Other roles edit their own rows only while
 * canAddVillager is true (same flag as insert, from role_onboarding_config).
 */
export function canEditVillagerRecord(
  role?: string,
  viewerId?: string | null,
  createdBy?: string | null,
  canAddVillager = false,
): boolean {
  if (canLeadVillagers(role)) return true;
  if (!canAddVillager) return false;
  return Boolean(viewerId && createdBy && viewerId === createdBy);
}

/**
 * Whether the current session may configure personal alert radius.
 * Source of truth: `role_alert_radius_config` via RPC (admin enabled first).
 */
export async function fetchCanConfigureAlertRadius(
  callRpc: () => PromiseLike<{ data: boolean | null; error: unknown }>,
): Promise<boolean> {
  const { data, error } = await callRpc();
  if (error) return false;
  return Boolean(data);
}

export type AlertRadiusBoundsResult = { minKm: number; maxKm: number };

/**
 * Fetch configurable min/max km for alert radius (DB: alert_radius_bounds).
 */
export async function fetchAlertRadiusBounds(
  callRpc: () => PromiseLike<{
    data: { min_km: number; max_km: number }[] | { min_km: number; max_km: number } | null;
    error: unknown;
  }>,
  fallback: AlertRadiusBoundsResult = { minKm: 1, maxKm: 1000 },
): Promise<AlertRadiusBoundsResult> {
  const { data, error } = await callRpc();
  if (error || data == null) return fallback;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row.min_km !== 'number' || typeof row.max_km !== 'number') {
    return fallback;
  }
  return { minKm: row.min_km, maxKm: row.max_km };
}
