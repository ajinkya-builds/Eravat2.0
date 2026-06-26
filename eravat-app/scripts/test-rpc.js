import { createClient } from '@supabase/supabase-js';

const stagingUrl = 'https://ttjtyvxfiqhjdngkgdkf.supabase.co';
const stagingKey = 'sb_publishable_4UmDpkNy1B1QPasCHuHkSQ_RxR-PEDe';

const prodUrl = 'https://mnytrlcmdpkfhrzrtesf.supabase.co';
const prodKey = 'sb_publishable_pxNb78WOGaRxX64ZGZPaog_i0nJqbCC';

async function checkDb(name, url, key) {
  console.log(`\n=== Checking ${name} DB ===`);
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
