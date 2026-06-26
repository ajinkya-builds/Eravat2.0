import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../.env.local');

const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY;

console.log('Connecting to:', url);
const supabase = createClient(url, key);

async function checkLatestReports() {
  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .order('server_created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('Error fetching reports:', error.message);
  } else {
    printResults(data);
  }
}

function printResults(data) {
  if (!data || data.length === 0) {
    console.log('No reports found.');
    return;
  }
  console.log(`Successfully fetched ${data.length} reports:`);
  for (const r of data) {
    console.log(`- ID: ${r.id}, Created At: ${r.created_at}, Type: ${r.report_type || r.observation_type}, Beat ID: ${r.beat_id}`);
  }
}

checkLatestReports();
