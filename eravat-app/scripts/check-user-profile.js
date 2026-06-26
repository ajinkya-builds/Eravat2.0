import { createClient } from '@supabase/supabase-js';

const prodUrl = 'https://mnytrlcmdpkfhrzrtesf.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ueXRybGNtZHBrZmhyenJ0ZXNmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTYwNzYwNCwiZXhwIjoyMDg3MTgzNjA0fQ.ysj8mfaBMR6sR1RaZAxePJI3Bf3IEqo07PrfROVF7sc';

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
