#!/usr/bin/env node
/**
 * Reload public.village_centroids from ed/data/centroids.csv.
 * Staging only. Requires SUPABASE_URL pointing at ttjtyvxfiqhjdngkgdkf
 * and SUPABASE_SERVICE_ROLE_KEY. Do not point at production.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const url = process.env.SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!url.includes('ttjtyvxfiqhjdngkgdkf') || !key) {
  console.error('Refusing to run: set SUPABASE_URL to staging (ttjtyvxfiqhjdngkgdkf) and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const csvPath = resolve(process.cwd(), process.argv[2] || '../ed/data/centroids.csv');
const text = readFileSync(csvPath, 'utf8');
const lines = text.trim().split(/\r?\n/).slice(1);
const rows = lines.map((line) => {
  const [Village, Latitude, Longitude] = line.split(',');
  return {
    name: Village,
    latitude: Number(Latitude),
    longitude: Number(Longitude),
  };
}).filter((r) => r.name && Number.isFinite(r.latitude) && Number.isFinite(r.longitude));

const sb = createClient(url, key, { auth: { persistSession: false } });
const { error: delErr } = await sb.from('village_centroids').delete().neq('id', '00000000-0000-0000-0000-000000000000');
if (delErr) throw delErr;

const batch = 500;
for (let i = 0; i < rows.length; i += batch) {
  const chunk = rows.slice(i, i + batch).map((r) => ({
    name: r.name,
    latitude: r.latitude,
    longitude: r.longitude,
    location: `SRID=4326;POINT(${r.longitude} ${r.latitude})`,
  }));
  const { error } = await sb.from('village_centroids').insert(chunk);
  if (error) throw error;
  console.log(`inserted ${Math.min(i + batch, rows.length)}/${rows.length}`);
}
