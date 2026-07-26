import { createClient } from '@supabase/supabase-js';

const stagingUrl = process.env.STAGE_SUPABASE_URL || process.env.STAGE_VITE_SUPABASE_URL;
const stagingKey =
  process.env.STAGE_SUPABASE_PUBLISHABLE_KEY || process.env.STAGE_VITE_SUPABASE_PUBLISHABLE_KEY;

const prodUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const prodKey =
  process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function checkDb(name, url, key) {
  console.log(`\n=== Checking ${name} DB ===`);
  if (!url || !key) {
    console.error(`Missing URL/key for ${name}. Set env vars and retry.`);
    return;
  }
  try {
    const supabase = createClient(url, key);
    
    // Check admin phone
    const { data: adminReg, error: adminErr } = await supabase.rpc('check_phone_registered', { p_phone: '9988775566' });
    console.log(`Admin phone (9988775566) registered:`, adminReg, adminErr ? `Error: ${adminErr.message}` : '');
    
    // Check field staff phone
    const { data: fieldReg, error: fieldErr } = await supabase.rpc('check_phone_registered', { p_phone: '8899776655' });
    console.log(`Field Staff phone (8899776655) registered:`, fieldReg, fieldErr ? `Error: ${fieldErr.message}` : '');
    
  } catch (err) {
    console.error(`Error connecting to ${name}:`, err.message);
  }
}

async function main() {
  await checkDb('Staging', stagingUrl, stagingKey);
  await checkDb('Production', prodUrl, prodKey);
}

main();
