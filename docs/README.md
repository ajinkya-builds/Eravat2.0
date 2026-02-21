# Eravat 2.0 — Project Context & Architecture

> **AI Context File** — This folder is updated at the end of every development session.
> Always read `README.md` + the latest session log before starting new work.

---

## 📱 What Is Eravat?

**Eravat 2.0** is a mobile-first Progressive Web App (PWA) for the **Forest Department** to log and manage elephant activity reports. Field staff record sightings, indirect signs, and human-wildlife conflict damage, which syncs to a centralised Supabase backend when online.

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Styling | Tailwind CSS v4 (via `@tailwindcss/vite`) |
| Animation | Framer Motion |
| Icons | Lucide React |
| Routing | React Router DOM v6 |
| Database | Supabase (PostgreSQL + PostGIS) |
| Auth | Supabase Auth (Email/Password) |
| Offline DB | Dexie.js (IndexedDB wrapper) |
| PWA | Service Worker + Vite PWA Plugin |
| Mobile | Capacitor (Android/iOS build target) |

---

## 📁 Project Structure

```
eravat-app/
├── src/
│   ├── App.tsx                    # Router + route definitions
│   ├── main.tsx                   # App entry point
│   ├── supabase.ts                # Supabase client init
│   ├── db.ts                      # Dexie (local IndexedDB) schema
│   ├── index.css                  # Global styles + Tailwind tokens
│   ├── contexts/
│   │   └── AuthContext.tsx        # Auth state + profile fetching
│   ├── pages/
│   │   ├── Login.tsx              # Login screen (wired to Supabase auth)
│   │   ├── Dashboard.tsx          # Main field dashboard
│   │   ├── UserProfile.tsx        # User profile + territory display
│   │   ├── ReportActivityPage.tsx # Report filing entry point
│   │   ├── MobilePatrol.tsx       # Patrol logging screen
│   │   └── admin/
│   │       ├── AdminDashboard.tsx # Admin command center layout
│   │       ├── AdminUsers.tsx     # Personnel management
│   │       └── AdminObservations.tsx # Observation reports table
│   ├── components/
│   │   ├── ProtectedRoute.tsx     # Auth guard component
│   │   ├── SightingForm.tsx       # Legacy sighting form
│   │   └── reporting/
│   │       ├── ReportStepper.tsx  # Multi-step report wizard
│   │       └── steps/
│   │           ├── DateTimeLocationStep.tsx
│   │           ├── ObservationTypeStep.tsx
│   │           ├── CompassBearingStep.tsx
│   │           └── PhotoStep.tsx
│   ├── services/
│   │   └── SyncService.ts         # Offline→Supabase sync logic
│   ├── hooks/                     # Custom hooks
│   ├── layouts/                   # Layout wrappers
│   ├── types/
│   │   └── activity-report.ts    # TypeScript type definitions
│   └── lib/                      # Utility functions
└── .env.local                     # Contains real Supabase credentials
```

---

## 🔑 Environment Variables

File: `eravat-app/.env.local`

```
VITE_SUPABASE_URL=https://mnytrlcmdpkfhrzrtesf.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_pxNb78WOGaRxX64ZGZPaog_i0nJqbCC
```

> **Note:** The new `sb_publishable_` key format replaces the legacy `anon` JWT key in newer Supabase projects. It works identically with `@supabase/supabase-js` v2.

---

## 🗄 Supabase Database Schema

Project URL: `https://mnytrlcmdpkfhrzrtesf.supabase.co`

### Custom Enum Types

```sql
user_role  -- admin, ccf, biologist, veterinarian, dfo, rrt, range_officer, beat_guard, volunteer
obs_type   -- direct, indirect, loss
loss_category -- (for conflict_damages)
sync_status   -- pending, synced, reviewed
```

### Tables

#### `profiles` — User Profiles
Links directly to `auth.users` by `id` (same UUID, no separate `auth_id` column).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | = auth.users.id |
| `role` | user_role | Enum |
| `first_name` | text | |
| `last_name` | text | |
| `phone` | text | |
| `is_active` | bool | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

#### `geo_divisions` — Division-level Geography
| Column | Type |
|---|---|
| `id` | uuid PK |
| `name` | text |
| `code` | text |
| `state` | text |
| `created_at` | timestamptz |

