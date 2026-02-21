export const ROLE_HIERARCHY: Record<string, string[]> = {
  admin: ['*'],
  ccf: ['*'],
  biologist: [],
  veterinarian: [],
  dfo: ['range_officer', 'beat_guard'],
  rrt: ['beat_guard'],
  range_officer: ['beat_guard'],
  beat_guard: [],
  volunteer: []
};

export function canManageRole(callerRole: string, targetRole: string): boolean {
  if (!callerRole || !targetRole) return false;
  const allowed = ROLE_HIERARCHY[callerRole];
  if (!allowed) return false;
  if (allowed.includes('*')) return true;
  return allowed.includes(targetRole);
}
