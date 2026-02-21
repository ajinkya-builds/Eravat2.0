require('dotenv').config({ path: './eravat-app/.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function test() {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: { session }, error: signInErr } = await supabase.auth.signInWithPassword({
        email: 'ajinkya.patil60@gmail.com',
        password: 'Test123!@#',
    });

    if (signInErr) {
        console.error('Sign in error:', signInErr.message);
        return;
    }

    console.log('Signed in. Invoking create-user Edge Function...');

    const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
            first_name: 'Test',
            last_name: 'User',
            email: 'test' + Date.now() + '@example.com',
            password: 'Password123!',
            role: 'volunteer',
            phone: '',
            division_id: null,
            range_id: null,
            beat_id: null
        }
    });

    if (error) {
        // Log the full error to see the response text
        console.error('Edge function error:', error.message);
        if (error.context) {
            console.error('Error context:', await error.context.text());
        }
    } else {
        console.log('Success:', data);
    }
}

test();
