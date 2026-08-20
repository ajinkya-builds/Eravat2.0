import { supabase } from '../supabase';
import { toE164India } from './phone';
import type { VillageOption } from '../components/villagers/VillageAutocomplete';
import type { TerritoryValue } from '../components/shared/TerritorySelect';
import type { LocationValue } from '../components/profile/LocationFields';

export type VillagerFormValues = {
  name: string;
  phone: string;
  villageName: string;
  selectedVillage: VillageOption | null;
  location: LocationValue;
  territory: TerritoryValue;
  notes: string;
  alertOptIn: boolean;
  isActive: boolean;
};

export type NestedName = { name: string } | { name: string }[] | null | undefined;

export type NestedPerson =
  | { first_name: string | null; last_name: string | null }
  | { first_name: string | null; last_name: string | null }[]
  | null
  | undefined;

export type VillagerRecord = {
  id: string;
  name: string;
  mobile: string;
  latitude: number | null;
  longitude: number | null;
  village_id: string;
  division_id: string | null;
  range_id: string | null;
  created_by: string | null;
  is_active: boolean;
  alert_opt_in: boolean;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
  villages?: NestedName;
  geo_divisions?: NestedName;
  geo_ranges?: NestedName;
  onboarder?: NestedPerson;
};

export const VILLAGER_DETAIL_SELECT =
  'id, name, mobile, latitude, longitude, village_id, division_id, range_id, created_by, is_active, alert_opt_in, notes, created_at, updated_at, villages(name)';

export const VILLAGER_ADMIN_SELECT = `
  id, name, mobile, latitude, longitude, village_id, division_id, range_id,
  created_by, is_active, alert_opt_in, notes, created_at, updated_at,
  villages(name),
  geo_divisions(name),
  geo_ranges(name)
`;

export function nestedName(rel: NestedName): string | null {
  if (!rel) return null;
  if (Array.isArray(rel)) return rel[0]?.name ?? null;
  return rel.name ?? null;
}

export function villageNameOf(row: Pick<VillagerRecord, 'villages'>): string | null {
  return nestedName(row.villages);
}

export function onboarderLabel(rel: NestedPerson): string | null {
  const person = Array.isArray(rel) ? rel[0] : rel;
  if (!person) return null;
  const name = `${person.first_name ?? ''} ${person.last_name ?? ''}`.trim();
  return name || null;
}

export function emptyVillagerForm(profile?: {
  division_id?: string | null;
  range_id?: string | null;
  beat_id?: string | null;
} | null): VillagerFormValues {
  return {
    name: '',
    phone: '',
    villageName: '',
    selectedVillage: null,
    location: { latitude: null, longitude: null },
    territory: {
      division_id: profile?.division_id ?? null,
      range_id: profile?.range_id ?? null,
      beat_id: profile?.beat_id ?? null,
    },
    notes: '',
    alertOptIn: true,
    isActive: true,
  };
}

export function validateVillagerForm(
  values: Pick<VillagerFormValues, 'name' | 'phone' | 'villageName' | 'location'>,
): { ok: true; mobile: string } | { ok: false; errorKey: string } {
  if (!values.name.trim() || !values.phone.trim() || !values.villageName.trim()) {
    return { ok: false, errorKey: 'hathiMitra.onboardRequired' };
  }
  const mobile = toE164India(values.phone);
  if (!mobile) return { ok: false, errorKey: 'hathiMitra.invalidPhone' };
  if (values.location.latitude == null || values.location.longitude == null) {
    return { ok: false, errorKey: 'hathiMitra.onboardGpsRequired' };
  }
  return { ok: true, mobile };
}

export async function ensureVillageId(
  villageName: string,
  selected: VillageOption | null,
  divisionId: string | null,
): Promise<string> {
  if (selected?.id) return selected.id;
  const { data, error } = await supabase.rpc('ensure_village', {
    p_name: villageName.trim(),
    p_division_id: divisionId,
  });
  if (error) throw error;
  if (!data) throw new Error('village_failed');
  return data as string;
}

export function isUniqueMobileError(err: { code?: string } | null | undefined): boolean {
  return err?.code === '23505';
}

export function isUuid(value: string | undefined | null): value is string {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function villagerToCsvRow(row: VillagerRecord): string {
  const cells = [
    row.name,
    row.mobile,
    villageNameOf(row) ?? '',
    nestedName(row.geo_divisions) ?? '',
    nestedName(row.geo_ranges) ?? '',
    onboarderLabel(row.onboarder) ?? '',
    row.is_active ? 'active' : 'inactive',
    row.alert_opt_in ? 'opted_in' : 'opted_out',
    row.latitude != null ? String(row.latitude) : '',
    row.longitude != null ? String(row.longitude) : '',
    row.notes ?? '',
    row.created_at ?? '',
  ];
  return cells.map((c) => csvEscape(c)).join(',');
}

export const VILLAGER_CSV_HEADER =
  'Name,Mobile,Village,Division,Range,Onboarded by,Status,Alerts,Latitude,Longitude,Notes,Created at';
