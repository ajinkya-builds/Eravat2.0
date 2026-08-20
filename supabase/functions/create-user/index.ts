import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { canManageRole, VALID_ROLES } from '../_shared/rbac.ts'

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(o => o.trim()).filter(Boolean)
const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174', 'http://localhost', 'capacitor://localhost']

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
const INDIA_FALLBACK_LAT = 22.9734
const INDIA_FALLBACK_LNG = 78.6568

const hasValue = (value: unknown) => Boolean(value && String(value).trim().length > 0)

function normalisePhoneDigits(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2)
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1)
  return digits
}

function isValidCoordinate(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

async function resolveCentroidLatLng(
  adminClient: ReturnType<typeof createClient>,
  opts: { beat_id?: string | null; range_id?: string | null; division_id?: string | null }
): Promise<{ latitude: number; longitude: number } | null> {
  const { data, error } = await adminClient.rpc('get_geo_centroid_lat_lng', {
    p_beat_id: hasValue(opts.beat_id) ? opts.beat_id : null,
    p_range_id: hasValue(opts.range_id) ? opts.range_id : null,
    p_division_id: hasValue(opts.division_id) ? opts.division_id : null,
  })
  if (error || !data?.length) return null
  const row = data[0] as { latitude: number; longitude: number }
  if (!isValidCoordinate(row.latitude, row.longitude)) return null
  return row
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ── 1. Authenticate the calling user (must be admin/staff) ─────────────
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

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: callerAssignment } = await adminClient
      .from('user_region_assignments')
      .select('division_id, range_id, beat_id')
      .eq('user_id', callerUser.id)
      .maybeSingle()

    // ── 2. Parse request body ─────────────────────────────────────────────────
    let {
      first_name,
      last_name,
      full_name,
      role,
      phone,
      division_id,
      range_id,
      beat_id,
      latitude,
      longitude,
    } = await req.json()

    if (hasValue(full_name) && (!hasValue(first_name) || !hasValue(last_name))) {
      const parts = String(full_name).trim().split(/\s+/)
      first_name = parts[0] || 'User'
      last_name = parts.slice(1).join(' ') || ''
    }

    if (!role) {
      return new Response(JSON.stringify({ error: 'Missing required field: role' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!VALID_ROLES.includes(role)) {
      return new Response(JSON.stringify({ error: 'Invalid role specified' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!canManageRole(callerProfile.role, role)) {
      return new Response(JSON.stringify({ error: 'Forbidden: insufficient permissions to create user with this role' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Phone validation (required for all users now)
    if (!hasValue(phone)) {
      return new Response(JSON.stringify({ error: 'Phone number is required.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const phoneDigits = normalisePhoneDigits(String(phone))
    if (phoneDigits.length !== 10) {
      return new Response(JSON.stringify({ error: 'Phone number must be a valid 10-digit Indian number.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const e164Phone = `91${phoneDigits}`

    if (!hasValue(first_name)) {
      return new Response(JSON.stringify({ error: 'First name is required.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!hasValue(last_name)) last_name = ''

    if (role === 'volunteer') {
      // Prefer client-supplied (location-based) territory. Fall back to the caller's assignment.
      if (!hasValue(beat_id) && callerAssignment?.beat_id) {
        beat_id = callerAssignment.beat_id
        if (!hasValue(range_id)) range_id = callerAssignment.range_id
        if (!hasValue(division_id)) division_id = callerAssignment.division_id
      }

      if (!hasValue(beat_id)) {
        return new Response(JSON.stringify({ error: 'Beat assignment is required for Hathi Mitra. Capture GPS so Division/Range/Beat can be filled from location.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    if (first_name.length > MAX_NAME_LENGTH || (last_name && last_name.length > MAX_NAME_LENGTH)) {
      return new Response(JSON.stringify({ error: `Name fields must be ${MAX_NAME_LENGTH} characters or fewer` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (phone.length > MAX_PHONE_LENGTH) {
      return new Response(JSON.stringify({ error: `Phone must be ${MAX_PHONE_LENGTH} characters or fewer` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (GEOGRAPHIC_ROLES.includes(role as (typeof GEOGRAPHIC_ROLES)[number]) && !hasValue(division_id)) {
      return new Response(JSON.stringify({ error: 'Division is required for this role.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (['range_officer', 'beat_guard'].includes(role) && !hasValue(range_id)) {
      return new Response(JSON.stringify({ error: 'Range is required for this role.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (role === 'beat_guard' && !hasValue(beat_id)) {
      return new Response(JSON.stringify({ error: 'Beat is required for beat guard role.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let profileLat = typeof latitude === 'number' ? latitude : parseFloat(latitude)
    let profileLng = typeof longitude === 'number' ? longitude : parseFloat(longitude)

    if (!isValidCoordinate(profileLat, profileLng)) {
      if (role === 'volunteer') {
        return new Response(JSON.stringify({ error: 'GPS location is required when onboarding a Hathi Mitra.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const centroid = await resolveCentroidLatLng(adminClient, { beat_id, range_id, division_id })
      if (centroid) {
        profileLat = centroid.latitude
        profileLng = centroid.longitude
      } else {
        profileLat = INDIA_FALLBACK_LAT
        profileLng = INDIA_FALLBACK_LNG
      }
    }

    // ── 3.1 Validate territory hierarchy consistency ──────────────────────────
    if (GEOGRAPHIC_ROLES.includes(role as (typeof GEOGRAPHIC_ROLES)[number])) {
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
    }

    // Create auth user with phone-only credentials
    const { data: authData, error: createErr } = await adminClient.auth.admin.createUser({
      phone: e164Phone,
      phone_confirm: true,
      user_metadata: {
        first_name,
        last_name,
        role,
        latitude: profileLat,
        longitude: profileLng,
      },
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
        last_name: (last_name || '').trim().slice(0, MAX_NAME_LENGTH),
        phone: `+91${phoneDigits}`,
        is_active: true,
        latitude: profileLat,
        longitude: profileLng,
        location_updated_at: new Date().toISOString(),
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

    // ── 5. Create region assignment for geographic roles and volunteers ───────
    const needsTerritory = GEOGRAPHIC_ROLES.includes(role as (typeof GEOGRAPHIC_ROLES)[number]) || role === 'volunteer'
    if (needsTerritory) {
      if (role === 'volunteer' && hasValue(beat_id) && (!hasValue(range_id) || !hasValue(division_id))) {
        const { data: beatRow } = await adminClient
          .from('geo_beats')
          .select('id, range_id')
          .eq('id', beat_id)
          .single()
        if (beatRow?.range_id) {
          range_id = beatRow.range_id
          const { data: rangeRow } = await adminClient
            .from('geo_ranges')
            .select('division_id')
            .eq('id', beatRow.range_id)
            .single()
          if (rangeRow?.division_id) division_id = rangeRow.division_id
        }
      }

      const { error: assignErr } = await adminClient
        .from('user_region_assignments')
        .insert({
          user_id: newUserId,
          division_id: division_id || null,
          range_id: range_id || null,
          beat_id: beat_id || null,
        })

      if (assignErr) {
        // Roll back so a failed registration never leaves an orphan user behind
        await adminClient.from('profiles').delete().eq('id', newUserId)
        await adminClient.auth.admin.deleteUser(newUserId)
        return new Response(JSON.stringify({
          error: `Region assignment failed: ${assignErr.message}. The user was not created — please try again.`,
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // ── 6. Return created user info ───────────────────────────────────────────
    return new Response(JSON.stringify({
      success: true,
      user: {
        id: newUserId,
        first_name,
        last_name,
        role,
        phone: `+91${phoneDigits}`,
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
