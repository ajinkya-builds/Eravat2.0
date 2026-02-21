import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { canManageRole } from '../_shared/rbac.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ── 1. Authenticate the calling user (must be admin) ─────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Caller client (uses the admin's JWT to verify identity)
    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // Verify caller is authenticated
    const { data: { user: callerUser }, error: callerErr } = await callerClient.auth.getUser()
    if (callerErr || !callerUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get the caller's profile to determine their role
    const { data: callerProfile, error: profileErr } = await callerClient
      .from('profiles')
      .select('role')
      .eq('id', callerUser.id)
      .single()

    if (profileErr || !callerProfile) {
      return new Response(JSON.stringify({ error: 'Forbidden: caller profile not found' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── 2. Parse request body ─────────────────────────────────────────────────
    const {
      email,
      password,
      first_name,
      last_name,
      role,
      phone,
      division_id,
      range_id,
      beat_id,
    } = await req.json()

    // ── 2.5 Verify RBAC permissions ───────────────────────────────────────────
    if (!canManageRole(callerProfile.role, role)) {
      return new Response(JSON.stringify({ error: `Forbidden: role '${callerProfile.role}' cannot create user with role '${role}'` }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!email || !password || !first_name || !last_name || !role) {
      return new Response(JSON.stringify({ error: 'Missing required fields: email, password, first_name, last_name, role' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── 3. Create auth user with service-role key (never touches caller's session) ──
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: authData, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,  // Skip email verification for admin-created users
      user_metadata: { first_name, last_name, role },
    })

    if (createErr) {
      return new Response(JSON.stringify({ error: createErr.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const newUserId = authData.user.id

    // ── 4. Upsert profile row ─────────────────────────────────────────────────
    const { error: profileUpsertErr } = await adminClient
      .from('profiles')
      .upsert({
        id: newUserId,
        role,
        first_name,
        last_name,
        phone: phone || null,
        is_active: true,
      })

    if (profileUpsertErr) {
      // Rollback auth user
      await adminClient.auth.admin.deleteUser(newUserId)
      return new Response(JSON.stringify({ error: `Profile creation failed: ${profileUpsertErr.message}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── 5. Create region assignment for geographic roles ─────────────────────
    // Geographic roles that get a territory assignment:
    // dfo → division only
    // rrt → division only
    // range_officer → division + range
    // beat_guard → division + range + beat
    const GEOGRAPHIC_ROLES = ['dfo', 'rrt', 'range_officer', 'beat_guard']

    if (GEOGRAPHIC_ROLES.includes(role) && division_id) {
      const { error: assignErr } = await adminClient
        .from('user_region_assignments')
        .insert({
          user_id: newUserId,
          division_id: division_id || null,
          range_id: range_id || null,
          beat_id: beat_id || null,
        })

      if (assignErr) {
        // Non-fatal: user and profile exist, just log the error
        console.error('Region assignment failed:', assignErr.message)
      }
    }

    // ── 6. Return created user info ───────────────────────────────────────────
    return new Response(JSON.stringify({
      success: true,
      user: {
        id: newUserId,
        email: authData.user.email,
        first_name,
        last_name,
        role,
        phone: phone || null,
      }
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('Unexpected error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
