/**
 * Map a Gajrakshak / ED-style CSV row onto Eravat report fields.
 * Does not write to the database. Use with a service-role ingest only on staging.
 *
 * Expected headers (flexible): Date, Hour, Latitude, Longitude, Division, Range, Beat,
 * Male Count, Female Count, Calf Count, Unknown Count, Total Count,
 * Crop Damage, Grain Damage, House Damage, Injury, Death,
 * Male Death Count, Female Death Count, Children Death Count,
 * Male Injury Count, Female Injury Count, Children Injury Count.
 */
export function truthy(value) {
  if (value == null) return false;
  const s = String(value).trim().toLowerCase();
  if (!s || ['0', 'false', 'no', 'n', '-', 'null'].includes(s)) return false;
  return true;
}

export function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function mapGajrakshakRow(row) {
  const deaths =
    num(row['Male Death Count']) +
    num(row['Female Death Count']) +
    num(row['Children Death Count']);
  const injuries =
    num(row['Male Injury Count']) +
    num(row['Female Injury Count']) +
    num(row['Children Injury Count']);
  const deathFlag = truthy(row.Death) || deaths > 0;
  const injuryFlag = truthy(row.Injury) || injuries > 0;
  const loss_type = [];
  if (deathFlag) loss_type.push('human_death');
  if (injuryFlag) loss_type.push('human_injury');
  if (truthy(row['Crop Damage'])) loss_type.push('crop');
  if (truthy(row['Grain Damage'])) loss_type.push('grain');
  if (truthy(row['House Damage'])) loss_type.push('property');

  const observation_type = loss_type.length ? 'loss' : 'direct';
  return {
    source: 'gajrakshak',
    observation_type,
    latitude: num(row.Latitude) || null,
    longitude: num(row.Longitude) || null,
    male_count: num(row['Male Count']),
    female_count: num(row['Female Count']),
    calf_count: num(row['Calf Count']),
    unknown_count: num(row['Unknown Count']),
    loss_type,
    affected_people: deathFlag ? Math.max(1, deaths) : injuryFlag ? Math.max(1, injuries) : 1,
    notes: [row.Division, row.Range, row.Beat].filter(Boolean).join(' / ') || null,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Gajrakshak mapper. Import mapGajrakshakRow() from a staging ingest; do not run against prod.');
}
