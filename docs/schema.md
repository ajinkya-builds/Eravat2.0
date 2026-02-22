# Eravat 2.0 — Database Schema Quick Reference

> Supabase Project: `mnytrlcmdpkfhrzrtesf`  
> Last updated: 2026-02-21

---

## Enum Types

```sql
user_role:    admin | ccf | biologist | veterinarian | dfo | rrt | range_officer | beat_guard | volunteer
obs_type:     direct_sighting | indirect_sign | conflict_loss
sync_status:  pending | synced | reviewed
```

---

## Table Map

```
auth.users  (Supabase managed)
    │
    └── profiles (id = auth.users.id)
            │
            └── user_region_assignments
                    ├── geo_divisions
                    │       └── geo_ranges
                    │               └── geo_beats
                    │
    └── reports (user_id → profiles)
            ├── observations (report_id → reports)
            ├── conflict_damages (report_id → reports)
            └── report_media (report_id → reports)
```

---

## Key Rules

1. `profiles.id` **IS** `auth.users.id` — no separate `auth_id` column
2. Geographic tables are prefixed `geo_` — NOT `divisions/ranges/beats`
3. `reports.location` is a PostGIS `geography` POINT — NOT lat/lng columns
4. Observation counts are in `observations` child table — NOT on `reports`
5. `user_region_assignments` maps a user to ONE division+range+beat assignment

## Creating and Managing Users

> ⚠️ **CRITICAL:** Because `auth.users` requires the Supabase Service Role Key for mutations, **all user management MUST go through the Edge Functions.** 

The front-end `AdminUsers.tsx` component calls these functions.

### Edge Functions
1. **`create-user`**: Creates the `auth.user`, inserts the `profile` row, and inserts the `user_region_assignments` row.
2. **`update-user`**: Safely updates `auth.users` (password), `profiles` (name, phone, role), and `user_region_assignments`. 
3. **`delete-user`**: Deletes references in `user_region_assignments`, `profiles`, and ultimately the user from `auth.users`.

### Role-Based Access Control (RBAC)
All Edge Functions strictly enforce RBAC using `supabase/functions/_shared/rbac.ts`:
- **Admin / CCF**: Can manage any role
- **DFO**: Can manage Range Officers & Beat Guards
- **Range Officer / RRT**: Can manage Beat Guards
- **Others**: Cannot manage anyone.

---

## Seeding Geography

```sql
-- Divisions
INSERT INTO public.geo_divisions (name, code, state)
VALUES ('Coimbatore Division', 'CBD', 'Tamil Nadu');

-- Ranges (reference division)
INSERT INTO public.geo_ranges (division_id, name, code)
SELECT id, 'Ooty Range', 'OTY'
FROM geo_divisions WHERE name = 'Coimbatore Division';

-- Beats (reference range)
INSERT INTO public.geo_beats (range_id, name, code)
SELECT id, 'Ooty Beat 01', 'OTY01'
FROM geo_ranges WHERE name = 'Ooty Range';
```

---

## Assigning Territory to a User

```sql
INSERT INTO public.user_region_assignments (user_id, division_id, range_id, beat_id)
VALUES (
  '<user profiles.id>',
  '<geo_divisions.id>',
  '<geo_ranges.id>',
  '<geo_beats.id>'
);
```

---

## RLS Status

| Table | RLS | Notes |
|---|---|---|
| `profiles` | OFF | Consider enabling for production |
| `geo_divisions` | OFF | Public read is fine |
| `geo_ranges` | OFF | Public read is fine |
| `geo_beats` | OFF | Public read is fine |
| `user_region_assignments` | OFF | Should enable in production |
| `reports` | **ON** | Geographic + role-based policies |
| `observations` | **ON** | Inherits from reports |
| `conflict_damages` | OFF | Should enable |
| `report_media` | OFF | Should enable |
