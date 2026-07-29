/**
 * Insert missing CSV divisions/ranges/beats into geo_* tables.
 * Creates East Mandla, South Balaghat, West Mandala (and any other CSV-only
 * division names) with placeholder centroids so users can be assigned.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/seed-missing-geo-from-csv.mjs "../Go live Prep - Staging/Staging Users.csv"
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { randomUUID } from 'crypto';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const csvPath = process.argv[2];
const outGeoPath = process.argv[3]; // optional geo-reference.json refresh path

if (!url || !key || !csvPath) {
  console.error(
    'Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-missing-geo-from-csv.mjs <users.csv> [geo-reference.json]'
  );
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

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

function isBlank(s) {
  const n = String(s || '')
    .trim()
    .toLowerCase();
  return !n || ['na', 'n/a', '-', 'transferred'].includes(n);
}

/** Approximate centroids for MP forest divisions not in original geo seed */
const DIVISION_CENTROIDS = {
  'East Mandla': { lat: 22.598, lng: 80.371 },
  'South Balaghat': { lat: 21.805, lng: 80.185 },
  'West Mandala': { lat: 22.598, lng: 80.371 },
  'West Mandla': { lat: 22.598, lng: 80.371 },
};

const csvRows = parseCsv(readFileSync(csvPath, 'utf8'));

const { data: existingDivs, error: divErr } = await sb.from('geo_divisions').select('id, name');
if (divErr) throw divErr;
const divByName = new Map(existingDivs.map((d) => [d.name, d.id]));

const { data: existingRanges, error: rangeErr } = await sb
  .from('geo_ranges')
  .select('id, name, division_id');
if (rangeErr) throw rangeErr;
const rangeKey = (divisionId, name) => `${divisionId}::${name}`;
const rangeByKey = new Map(existingRanges.map((r) => [rangeKey(r.division_id, r.name), r.id]));

const { data: existingBeats, error: beatErr } = await sb.from('geo_beats').select('id, name, range_id');
if (beatErr) throw beatErr;
const beatKey = (rangeId, name) => `${rangeId}::${name}`;
const beatByKey = new Map(existingBeats.map((b) => [beatKey(b.range_id, b.name), b.id]));

const tree = new Map(); // divName -> Map(rangeName -> Set(beatName))
for (const r of csvRows) {
  const div = (r.Division || '').trim();
  if (isBlank(div)) continue;
  if (!tree.has(div)) tree.set(div, new Map());
  const ranges = tree.get(div);
  const rangeName = isBlank(r.Range) ? null : r.Range.trim();
  if (!rangeName) continue;
  if (!ranges.has(rangeName)) ranges.set(rangeName, new Set());
  const beatName = isBlank(r.Beat) ? null : r.Beat.trim();
  if (beatName) ranges.get(rangeName).add(beatName);
}

let createdDivs = 0;
let createdRanges = 0;
let createdBeats = 0;

for (const [divName, ranges] of tree) {
  let divisionId = divByName.get(divName);
  if (!divisionId) {
    // Only create divisions that are missing (CSV names not already in DB)
    // Skip alias-style names that map to existing divisions via mapper aliases
    const ALREADY_ALIASED = new Set([
      'Bandhavgarh TR',
      'Bandhavgarh NP',
      'Sanjay TR',
      'Sanjay National Park',
      'Kanha TR',
      'Kanha National Park (Buffer)',
      'Kanha National Park (Core)',
    ]);
    if (ALREADY_ALIASED.has(divName) || [...divByName.keys()].some((n) => n.toLowerCase() === divName.toLowerCase())) {
      continue;
    }

    divisionId = randomUUID();
    const c = DIVISION_CENTROIDS[divName] || { lat: 22.97, lng: 78.65 };
    const { error } = await sb.from('geo_divisions').insert({
      id: divisionId,
      name: divName,
      code: divName
        .split(/\s+/)
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 8),
      state: 'Madhya Pradesh',
    });
    if (error) {
      console.error('Failed division', divName, error.message);
      continue;
    }
    divByName.set(divName, divisionId);
    createdDivs++;
    console.log('Created division', divName);
  }

  for (const [rangeName, beats] of ranges) {
    let rangeId = rangeByKey.get(rangeKey(divisionId, rangeName));
    if (!rangeId) {
      rangeId = randomUUID();
      const c = DIVISION_CENTROIDS[divName] || { lat: 22.97, lng: 78.65 };
      const { error } = await sb.from('geo_ranges').insert({
        id: rangeId,
        division_id: divisionId,
        name: rangeName,
        code: rangeName
          .split(/\s+/)
          .map((w) => w[0])
          .join('')
          .toUpperCase()
          .slice(0, 8),
      });
      if (error) {
        console.error('Failed range', divName, rangeName, error.message);
        continue;
      }
      rangeByKey.set(rangeKey(divisionId, rangeName), rangeId);
      createdRanges++;
    }

    for (const beatName of beats) {
      if (beatByKey.has(beatKey(rangeId, beatName))) continue;
      const beatId = randomUUID();
      const c = DIVISION_CENTROIDS[divName] || { lat: 22.97, lng: 78.65 };
      const { error } = await sb.from('geo_beats').insert({
        id: beatId,
        range_id: rangeId,
        name: beatName,
        code: beatName
          .replace(/[^a-zA-Z0-9]+/g, '')
          .slice(0, 10)
          .toUpperCase(),
      });
      if (error) {
        console.error('Failed beat', divName, rangeName, beatName, error.message);
        continue;
      }
      beatByKey.set(beatKey(rangeId, beatName), beatId);
      createdBeats++;
    }
  }
}

console.log(
  JSON.stringify({ createdDivs, createdRanges, createdBeats, totalDivisions: divByName.size }, null, 2)
);

if (outGeoPath) {
  // Refresh geo-reference join used by mapper
  const { data: rows, error } = await sb
    .from('geo_beats')
    .select(
      `
      id, name,
      geo_ranges!inner (
        id, name,
        geo_divisions!inner ( id, name )
      )
    `
    );
  if (error) throw error;
  const flat = (rows || []).map((b) => ({
    beat_id: b.id,
    beat_name: b.name,
    range_id: b.geo_ranges.id,
    range_name: b.geo_ranges.name,
    division_id: b.geo_ranges.geo_divisions.id,
    division_name: b.geo_ranges.geo_divisions.name,
    lat: null,
    lng: null,
  }));
  // Also include ranges with zero beats
  const { data: allRanges } = await sb.from('geo_ranges').select('id, name, division_id, geo_divisions(id, name)');
  for (const r of allRanges || []) {
    if (flat.some((f) => f.range_id === r.id)) continue;
    flat.push({
      beat_id: null,
      beat_name: null,
      range_id: r.id,
      range_name: r.name,
      division_id: r.geo_divisions?.id || r.division_id,
      division_name: r.geo_divisions?.name || null,
      lat: null,
      lng: null,
    });
  }
  writeFileSync(outGeoPath, JSON.stringify(flat, null, 2));
  console.log(`Wrote geo reference → ${outGeoPath} (${flat.length} rows)`);
}
