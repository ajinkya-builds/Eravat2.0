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

export function canManageRole(callerRole?: string, targetRole?: string): boolean {
  if (!callerRole || !targetRole) return false;
  if (!VALID_ROLES.includes(targetRole as UserRole)) return false;
  const allowed = ROLE_HIERARCHY[callerRole];
  if (!allowed) return false;
  if (allowed.includes('*')) return true;
  return allowed.includes(targetRole);
}

export function canOnboardVolunteers(role?: string): boolean {
  return canManageRole(role, 'volunteer');
}
