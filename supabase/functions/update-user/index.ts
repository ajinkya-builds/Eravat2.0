import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { canManageRole } from '../_shared/rbac.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Authenticate Caller
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user: callerUser }, error: callerErr } = await callerClient.auth.getUser()
    if (callerErr || !callerUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: callerProfile } = await callerClient
      .from('profiles')
      .select('role')
      .eq('id', callerUser.id)
      .single()

    if (!callerProfile) {
      return new Response(JSON.stringify({ error: 'Caller profile not found' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Parse request body
    const {
      id, // Target user ID
      password,
      first_name,
      last_name,
      role,
      phone,
      division_id,
      range_id,
      beat_id,
    } = await req.json()

    if (!id) {
      return new Response(JSON.stringify({ error: 'Missing required field: id' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 3. Admin client for privileged operations
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // 4. Verify caller can manage target's CURRENT role
    const { data: targetProfile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', id)
      .single()
      
    if (!targetProfile) {
      return new Response(JSON.stringify({ error: 'Target profile not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!canManageRole(callerProfile.role, targetProfile.role)) {
      return new Response(JSON.stringify({ error: `Forbidden: role '${callerProfile.role}' cannot modify user with role '${targetProfile.role}'` }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 5. If role is being changed, verify caller can assign the NEW role
    if (role && role !== targetProfile.role) {
      if (!canManageRole(callerProfile.role, role)) {
        return new Response(JSON.stringify({ error: `Forbidden: role '${callerProfile.role}' cannot assign role '${role}'` }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // 6. Update Auth User
    const updatesToAuth: any = {}
    if (password) {
      updatesToAuth.password = password
    }
    
    // Check if there are auth updates
    if (Object.keys(updatesToAuth).length > 0) {
      const { error: authUpdateErr } = await adminClient.auth.admin.updateUserById(id, updatesToAuth)
      if (authUpdateErr) {
        return new Response(JSON.stringify({ error: authUpdateErr.message }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // 7. Update Profile
    const profileUpdates: any = {}
    if (first_name !== undefined) profileUpdates.first_name = first_name
    if (last_name !== undefined) profileUpdates.last_name = last_name
    if (role !== undefined) profileUpdates.role = role
    if (phone !== undefined) profileUpdates.phone = phone || null

    if (Object.keys(profileUpdates).length > 0) {
      const { error: profileUpdateErr } = await adminClient
        .from('profiles')
        .update(profileUpdates)
        .eq('id', id)

      if (profileUpdateErr) {
        return new Response(JSON.stringify({ error: `Profile update failed: ${profileUpdateErr.message}` }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // 8. Update Region Assignments
    const finalRole = role || targetProfile.role
    const GEOGRAPHIC_ROLES = ['dfo', 'rrt', 'range_officer', 'beat_guard']

    if (GEOGRAPHIC_ROLES.includes(finalRole)) {
      // Upsert region assignments if role requires them
      await adminClient
        .from('user_region_assignments')
        .upsert({
          user_id: id,
          division_id: division_id || null,
          range_id: range_id || null,
          beat_id: beat_id || null,
        })
    } else if (!GEOGRAPHIC_ROLES.includes(finalRole) && targetProfile.role !== finalRole) {
      // If role changed to non-geographic, delete old assignments just in case
      await adminClient
        .from('user_region_assignments')
        .delete()
        .eq('user_id', id)
    }

    return new Response(JSON.stringify({ success: true, user: { id } }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('Unexpected error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
