/**
 * Map Historical Sightings.csv → Eravat reports/observations/conflict_damages seed JSON.
 *
 * Usage:
 *   node scripts/map-staging-sightings.mjs \
 *     "../Go live Prep - Staging/Historical Sightings.csv" \
 *     "../Go live Prep - Staging/generated/geo-reference.json" \
 *     "../Go live Prep - Staging/generated/staging-users.seed.json" \
 *     "../Go live Prep - Staging/generated"
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const [, , csvPath, geoPath, usersPath, outDirArg] = process.argv;
if (!csvPath || !geoPath || !usersPath) {
  console.error(
    'Usage: node scripts/map-staging-sightings.mjs <sightings.csv> <geo-reference.json> <users.seed.json> [outDir]'
  );
  process.exit(1);
}

const outDir =
  outDirArg ||
  join(dirname(fileURLToPath(import.meta.url)), '../../Go live Prep - Staging/generated');
mkdirSync(outDir, { recursive: true });

const DETAIL_TO_INDIRECT = {
  pugmark: 'Pugmark',
  dung: 'Dung',
  brokenbranches: 'Broken Branches',
  elephantsound: 'Sound',
  sound: 'Sound',
  eyewitness: 'Eyewitness',
};

const DETAIL_TO_LOSS = {
  housedamage: 'property',
  fencedamage: 'fencing',
  cropdamage: 'crop',
  graindamage: 'crop',
  anyotherdamage: 'Other',
};

const BEARING = {
  north: 0,
  northeast: 45,
  east: 90,
  southeast: 135,
  south: 180,
  southwest: 225,
  west: 270,
  northwest: 315,
  northWest: 315,
  southWest: 225,
  northEast: 45,
  southEast: 135,
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
  const header = rows[0].map((h) => h.replace(/^\uFEFF/, '').replace(/^"|"$/g, '').trim());
  return rows
    .slice(1)
    .filter((r) => r.some((c) => c && c.trim()))
    .map((r) => {
      const obj = {};
      header.forEach((h, idx) => {
        obj[h] = (r[idx] ?? '').trim();
      });
      return obj;
    });
}

function intOr(v, fallback = 0) {
  if (v === '' || v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : fallback;
}

function truthyFlag(v) {
  const s = String(v || '').trim();
  return s === '1' || s.toLowerCase() === 'true' || s.toLowerCase() === 'yes';
}

function parseTs(dateStr, timeStr) {
  // DD/MM/YYYY + HH:MM:SS (local India assumed → store as +05:30)
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dateStr || '');
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const t = (timeStr || '00:00:00').padStart(8, '0');
  const iso = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T${t}+05:30`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const DIVISION_ALIASES = {
  'bandhavgarh tr': 'Bandhavgarh NP',
  'sanjay tr': 'Sanjay National Park',
  'kanha tr': 'Kanha National Park (Buffer)',
  anuppur: 'Anuppur',
  umaria: 'Umaria',
  'north shahdol': 'North Shahdol',
  'south shahdol': 'South Shahdol',
};

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
  ghunghuti: 'Ghunghunti',
  nowrozabad: 'Nourozabad',
  podi: 'Pondi',
  dubri: 'Dubari',
  'east beohari': 'Beohari East',
  'west beohari': 'Beohari West',
  budhar: 'Burhar',
  khannaudhi: 'Khannoudhi',
};

const geoRows = JSON.parse(readFileSync(geoPath, 'utf8'));
const divisions = new Map();
for (const g of geoRows) {
  if (!divisions.has(g.division_name)) {
    divisions.set(g.division_name, { id: g.division_id, name: g.division_name, ranges: new Map() });
  }
  const div = divisions.get(g.division_name);
  if (!div.ranges.has(g.range_id)) {
    div.ranges.set(g.range_id, { id: g.range_id, name: g.range_name, beats: [] });
  }
  if (g.beat_id) {
    div.ranges.get(g.range_id).beats.push({ id: g.beat_id, name: g.beat_name });
  }
}

function resolveDivision(csvDiv) {
  const n = norm(csvDiv);
  if (!n || n === 'na') return null;
  if (DIVISION_ALIASES[n] && divisions.has(DIVISION_ALIASES[n])) return divisions.get(DIVISION_ALIASES[n]);
  for (const [name, div] of divisions) {
    if (norm(name) === n || stripGeoSuffix(name) === stripGeoSuffix(csvDiv)) return div;
  }
  return null;
}

function resolveRange(division, csvRange) {
  if (!division) return null;
  const raw = (csvRange || '').trim();
  if (!raw || norm(raw) === 'na') return null;
  const candidates = [...division.ranges.values()];
  const alias = RANGE_ALIASES[norm(raw)];
  if (alias) {
    const hit = candidates.find((r) => r.name === alias);
    if (hit) return hit;
  }
  const exact = candidates.find((r) => norm(r.name) === norm(raw));
  if (exact) return exact;
  const target = stripGeoSuffix(raw);
  const stripped = candidates.filter((r) => stripGeoSuffix(r.name) === target);
  if (stripped.length) {
    return (
      (norm(raw).includes('buffer')
        ? stripped.find((r) => /buffer/i.test(r.name))
        : stripped.find((r) => /core/i.test(r.name))) || stripped[0]
    );
  }
  // Panpatha Core isn't a DB range — map to Magdhi Core as closest core in Bandhavgarh if present
  if (target === 'panpatha' && norm(raw).includes('core')) {
    return candidates.find((r) => /magdhi/i.test(r.name)) || null;
  }
  return null;
}

function resolveBeat(range, csvBeat) {
  if (!range) return null;
  const raw = (csvBeat || '').trim();
  if (!raw || ['na', 'n/a', '-'].includes(norm(raw))) return null;
  const exact = range.beats.find((b) => norm(b.name) === norm(raw));
  if (exact) return exact;
  const target = stripGeoSuffix(raw.replace(/'/g, ''));
  const soft = range.beats.filter(
    (b) => stripGeoSuffix(b.name).includes(target) || target.includes(stripGeoSuffix(b.name))
  );
  if (soft.length) {
    soft.sort((a, b) => Math.abs(a.name.length - raw.length) - Math.abs(b.name.length - raw.length));
    return soft[0];
  }
  return null;
}

function nameKey(s) {
  return norm(s).replace(/\s+/g, ' ');
}

const seedUsers = JSON.parse(readFileSync(usersPath, 'utf8'));
const usersByName = new Map();
let systemUser = seedUsers.find((u) => u.is_system) || seedUsers.find((u) => u.role === 'admin');
for (const u of seedUsers) {
  const full = nameKey(`${u.first_name} ${u.last_name}`);
  if (!usersByName.has(full)) usersByName.set(full, u);
  // also first+last reversed variants / collapsed
  usersByName.set(nameKey(`${u.last_name} ${u.first_name}`), u);
}

function matchAuthor(createdBy) {
  const key = nameKey(createdBy);
  if (!key || key === 'admin') return { user: systemUser, via: 'system' };
  if (usersByName.has(key)) return { user: usersByName.get(key), via: 'exact' };
  // soft: all tokens present
  const tokens = key.split(' ').filter(Boolean);
  let best = null;
  let bestScore = 0;
  for (const [nk, u] of usersByName) {
    const ut = nk.split(' ');
    const score = tokens.filter((t) => ut.includes(t)).length;
    if (score >= Math.min(2, tokens.length) && score > bestScore) {
      best = u;
      bestScore = score;
    }
  }
  if (best) return { user: best, via: 'soft' };
  return { user: systemUser, via: 'fallback_system' };
}

function mapDetails(detailStr) {
  const parts = String(detailStr || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const indirect = [];
  const loss = [];
  for (const p of parts) {
    const k = norm(p).replace(/\s+/g, '');
    if (DETAIL_TO_INDIRECT[k]) indirect.push(DETAIL_TO_INDIRECT[k]);
    else if (DETAIL_TO_LOSS[k]) loss.push(DETAIL_TO_LOSS[k]);
  }
  return { indirect: [...new Set(indirect)], loss: [...new Set(loss)] };
}

function bearingFrom(dir) {
  if (!dir) return null;
  const k = String(dir).trim();
  if (BEARING[k] != null) return BEARING[k];
  const n = norm(k).replace(/\s+/g, '');
  return BEARING[n] ?? null;
}

const csvRows = parseCsv(readFileSync(csvPath, 'utf8'));
const report = {
  total: csvRows.length,
  authored_exact: 0,
  authored_soft: 0,
  authored_fallback: 0,
  beat_matched: 0,
  beat_unmatched: 0,
  skipped_bad_coords: 0,
  skipped_bad_date: 0,
  obs_types: {},
  damages: 0,
};

const mapped = [];

for (const r of csvRows) {
  const lat = Number(r.Latitude);
  const lng = Number(r.Longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    report.skipped_bad_coords++;
    continue;
  }
  const ts = parseTs(r.Date, r.Time);
  if (!ts) {
    report.skipped_bad_date++;
    continue;
  }

  const division = resolveDivision(r.Division);
  const range = resolveRange(division, r.Range);
  const beat = resolveBeat(range, r.Beat);
  if (beat) report.beat_matched++;
  else report.beat_unmatched++;

  const { user, via } = matchAuthor(r['Created By']);
  if (via === 'exact') report.authored_exact++;
  else if (via === 'soft') report.authored_soft++;
  else report.authored_fallback++;

  const details = mapDetails(r['Sighting Type Detail']);
  const crop = truthyFlag(r['Crop Damage']) || truthyFlag(r['Grain Damage']);
  const house = truthyFlag(r['House Damage']);
  const injury = truthyFlag(r.Injury);
  const death = truthyFlag(r.Death);
  if (crop) details.loss.push('crop');
  if (house) details.loss.push('property');
  details.loss = [...new Set(details.loss)];

  const sightingType = norm(r['Sighting Type']);
  let obsType = 'direct_sighting';
  if (sightingType === 'indirect') {
    obsType = details.loss.length && !details.indirect.length ? 'conflict_loss' : 'indirect_sign';
  } else if (sightingType === 'direct') {
    obsType = 'direct_sighting';
  }
  // If only damages and marked indirect with damage detail, prefer conflict_loss
  if (details.loss.length && sightingType === 'indirect' && details.indirect.length === 0) {
    obsType = 'conflict_loss';
  }

  report.obs_types[obsType] = (report.obs_types[obsType] || 0) + 1;

  const male = intOr(r['Male Count']);
  const female = intOr(r['Female Count']);
  const calf = intOr(r['Calf Count']);
  const unknown = intOr(r['Unknown Count']);
  const total =
    intOr(r['Total Count'], null) ??
    intOr(r['No. Of Elephants'], null) ??
    male + female + calf + unknown;

  const originalCreator = (r['Created By'] || '').trim();
  const noteParts = [];
  if (r.Description) noteParts.push(r.Description);
  noteParts.push(`[historical import csv_id=${r.ID}]`);
  if (via === 'fallback_system' || via === 'system') {
    noteParts.push(`[original_creator=${originalCreator || 'unknown'}]`);
  }

  const damages = [];
  for (const cat of details.loss) {
    const mappedCat =
      cat === 'fencing' || cat === 'Other' || cat === 'property'
        ? cat === 'fencing' || cat === 'Other'
          ? 'property'
          : 'property'
        : cat === 'crop'
          ? 'crop'
          : null;
    // loss_category enum: crop|property|livestock|human_injury|human_death
    let category = null;
    if (cat === 'crop') category = 'crop';
    else if (['property', 'fencing', 'Other'].includes(cat)) category = 'property';
    else if (cat === 'livestock') category = 'livestock';
    if (category) {
      damages.push({
        category,
        description: `Imported from historical sighting (${cat})`,
        estimated_value: null,
      });
    }
  }
  if (injury) {
    damages.push({ category: 'human_injury', description: 'Imported injury flag', estimated_value: null });
  }
  if (death) {
    const md = intOr(r['Male Death Count']);
    const fd = intOr(r['Female Death Count']);
    const cd = intOr(r['Children Death Count']);
    damages.push({
      category: 'human_death',
      description: `Imported death flag (M=${md}, F=${fd}, C=${cd})`,
      estimated_value: null,
    });
  }
  if (damages.length) report.damages++;

  const id = randomUUID();
  mapped.push({
    id,
    csv_id: r.ID,
    user_phone: user.phone,
    user_name: `${user.first_name} ${user.last_name}`,
    author_match: via,
    original_creator: originalCreator,
    device_timestamp: ts,
    latitude: lat,
    longitude: lng,
    beat_id: beat?.id ?? null,
    beat_name: beat?.name ?? null,
    range_name: range?.name ?? null,
    division_name: division?.name ?? null,
    status: 'synced',
    notes: noteParts.join('\n'),
    observation: {
      type: obsType,
      male_count: male,
      female_count: female,
      calf_count: calf,
      unknown_count: unknown,
      total_elephants: total,
      compass_bearing: bearingFrom(r['Movement Direction']),
      indirect_sign_details: details.indirect,
      conflict_loss_details: details.loss,
    },
    damages,
  });
}

writeFileSync(join(outDir, 'staging-sightings.seed.json'), JSON.stringify(mapped, null, 2));
writeFileSync(join(outDir, 'staging-sightings.mapping-report.json'), JSON.stringify(report, null, 2));

const md = `# Staging sightings mapping report

- CSV rows: **${report.total}**
- Mapped: **${mapped.length}**
- Skipped bad coords: ${report.skipped_bad_coords}
- Skipped bad date: ${report.skipped_bad_date}
- Beat matched: ${report.beat_matched} / unmatched: ${report.beat_unmatched}
- Authorship exact/soft/fallback: ${report.authored_exact} / ${report.authored_soft} / ${report.authored_fallback}
- Rows with damages: ${report.damages}
- Observation types: ${JSON.stringify(report.obs_types)}
`;
writeFileSync(join(outDir, 'staging-sightings.mapping-report.md'), md);

console.log(JSON.stringify({ mapped: mapped.length, ...report }, null, 2));
console.log(`Wrote ${join(outDir, 'staging-sightings.seed.json')}`);
