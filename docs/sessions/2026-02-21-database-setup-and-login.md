# Session Log: 2026-02-21 — Database Setup & Login Fix

**Session Date:** 21 February 2026  
**Duration:** ~2.5 hours  
**Focus:** Database schema alignment, authentication setup, first login  

---

## 🎯 Goals for This Session

1. Fix recurring SQL syntax errors in the database setup script
2. Inspect actual Supabase database (live project)
3. Align all frontend code to the real existing schema
4. Get first admin user logged in successfully

---

## ✅ What Was Accomplished

### 1. Discovered Real Supabase Schema

We found this project already had a working schema. What we were coding against was WRONG.

| We assumed | Reality |
|---|---|
| `users` table | `profiles` table (id = auth.users.id directly) |
| `divisions`, `ranges`, `beats` | `geo_divisions`, `geo_ranges`, `geo_beats` |
| Flat lat/lng on reports | PostGIS `geography` POINT on `reports` |
| reports has all fields | Normalized: `reports` + `observations` + `conflict_damages` |

**Supabase Project:** `mnytrlcmdpkfhrzrtesf`  
**9 tables exist:** profiles, geo_divisions, geo_ranges, geo_beats, reports, observations, conflict_damages, report_media, user_region_assignments

### 2. Updated Environment

File: `.env.local`
- Set real `VITE_SUPABASE_URL` 
- Set real `VITE_SUPABASE_ANON_KEY` (using new `sb_publishable_` format)

### 3. Files Rewritten to Match Real Schema

| File | What Changed |
|---|---|
| `src/supabase.ts` | Wired real credentials from env |
| `src/db.ts` | Renamed fields: `male_count`, `calf_count`, `beat_id`, `device_timestamp` — matches server schema |
| `src/contexts/AuthContext.tsx` | Queries `profiles` by `id` (not `auth_id`); joins `user_region_assignments` + geo names |
| `src/pages/Login.tsx` | **Critical fix** — was a FAKE setTimeout; now calls real `useAuth().signIn()` with error display |
| `src/pages/admin/AdminUsers.tsx` | Uses `geo_divisions`, `geo_ranges`, `geo_beats`, `profiles`, `user_region_assignments` |
| `src/pages/admin/AdminObservations.tsx` | Queries `reports` + joins `observations(*)`; uses `device_timestamp`, `server_created_at` |
| `src/services/SyncService.ts` | Maps local flat fields → normalized `reports` + `observations` + PostGIS location |

### 4. First Admin Login Working

**Admin user created:**
- Email: `ajinkya.patil60@gmail.com`
- Role set via: `UPDATE public.profiles SET role = 'admin' ... WHERE email = ...`

**Login confirmed working** — Browser test verified full auth flow landing on Dashboard + Admin Panel.

---

## 🐛 Bugs Found & Fixed

### Bug 1: Login.tsx was FAKE
- **Problem:** `handleLogin` used `setTimeout(() => navigate('/'), 1200)` — never called Supabase
- **Fix:** Rewrote to use `useAuth().signIn(email, password)` with error state display

### Bug 2: SQL Syntax Error in Previous Script
- **Problem:** Inline comments `-- comment` before `)` caused Supabase SQL editor errors
- **Fix:** Replaced old monolithic script with step-by-step individual snippets
- **Better discovery:** Found the schema already existed, making new scripts unnecessary

### Bug 3: Wrong Table Names Throughout Frontend
- **Problem:** All code queried `users`, `divisions`, `ranges`, `beats` — none exist
- **Fix:** Mass update across AuthContext, AdminUsers, SyncService, db.ts

---

## 📋 SQL Reference (run in Supabase SQL Editor)

### Create Admin User (post auth signup)
```sql
UPDATE public.profiles
SET role = 'admin', first_name = 'Name', last_name = 'Surname', is_active = true
WHERE id = (SELECT id FROM auth.users WHERE email = 'user@example.com');
```

### Check Profile Was Created
```sql
SELECT p.*, au.email
FROM public.profiles p
JOIN auth.users au ON au.id = p.id;
```

### Seed Geography (example)
```sql
INSERT INTO public.geo_divisions (name, code, state) VALUES ('Western Division', 'WD01', 'Maharashtra');
INSERT INTO public.geo_ranges (division_id, name, code)
  SELECT id, 'Ooty Range', 'OR01' FROM geo_divisions WHERE name = 'Western Division';
INSERT INTO public.geo_beats (range_id, name, code)
  SELECT id, 'Beat A', 'BA01' FROM geo_ranges WHERE name = 'Ooty Range';
```

---

## 🔮 What's Left / Next Session Priorities

- [ ] Seed `geo_divisions`, `geo_ranges`, `geo_beats` with actual Maharashtra forest dept territories
- [ ] Enable RLS on `profiles` and `user_region_assignments`
- [ ] Add DB trigger to auto-create profile row on new auth signup
- [ ] Test report filing flow (ReportStepper → SyncService → Supabase)
- [ ] Test Admin Panel shows fetched data (currently empty DB)
- [ ] Verify PWA install prompt on mobile
- [ ] Android build fix (JAVA_HOME issue in Capacitor)
- [ ] Add `position` field to profiles or use `user_region_assignments` as source of truth for all territory display

---

## 🏃 How to Continue

```bash
# Start dev server
cd "/Volumes/Eravat/Eravat 2.0/eravat-app"
npm run dev

# Login at: http://localhost:5173
# Email: ajinkya.patil60@gmail.com
# Password: Test123!@#
```

**Always read `/docs/README.md` first for project architecture.**
