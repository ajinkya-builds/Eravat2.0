# Eravat 2.0 — Database Schema Quick Reference

> Supabase Project: `mnytrlcmdpkfhrzrtesf`  
> Last updated: 2026-02-21

---

## Enum Types

```sql
user_role:    admin | ccf | biologist | veterinarian | dfo | rrt | range_officer | beat_guard | volunteer
obs_type:     direct | indirect | loss
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

---

## Creating a New Admin User

```sql
-- Step 1: Create via Supabase Dashboard → Auth → Users → Add User

-- Step 2: Grant admin role
UPDATE public.profiles
SET role = 'admin', first_name = 'First', last_name = 'Last', is_active = true
WHERE id = (SELECT id FROM auth.users WHERE email = 'user@example.com');
```

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
