/**
 * Map Staging Users.csv → Eravat seed JSON + validation report.
 *
 * Usage:
 *   node scripts/map-staging-users.mjs \
 *     "../Go live Prep - Staging/Staging Users.csv" \
 *     "../Go live Prep - Staging/generated/geo-reference.json" \
 *     "../Go live Prep - Staging/generated"
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const [, , csvPath, geoPath, outDirArg] = process.argv;
if (!csvPath || !geoPath) {
  console.error(
    'Usage: node scripts/map-staging-users.mjs <users.csv> <geo-reference.json> [outDir]'
  );
  process.exit(1);
}

const outDir =
  outDirArg ||
  join(dirname(fileURLToPath(import.meta.url)), '../../Go live Prep - Staging/generated');
mkdirSync(outDir, { recursive: true });

const ROLE_MAP = {
  acf: 'dfo',
  'range officer': 'range_officer',
  'dy ranger': 'range_officer',
  'forest guard': 'beat_guard',
  'suraksha shramik': 'volunteer',
  driver: 'volunteer',
  'computer operator': 'admin',
};

/** Explicit CSV → DB division aliases */
const DIVISION_ALIASES = {
  'bandhavgarh tr': 'Bandhavgarh NP',
  'bandhavgarh np': 'Bandhavgarh NP',
  'sanjay tr': 'Sanjay National Park',
  'sanjay national park': 'Sanjay National Park',
  'kanha tr': 'Kanha National Park (Buffer)',
  'kanha national park (buffer)': 'Kanha National Park (Buffer)',
  'kanha national park (core)': 'Kanha National Park (Core)',
  anuppur: 'Anuppur',
  umaria: 'Umaria',
  'north shahdol': 'North Shahdol',
  'south shahdol': 'South Shahdol',
  satna: 'Satna',
  sidhi: 'Sidhi',
  singrauli: 'Singrauli',
  'east mandla': 'East Mandla',
  'south balaghat': 'South Balaghat',
  'west mandala': 'West Mandala',
  'west mandla': 'West Mandala',
};

/** CSV range token → preferred DB range name fragment overrides */
const RANGE_ALIASES = {
  manpur: 'Manpur Buffer',
  khitauli: 'Khitauli Core',
  magdhi: 'Magdhi Core',
  kallwah: 'Kallwah Core',
  pataur: 'Pataur Core',
  tala: 'Tala Core',
  dhamokhar: 'Dhamokhar Buffer',
  'panpatha buffer': 'Panpatha Buffer',
  'jaisingh nagar': 'Jaisinghnagar',
  jaisinghnagar: 'Jaisinghnagar',
  ghunghuti: 'Ghunghunti',
  ghunghunti: 'Ghunghunti',
  nowrozabad: 'Nourozabad',
  nourozabad: 'Nourozabad',
  podi: 'Pondi',
  pondi: 'Pondi',
  dubri: 'Dubari',
  dubari: 'Dubari',
  'east beohari': 'Beohari East',
  'west beohari': 'Beohari West',
  'beohari east': 'Beohari East',
  'beohari west': 'Beohari West',
  budhar: 'Burhar',
  burhar: 'Burhar',
  khannaudhi: 'Khannoudhi',
  khannoudhi: 'Khannoudhi',
  'rajendra gram': 'Rajendra Gram',
  'beohari buffer': 'Beohari Buffer',
  'bhuimand buffer': 'Bhuimand Buffer',
  bhuimad: 'Bhuimand Buffer',
  bhuimand: 'Bhuimand Buffer',
};

