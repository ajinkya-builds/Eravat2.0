# Session: Roles, GPS location, Beat Guard volunteer onboarding

**Date:** 2026-05-21

## Goals

- Sync project memory with `/docs`
- Role capability matrix + gap analysis
- Beat Guard → Volunteer onboarding (minimal form)
- Mandatory GPS on all user profiles
- Supabase migration + RLS verification

## Outcomes

### Database

- Migration `20260521000000_profile_location_and_volunteer_onboarding.sql`:
  - `profiles.latitude`, `profiles.longitude`, `profiles.location_updated_at` (NOT NULL after backfill)
  - `get_geo_centroid_lat_lng`, `resolve_profile_centroid_lat_lng` helpers
  - Backfill from division/range/beat centroids; India fallback for state roles
  - Updated `handle_new_auth_user_profile` for NOT NULL coords

### RBAC

- `beat_guard` may create `volunteer`; `dfo` / `range_officer` also include `volunteer` in hierarchy
- `create-user`: volunteer onboarding mode (auto email/password, required GPS, beat inheritance from Beat Guard)

### Frontend

- `/volunteers/onboard` — field onboarding (name, phone, GPS)
- Dashboard CTA for roles that can onboard volunteers
- `LocationFields` on Edit Profile, admin volunteer register, profile completion gate
- Shared `eravat-app/src/lib/rbac.ts`

### Docs

- `docs/ROLE_CAPABILITY_MATRIX.md`
- Updated `schema.md`, `INDEX.md`, `PROJECT_BRAIN.md`

## Remote Supabase apply (2026-05-21 follow-up)

- Migration `profile_location_and_volunteer_onboarding` applied via Supabase MCP to project `mnytrlcmdpkfhrzrtesf` (version `20260521162228`).
- Verified: `profiles.latitude` / `longitude` NOT NULL; 107 profiles backfilled; RPCs `get_geo_centroid_lat_lng`, `resolve_profile_centroid_lat_lng` exist.
- Edge Function `create-user` redeployed via `supabase functions deploy create-user`.
- Policy doc: [`docs/SUPABASE_OPERATIONS.md`](../SUPABASE_OPERATIONS.md) — agents must apply migrations/functions to remote, not only commit SQL files.

## Follow-ups

- Consider adding `range_officer` to `AdminRoute` or a dedicated range-scoped admin shell
- E2E test for Beat Guard volunteer create + OTP login with provisioned phone
