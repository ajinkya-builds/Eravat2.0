/**
 * Import mapped historical sightings into staging Supabase.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/seed-staging-sightings.mjs \
 *     path/to/staging-sightings.seed.json \
 *     path/to/staging-users.seed.seed-results.json
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sightingsFile = process.argv[2];
const resultsFile = process.argv[3];
const limit = process.env.SEED_LIMIT ? Number(process.env.SEED_LIMIT) : null;

if (!url || !key || !sightingsFile || !resultsFile) {
  console.error(
    'Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-staging-sightings.mjs sightings.json user-seed-results.json'
  );
  process.exit(1);
}

function cryptoUuidFrom(input) {
  const hex = createHash('sha256').update(input).digest('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0')}${hex.slice(18, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

const sightings = JSON.parse(readFileSync(sightingsFile, 'utf8'));
const userResults = JSON.parse(readFileSync(resultsFile, 'utf8'));
const phoneToId = userResults.ids_by_phone || {};
const cohort = limit ? sightings.slice(0, limit) : sightings;
const sb = createClient(url, key, { auth: { persistSession: false } });

const summary = { reports: 0, observations: 0, damages: 0, failed: [] };

const BATCH = 50;
for (let i = 0; i < cohort.length; i += BATCH) {
  const chunk = cohort.slice(i, i + BATCH);
  const reportRows = [];
  const obsRows = [];
  const damageRows = [];

  for (const s of chunk) {
    const userId = phoneToId[s.user_phone];
    if (!userId) {
      summary.failed.push({ csv_id: s.csv_id, error: `no user id for phone ${s.user_phone}` });
      continue;
    }
    reportRows.push({
      id: s.id,
      user_id: userId,
      beat_id: s.beat_id,
      device_timestamp: s.device_timestamp,
      location: `SRID=4326;POINT(${s.longitude} ${s.latitude})`,
      notes: s.notes,
      status: 'synced',
    });
    obsRows.push({
      // Deterministic id so re-imports upsert cleanly
      id: cryptoUuidFrom(`${s.id}:obs`),
      report_id: s.id,
      type: s.observation.type,
      male_count: s.observation.male_count,
      female_count: s.observation.female_count,
      calf_count: s.observation.calf_count,
      unknown_count: s.observation.unknown_count,
      total_elephants: s.observation.total_elephants,
      compass_bearing: s.observation.compass_bearing,
      indirect_sign_details: s.observation.indirect_sign_details?.length
        ? s.observation.indirect_sign_details
        : null,
      conflict_loss_details: s.observation.conflict_loss_details?.length
        ? s.observation.conflict_loss_details
        : null,
    });
    for (const [idx, d] of (s.damages || []).entries()) {
      damageRows.push({
        id: cryptoUuidFrom(`${s.id}:dmg:${idx}:${d.category}`),
        report_id: s.id,
        category: d.category,
        description: d.description,
        estimated_value: d.estimated_value,
      });
    }
  }

  if (reportRows.length) {
    const { error } = await sb.from('reports').upsert(reportRows);
    if (error) {
      console.error(`reports batch ${i}:`, error.message);
      summary.failed.push({ batch: i, error: error.message, kind: 'reports' });
    } else {
      summary.reports += reportRows.length;
    }
  }

  if (obsRows.length) {
    const { error } = await sb.from('observations').upsert(obsRows);
    if (error) {
      console.error(`observations batch ${i}:`, error.message);
      summary.failed.push({ batch: i, error: error.message, kind: 'observations' });
    } else {
      summary.observations += obsRows.length;
    }
  }

  if (damageRows.length) {
    const { error } = await sb.from('conflict_damages').upsert(damageRows);
    if (error) {
      console.error(`damages batch ${i}:`, error.message);
      summary.failed.push({ batch: i, error: error.message, kind: 'damages' });
    } else {
      summary.damages += damageRows.length;
    }
  }

  console.log(`Progress ${Math.min(i + BATCH, cohort.length)}/${cohort.length}`);
}

const out = sightingsFile.replace(/\.json$/i, '.import-results.json');
writeFileSync(out, JSON.stringify(summary, null, 2));
console.log('Done', summary);
if (summary.failed.length) process.exitCode = 1;
