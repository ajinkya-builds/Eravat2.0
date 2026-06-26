import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { canManageRole, VALID_ROLES } from '../_shared/rbac.ts'

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(o => o.trim()).filter(Boolean)
const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174']

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin') || ''
  const allowed = ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS : DEFAULT_ORIGINS
  const allowedOrigin = allowed.includes(origin) ? origin : (allowed[0] || '*')
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

const MAX_NAME_LENGTH = 100
const MAX_PHONE_LENGTH = 20
const GEOGRAPHIC_ROLES = ['dfo', 'rrt', 'range_officer', 'beat_guard'] as const
const hasValue = (value: unknown) => Boolean(value && String(value).trim().length > 0)

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

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
      return new Response(JSON.stringify({ error: 'Forbidden: caller profile not found' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Parse request body
    const {
      id, // Target user ID
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

    // Input validation
    if (role && !VALID_ROLES.includes(role)) {
      return new Response(JSON.stringify({ error: 'Invalid role specified' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (first_name && first_name.length > MAX_NAME_LENGTH) {
      return new Response(JSON.stringify({ error: `First name must be ${MAX_NAME_LENGTH} characters or fewer` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (last_name && last_name.length > MAX_NAME_LENGTH) {
      return new Response(JSON.stringify({ error: `Last name must be ${MAX_NAME_LENGTH} characters or fewer` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (phone && phone.length > MAX_PHONE_LENGTH) {
      return new Response(JSON.stringify({ error: `Phone must be ${MAX_PHONE_LENGTH} characters or fewer` }), {
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
      return new Response(JSON.stringify({ error: 'Target user not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!canManageRole(callerProfile.role, targetProfile.role)) {
      return new Response(JSON.stringify({ error: 'Forbidden: insufficient permissions to modify this user' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 5. If role is being changed, verify caller can assign the NEW role
    if (role && role !== targetProfile.role) {
      if (!canManageRole(callerProfile.role, role)) {
        return new Response(JSON.stringify({ error: 'Forbidden: insufficient permissions to assign this role' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // 6. Update Auth User's phone if provided
    const updatesToAuth: any = {}
    let normalizedPhoneDigits = ''
    if (phone !== undefined) {
      if (phone) {
        const digits = phone.replace(/\D/g, '')
        const tenDigits = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : (digits.length === 11 && digits.startsWith('0') ? digits.slice(1) : digits)
        normalizedPhoneDigits = tenDigits
        updatesToAuth.phone = `91${tenDigits}`
      } else {
        updatesToAuth.phone = null
      }
    }

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
    if (first_name !== undefined) profileUpdates.first_name = first_name.trim().slice(0, MAX_NAME_LENGTH)
    if (last_name !== undefined) profileUpdates.last_name = last_name.trim().slice(0, MAX_NAME_LENGTH)
    if (role !== undefined) profileUpdates.role = role
    if (phone !== undefined) {
      profileUpdates.phone = phone ? `+91${normalizedPhoneDigits}` : null
    }

    if (Object.keys(profileUpdates).length > 0) {
      const { error: profileUpdateErr } = await adminClient
        .from('profiles')
        .update(profileUpdates)
        .eq('id', id)

      if (profileUpdateErr) {
        // Check for unique phone violation (PostgreSQL error code 23505)
        if (profileUpdateErr.code === '23505' && profileUpdateErr.message?.includes('phone')) {
          return new Response(JSON.stringify({ error: 'Phone number already exists' }), {
            status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        return new Response(JSON.stringify({ error: `Profile update failed: ${profileUpdateErr.message}` }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // 8. Update Region Assignments
    const finalRole = role || targetProfile.role

    if (GEOGRAPHIC_ROLES.includes(finalRole as (typeof GEOGRAPHIC_ROLES)[number])) {
      if (!hasValue(division_id)) {
        return new Response(JSON.stringify({ error: 'Division is required for this role.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (['range_officer', 'beat_guard'].includes(finalRole) && !hasValue(range_id)) {
        return new Response(JSON.stringify({ error: 'Range is required for this role.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (finalRole === 'beat_guard' && !hasValue(beat_id)) {
        return new Response(JSON.stringify({ error: 'Beat is required for beat guard role.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (hasValue(range_id)) {
        const { data: rangeRow, error: rangeErr } = await adminClient
          .from('geo_ranges')
          .select('id, division_id')
          .eq('id', range_id)
          .single()
        if (rangeErr || !rangeRow) {
          return new Response(JSON.stringify({ error: 'Selected range does not exist.' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        if (hasValue(division_id) && rangeRow.division_id !== division_id) {
          return new Response(JSON.stringify({ error: 'Selected range does not belong to selected division.' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }

      if (hasValue(beat_id)) {
        const { data: beatRow, error: beatErr } = await adminClient
          .from('geo_beats')
          .select('id, range_id')
          .eq('id', beat_id)
          .single()
        if (beatErr || !beatRow) {
          return new Response(JSON.stringify({ error: 'Selected beat does not exist.' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        if (hasValue(range_id) && beatRow.range_id !== range_id) {
          return new Response(JSON.stringify({ error: 'Selected beat does not belong to selected range.' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }

      // Upsert assignment atomically (user_id is unique)
      const { error: assignErr } = await adminClient
        .from('user_region_assignments')
        .upsert({
          user_id: id,
          division_id: division_id || null,
          range_id: range_id || null,
          beat_id: beat_id || null,
        }, { onConflict: 'user_id' })

      if (assignErr) {
        return new Response(JSON.stringify({
          success: true,
          warning: `User updated but region assignment failed: ${assignErr.message}`,
          user: { id },
        }), {
          status: 207,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else {
      await adminClient
        .from('user_region_assignments')
        .delete()
        .eq('user_id', id)
    }

    return new Response(JSON.stringify({ success: true, user: { id } }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('update-user error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