#### `geo_ranges` — Range-level Geography
| Column | Type |
|---|---|
| `id` | uuid PK |
| `division_id` | uuid → geo_divisions |
| `name` | text |
| `code` | text |
| `created_at` | timestamptz |

#### `geo_beats` — Beat-level Geography
| Column | Type |
|---|---|
| `id` | uuid PK |
| `range_id` | uuid → geo_ranges |
| `name` | text |
| `code` | text |
| `boundary` | geography (PostGIS polygon) |
| `created_at` | timestamptz |

#### `user_region_assignments` — Maps users to their territory
| Column | Type |
|---|---|
| `id` | uuid PK |
| `user_id` | uuid → profiles |
| `division_id` | uuid → geo_divisions |
| `range_id` | uuid → geo_ranges |
| `beat_id` | uuid → geo_beats |
| `assigned_at` | timestamptz |

#### `reports` — Field Reports (parent)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid → profiles | Reporter |
| `beat_id` | uuid → geo_beats | Territory |
| `device_timestamp` | timestamptz | When recorded |
| `location` | geography | PostGIS POINT (SRID 4326) |
| `status` | sync_status | pending/synced/reviewed |
| `notes` | text | |
| `server_created_at` | timestamptz | Server insert time |

#### `observations` — Observation Details (child of reports)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `report_id` | uuid → reports | |
| `type` | obs_type | direct/indirect/loss |
| `male_count` | int4 | |
| `female_count` | int4 | |
| `calf_count` | int4 | |
| `unknown_count` | int4 | |
| `compass_bearing` | numeric | 0–360° |
| `indirect_sign_details` | text | |

#### `conflict_damages` — Damage Reports (child of reports)
| Column | Type |
|---|---|
| `id` | uuid PK |
| `report_id` | uuid → reports |
| `category` | loss_category |
| `description` | text |
| `estimated_value` | numeric |

#### `report_media` — Photos (child of reports)
| Column | Type |
|---|---|
| `id` | uuid PK |
| `report_id` | uuid → reports |
| `file_path` | text (Storage path) |
| `content_type` | text |
| `created_at` | timestamptz |

---

## 🔐 RLS Policies

| Table | Status | Policy Summary |
|---|---|---|
| `reports` | **ENABLED** | Admin: full access · DFO/RRT: division-scoped · Range Officer: range-scoped · Beat Guard: beat-scoped · Self: own reports |
| `observations` | **ENABLED** | Insert/Update if author; View if can view parent report |
| `profiles` | Disabled | — |
| `geo_*` | Disabled | Public read |
| `user_region_assignments` | Disabled | — |

---

## 👤 User Role Hierarchy

```
admin           → Full access (all data)
ccf             → State-level (all data, read-only analytics)
biologist       → State-level (research access)
veterinarian    → State-level (medical response)
dfo             → Division-scoped
rrt             → Division-scoped (Rapid Response Team)
range_officer   → Range-scoped
beat_guard      → Beat-scoped
volunteer       → Own reports only
```

---

## 🔄 Offline Sync Architecture

```
Field staff enters report
        ↓
ReportStepper (multi-step form)
        ↓
Saved to Dexie (IndexedDB) with sync_status='pending'
        ↓
SyncService.ts (runs on connect)
        ↓
  ┌─────────────────┐
  │ reports table   │ ← location as PostGIS POINT
  │ observations    │ ← normalized counts
  │ conflict_damages│ ← if loss type
  │ report_media    │ ← via Supabase Storage bucket
  └─────────────────┘
        ↓
sync_status = 'synced'
```

---

## 🚀 Running Locally

```bash
cd "eravat-app"
npm install
npm run dev         # → http://localhost:5173
```

---

## 🚧 Known Issues / Notes

1. **Email Confirmation** — New users created via `supabase.auth.signUp()` may need email confirmation disabled in Supabase Auth settings for dev.
2. **Profile trigger** — There is no DB trigger auto-creating profile rows yet. After creating auth user, you must `UPDATE public.profiles SET role = 'admin' ...` manually.
3. **Geography data** — `geo_divisions`, `geo_ranges`, `geo_beats` are currently empty. Need to be seeded with actual Maharashtra forest department territory data.
4. **Mobile build** — Capacitor Android build had JDK path issues (see session 2026-02-21). Configure `JAVA_HOME` in Android Studio.
