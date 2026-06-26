import { createClient } from '@supabase/supabase-js';

const prodUrl = 'https://mnytrlcmdpkfhrzrtesf.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ueXRybGNtZHBrZmhyenJ0ZXNmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTYwNzYwNCwiZXhwIjoyMDg3MTgzNjA0fQ.ysj8mfaBMR6sR1RaZAxePJI3Bf3IEqo07PrfROVF7sc';

async function main() {
  const supabase = createClient(prodUrl, serviceRoleKey, {
    auth: {
      persistSession: false
    }
  });

  // 1. Get profile of the Admin (9988775566)
  const { data: profiles, error: profileErr } = await supabase
    .from('profiles')
    .select('*')
    .or('phone.eq.+919988775566,phone.eq.9988775566');
    
  if (profileErr || !profiles || profiles.length === 0) {
    console.error('Admin profile not found:', profileErr);
    return;
  }
  
  const admin = profiles[0];
  console.log('Found Admin User:', admin.id, admin.phone);

  // 2. Try inserting a mock report with beat_id = null
  const mockReportId = '77777777-7777-7777-7777-777777777777';
  
  // Clean up existing test report if any
  await supabase.from('reports').delete().eq('id', mockReportId);
  
  console.log('\n--- Attempting report insert with beat_id = null ---');
  const { error: insertErr } = await supabase
    .from('reports')
    .insert({
      id: mockReportId,
      user_id: admin.id,
      beat_id: null,
      device_timestamp: new Date().toISOString(),
      location: 'SRID=4326;POINT(77.4126 23.2599)',
      notes: 'Test note',
      status: 'pending'
    });

  if (insertErr) {
    console.error('Insert error details:', JSON.stringify(insertErr, null, 2));
  } else {
    console.log('Insert succeeded!');
    await supabase.from('reports').delete().eq('id', mockReportId);
  }
}

main();