/** CSV beat token → preferred DB beat name (within resolved range) */
const BEAT_ALIASES = {
  'north kallwah': 'Kallwah North',
  'south kallwah': 'Kallwah South',
  chachpur: 'Chenchpur',
  chechpur: 'Chenchpur',
  'south majkheta': 'Majhkheta South',
  majkheta: 'Majhkheta South',
  'north mainwah': 'Mahainwah North',
  'west mainwah': 'Mahainwah West',
  'mehnwah north': 'Mahainwah North',
  mainwah: 'Mahainwah North',
  janad: 'Janar',
  madhu: 'Malhara',
  madau: 'Malhara',
};

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function stripGeoSuffix(s) {
  return norm(s)
    .replace(/\b(core|buffer|tr|np|national park|sanctuary)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseCsv(text) {
  const rows = [];
  let i = 0;
  let field = '';
  let row = [];
  let inQuotes = false;
  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      pushField();
      i++;
      continue;
    }
    if (c === '\n') {
      pushField();
      pushRow();
      i++;
      continue;
    }
    if (c === '\r') {
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length || row.length) {
    pushField();
    pushRow();
  }
  const header = rows[0].map((h) => h.replace(/^\uFEFF/, '').trim());
  return rows.slice(1).filter((r) => r.some((c) => c && c.trim())).map((r) => {
    const obj = {};
    header.forEach((h, idx) => {
      obj[h] = (r[idx] ?? '').trim();
    });
    return obj;
  });
}

function toPhone10(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return null;
}

function mapRole(post) {
  const key = norm(post);
  return ROLE_MAP[key] || null;
}

const geoRows = JSON.parse(readFileSync(geoPath, 'utf8'));
const divisions = new Map(); // name -> {id, name, ranges: Map}
for (const g of geoRows) {
  if (!divisions.has(g.division_name)) {
    divisions.set(g.division_name, {
      id: g.division_id,
      name: g.division_name,
      ranges: new Map(),
    });
  }
  const div = divisions.get(g.division_name);
  if (!div.ranges.has(g.range_id)) {
    div.ranges.set(g.range_id, {
      id: g.range_id,
      name: g.range_name,
      beats: [],
      lat: g.lat,
      lng: g.lng,
    });
  }
  const range = div.ranges.get(g.range_id);
  if (g.beat_id) {
    range.beats.push({
      id: g.beat_id,
      name: g.beat_name,
      lat: g.lat,
      lng: g.lng,
    });
    if (range.lat == null && g.lat != null) {
      range.lat = g.lat;
      range.lng = g.lng;
    }
  }
}

function resolveDivision(csvDiv) {
  const n = norm(csvDiv);
  if (!n || n === 'na') return { status: 'empty' };
  if (DIVISION_ALIASES[n]) {
    const name = DIVISION_ALIASES[n];
    return { status: 'matched', division: divisions.get(name) };
  }
  // exact / strip-suffix scan
  for (const [name, div] of divisions) {
    if (norm(name) === n || stripGeoSuffix(name) === stripGeoSuffix(csvDiv)) {
      return { status: 'matched', division: div };
    }
  }
  return { status: 'unmatched', csv: csvDiv };
}

function resolveRange(division, csvRange) {
  const raw = (csvRange || '').trim();
  if (!raw || norm(raw) === 'na') return { status: 'empty' };
  if (!division) return { status: 'skipped_no_division', csv: raw };

  const alias = RANGE_ALIASES[norm(raw)];
  const candidates = [...division.ranges.values()];

  if (alias) {
    const hit = candidates.find((r) => r.name === alias);
    if (hit) return { status: 'matched', range: hit, via: 'alias' };
  }

  const target = stripGeoSuffix(raw);
  const exact = candidates.find((r) => norm(r.name) === norm(raw));
  if (exact) return { status: 'matched', range: exact, via: 'exact' };

  const stripped = candidates.filter((r) => stripGeoSuffix(r.name) === target);
  if (stripped.length === 1) return { status: 'matched', range: stripped[0], via: 'strip' };
  if (stripped.length > 1) {
    // Prefer Buffer for CSV names that say Buffer, else Core, else first
    const prefer = norm(raw).includes('buffer')
      ? stripped.find((r) => /buffer/i.test(r.name))
      : stripped.find((r) => /core/i.test(r.name)) || stripped[0];
    return { status: 'matched', range: prefer, via: 'strip-ambiguous', candidates: stripped.map((r) => r.name) };
  }

  // starts-with / includes soft match
  const soft = candidates.filter(
    (r) =>
      stripGeoSuffix(r.name).startsWith(target) ||
      target.startsWith(stripGeoSuffix(r.name)) ||
      stripGeoSuffix(r.name).includes(target) ||
      target.includes(stripGeoSuffix(r.name))
  );
  if (soft.length === 1) return { status: 'matched', range: soft[0], via: 'soft' };

  return { status: 'unmatched', csv: raw };
}

function resolveBeat(range, csvBeat) {
  const raw = (csvBeat || '').trim();
  if (!raw || ['na', 'n/a', 'transferred', '-'].includes(norm(raw))) {
    return { status: 'empty' };
  }
  if (!range) return { status: 'skipped_no_range', csv: raw };

  const beats = range.beats;
  const alias = BEAT_ALIASES[norm(raw)];
  if (alias) {
    const hit = beats.find((b) => b.name === alias || norm(b.name) === norm(alias));
    if (hit) return { status: 'matched', beat: hit, via: 'alias' };
  }

  const target = stripGeoSuffix(raw);
  const exact = beats.find((b) => norm(b.name) === norm(raw));
  if (exact) return { status: 'matched', beat: exact, via: 'exact' };

  const stripped = beats.filter((b) => stripGeoSuffix(b.name) === target);
  if (stripped.length === 1) return { status: 'matched', beat: stripped[0], via: 'strip' };

  const soft = beats.filter(
    (b) =>
      stripGeoSuffix(b.name).includes(target) ||
      target.includes(stripGeoSuffix(b.name))
  );
  if (soft.length === 1) return { status: 'matched', beat: soft[0], via: 'soft' };
  if (soft.length > 1) {
    // pick shortest name distance
    soft.sort((a, b) => Math.abs(a.name.length - raw.length) - Math.abs(b.name.length - raw.length));
    return { status: 'matched', beat: soft[0], via: 'soft-ambiguous', candidates: soft.map((b) => b.name) };
  }

  return { status: 'unmatched', csv: raw };
}

/** Role-scope IDs: beat_guard→beat, range_officer→range, dfo→division; others global */
function scopeTerritory(role, division, range, beat) {
  if (role === 'beat_guard') {
    if (beat) {
      return {
        division_id: division?.id ?? null,
        range_id: range?.id ?? null,
        beat_id: beat.id,
        division_name: division?.name ?? null,
        range_name: range?.name ?? null,
        beat_name: beat.name,
      };
    }
    // Prefer range/division over Global when beat unmatched
    return {
      division_id: division?.id ?? null,
      range_id: range?.id ?? null,
      beat_id: null,
      division_name: division?.name ?? null,
      range_name: range?.name ?? null,
      beat_name: null,
    };
  }
  if (role === 'range_officer') {
    return {
      division_id: division?.id ?? null,
      range_id: range?.id ?? null,
      beat_id: null,
      division_name: division?.name ?? null,
      range_name: range?.name ?? null,
      beat_name: null,
    };
  }
  if (role === 'dfo') {
    return {
      division_id: division?.id ?? null,
      range_id: null,
      beat_id: null,
      division_name: division?.name ?? null,
      range_name: null,
      beat_name: null,
    };
  }
  // admin / volunteer / others → Global for now
  return {
    division_id: null,
    range_id: null,
    beat_id: null,
    division_name: null,
    range_name: null,
    beat_name: null,
  };
}

const csvRows = parseCsv(readFileSync(csvPath, 'utf8'));
const report = {
  total_csv_rows: csvRows.length,
  role_counts: {},
  skipped: [],
  geo: {
    division_matched: 0,
    division_unmatched: 0,
    range_matched: 0,
    range_unmatched: 0,
    beat_matched: 0,
    beat_unmatched: 0,
    unmatched_divisions: {},
    unmatched_ranges: {},
    unmatched_beats: {},
  },
  duplicate_phones_dropped: [],
};

const byPhone = new Map();
const mapped = [];

for (const r of csvRows) {
  const sr = r['Sr. No.'] || '';
  const first = (r.Name || '').trim();
  const last = (r.Surname || '').trim();
  const post = (r.Post || '').trim();
  const role = mapRole(post);
  const phone10 = toPhone10(r['Phone Number (WhatsApp)']);

  if (!role) {
    report.skipped.push({ sr, reason: 'unknown_post', post, name: `${first} ${last}` });
    continue;
  }
  if (!phone10) {
    report.skipped.push({
      sr,
      reason: 'bad_phone',
      phone: r['Phone Number (WhatsApp)'],
      name: `${first} ${last}`,
    });
    continue;
  }

  report.role_counts[role] = (report.role_counts[role] || 0) + 1;

  const divRes = resolveDivision(r.Division);
  if (divRes.status === 'matched') report.geo.division_matched++;
  else if (divRes.status === 'unmatched') {
    report.geo.division_unmatched++;
    report.geo.unmatched_divisions[r.Division] =
      (report.geo.unmatched_divisions[r.Division] || 0) + 1;
  }

  const rangeRes = resolveRange(divRes.division, r.Range);
  if (rangeRes.status === 'matched') report.geo.range_matched++;
  else if (rangeRes.status === 'unmatched') {
    report.geo.range_unmatched++;
    const key = `${r.Division}|${r.Range}`;
    report.geo.unmatched_ranges[key] = (report.geo.unmatched_ranges[key] || 0) + 1;
  }

  const beatRes = resolveBeat(rangeRes.range, r.Beat);
  if (beatRes.status === 'matched') report.geo.beat_matched++;
  else if (beatRes.status === 'unmatched') {
    report.geo.beat_unmatched++;
    const key = `${r.Division}|${r.Range}|${r.Beat}`;
    report.geo.unmatched_beats[key] = (report.geo.unmatched_beats[key] || 0) + 1;
  }

  const beat = beatRes.beat;
  const range = rangeRes.range;
  const division = divRes.division;
  const scoped = scopeTerritory(role, division, range, beat);
  const lat = beat?.lat ?? range?.lat ?? 23.2599;
  const lng = beat?.lng ?? range?.lng ?? 77.4126;

  const entry = {
    csv_sr: sr,
    phone: phone10,
    role,
    first_name: first || 'Unknown',
    last_name: last || 'User',
    post_raw: post,
    otp: '123456',
    ...scoped,
    latitude: lat,
    longitude: lng,
    csv_division: r.Division || null,
    csv_range: r.Range || null,
    csv_beat: r.Beat || null,
    csv_circle: r.Circle || null,
    geo_match: {
      division: divRes.status,
      range: rangeRes.status,
      beat: beatRes.status,
    },
  };

  if (byPhone.has(phone10)) {
    report.duplicate_phones_dropped.push({
      phone: phone10,
      kept: byPhone.get(phone10).csv_sr,
      dropped: sr,
      names: [`${byPhone.get(phone10).first_name} ${byPhone.get(phone10).last_name}`, `${first} ${last}`],
    });
    // Prefer the row with more specific geo (beat > range > division)
    const prev = byPhone.get(phone10);
    const score = (e) => (e.beat_id ? 3 : e.range_id ? 2 : e.division_id ? 1 : 0);
    if (score(entry) > score(prev)) {
      byPhone.set(phone10, entry);
    }
    continue;
  }
  byPhone.set(phone10, entry);
}

for (const entry of byPhone.values()) mapped.push(entry);

// Staging system account for historical sightings authorship fallback
const systemAdmin = {
  csv_sr: 'SYSTEM',
  phone: '9999990001',
  role: 'admin',
  first_name: 'Staging',
  last_name: 'System',
  post_raw: 'System',
  otp: '123456',
  division_id: null,
  range_id: null,
  beat_id: null,
  division_name: null,
  range_name: null,
  beat_name: null,
  latitude: 23.2599,
  longitude: 77.4126,
  csv_division: null,
  csv_range: null,
  csv_beat: null,
  csv_circle: null,
  geo_match: { division: 'n/a', range: 'n/a', beat: 'n/a' },
  is_system: true,
};
if (!byPhone.has(systemAdmin.phone)) {
  mapped.unshift(systemAdmin);
}

report.seed_count = mapped.length;
report.unique_phones = byPhone.size;
report.notes = [
  'Role mapping: ACF→dfo, Range Officer/Dy Ranger→range_officer, Forest Guard→beat_guard, Suraksha Shramik/Driver→volunteer, Computer Operator→admin',
  'Phones normalized to 10-digit local; auth seed uses +91 prefix',
  'Test OTP for all seeded users: 123456',
  'East Mandla / South Balaghat / West Mandala are created in geo_* when missing (see seed-missing-geo-from-csv.mjs)',
  'Role-scoped assignments: beat_guard→beat, range_officer→range, dfo→division; volunteer/admin→Global',
  'Duplicate phones: keep the row with the most specific territory match',
];

writeFileSync(join(outDir, 'staging-users.seed.json'), JSON.stringify(mapped, null, 2));
writeFileSync(join(outDir, 'staging-users.mapping-report.json'), JSON.stringify(report, null, 2));

const md = `# Staging users mapping report

- CSV rows: **${report.total_csv_rows}**
- Seedable unique phones (+ system admin): **${report.seed_count}**
- Skipped: **${report.skipped.length}**
- Duplicate phones resolved: **${report.duplicate_phones_dropped.length}**

## Role counts (pre-dedupe)

${Object.entries(report.role_counts)
  .map(([k, v]) => `- \`${k}\`: ${v}`)
  .join('\n')}

