import { createClient } from '@supabase/supabase-js';

const prodUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!prodUrl || !serviceRoleKey) {
  console.error(
    'Missing SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in the environment.'
  );
  process.exit(1);
}

async function main() {
  const supabase = createClient(prodUrl, serviceRoleKey, {
    auth: {
      persistSession: false
    }
  });

  const phones = ['9988775566', '8899776655'];
  
  for (const phone of phones) {
    console.log(`\n=== Profile for phone: ${phone} ===`);
    
    // 1. Find profile by phone
    // We try querying with E.164 and raw formatting
    const { data: profiles, error: profileErr } = await supabase
      .from('profiles')
      .select('*')
      .or(`phone.eq.+91${phone},phone.eq.${phone}`);
      
    if (profileErr) {
      console.error('Error fetching profile:', profileErr.message);
      continue;
    }
    
    if (!profiles || profiles.length === 0) {
      console.log('No profile found in profiles table.');
      continue;
    }
    
    for (const profile of profiles) {
      console.log('Profile details:', JSON.stringify(profile, null, 2));
      
      // 2. Fetch assignments
      const { data: assignments, error: assignErr } = await supabase
        .from('user_region_assignments')
        .select(`
          division_id,
          range_id,
          beat_id,
          geo_divisions (name),
          geo_ranges (name),
          geo_beats (name)
        `)
        .eq('user_id', profile.id);
        
      if (assignErr) {
        console.error('Error fetching assignments:', assignErr.message);
      } else {
        console.log('Assignments:', JSON.stringify(assignments, null, 2));
      }
    }
  }
}

main();
