import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { canManageRole, VALID_ROLES } from '../_shared/rbac.ts'

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(o => o.trim()).filter(Boolean)

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin') || ''
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : (ALLOWED_ORIGINS[0] || '')
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

const MAX_NAME_LENGTH = 100
const MAX_PHONE_LENGTH = 20
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

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

    // ── 2.5 Validate inputs ─────────────────────────────────────────────────
    if (!email || !password || !first_name || !last_name || !role) {
      return new Response(JSON.stringify({ error: 'Missing required fields: email, password, first_name, last_name, role' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!EMAIL_REGEX.test(email)) {
      return new Response(JSON.stringify({ error: 'Invalid email format' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!VALID_ROLES.includes(role)) {
      return new Response(JSON.stringify({ error: 'Invalid role specified' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (first_name.length > MAX_NAME_LENGTH || last_name.length > MAX_NAME_LENGTH) {
      return new Response(JSON.stringify({ error: `Name fields must be ${MAX_NAME_LENGTH} characters or fewer` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (phone && phone.length > MAX_PHONE_LENGTH) {
      return new Response(JSON.stringify({ error: `Phone must be ${MAX_PHONE_LENGTH} characters or fewer` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── 2.6 Verify RBAC permissions ───────────────────────────────────────────
    if (!canManageRole(callerProfile.role, role)) {
      return new Response(JSON.stringify({ error: 'Forbidden: insufficient permissions to create user with this role' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
      email_confirm: true,
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
        first_name: first_name.trim().slice(0, MAX_NAME_LENGTH),
        last_name: last_name.trim().slice(0, MAX_NAME_LENGTH),
        phone: phone ? phone.trim().slice(0, MAX_PHONE_LENGTH) : null,
        is_active: true,
      })

    if (profileUpsertErr) {
      // Rollback auth user
      await adminClient.auth.admin.deleteUser(newUserId)
      // Check for unique phone violation (PostgreSQL error code 23505)
      if (profileUpsertErr.code === '23505' && profileUpsertErr.message?.includes('phone')) {
        return new Response(JSON.stringify({ error: 'Phone number already exists' }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ error: `Profile creation failed: ${profileUpsertErr.message}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── 5. Create region assignment for geographic roles ─────────────────────
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
        return new Response(JSON.stringify({
          success: true,
          warning: `User created but region assignment failed: ${assignErr.message}`,
          user: { id: newUserId, email: authData.user.email, first_name, last_name, role },
        }), {
          status: 207,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
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
    console.error('create-user error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