## Geography match

| Level | Matched | Unmatched |
|-------|---------|-----------|
| Division | ${report.geo.division_matched} | ${report.geo.division_unmatched} |
| Range | ${report.geo.range_matched} | ${report.geo.range_unmatched} |
| Beat | ${report.geo.beat_matched} | ${report.geo.beat_unmatched} |

### Unmatched divisions
${Object.entries(report.geo.unmatched_divisions)
  .sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `- ${k}: ${v}`)
  .join('\n') || '_none_'}

### Top unmatched ranges
${Object.entries(report.geo.unmatched_ranges)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 25)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join('\n') || '_none_'}

## Skipped rows
${report.skipped.map((s) => `- #${s.sr} ${s.name}: ${s.reason} ${s.post || s.phone || ''}`).join('\n') || '_none_'}
`;

writeFileSync(join(outDir, 'staging-users.mapping-report.md'), md);

console.log(`Wrote ${mapped.length} seed users → ${join(outDir, 'staging-users.seed.json')}`);
console.log(`Report → ${join(outDir, 'staging-users.mapping-report.md')}`);
console.log(JSON.stringify({
  seed_count: report.seed_count,
  skipped: report.skipped.length,
  duplicates: report.duplicate_phones_dropped.length,
  geo: {
    division_matched: report.geo.division_matched,
    division_unmatched: report.geo.division_unmatched,
    range_matched: report.geo.range_matched,
    range_unmatched: report.geo.range_unmatched,
    beat_matched: report.geo.beat_matched,
    beat_unmatched: report.geo.beat_unmatched,
  },
  unmatched_divisions: report.geo.unmatched_divisions,
}, null, 2));
