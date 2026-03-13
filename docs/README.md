# Eravat 2.0 — Project Context & Architecture

> **AI Context File** — This folder is updated at the end of every development
> session. Always read `README.md` + the latest session log before starting new
> work.

---

## 📱 What Is Eravat?

**Eravat 2.0** is a mobile-first Progressive Web App (PWA) for the **Forest
Department** to log and manage elephant activity reports. Field staff record
sightings, indirect signs, and human-wildlife conflict damage, which syncs to a
centralised Supabase backend when online.

---

## 🛠 Tech Stack

| Layer      | Technology                                 |
| ---------- | ------------------------------------------ |
| Frontend   | React 18, TypeScript, Vite                 |
| Styling    | Tailwind CSS v4 (via `@tailwindcss/vite`)  |
| Animation  | Framer Motion                              |
| Icons      | Lucide React                               |
| Routing    | React Router DOM v6                        |
| Database   | Supabase (PostgreSQL + PostGIS)            |
| Auth       | Supabase Auth (Email/Phone via conversion) |
| Offline DB | Dexie.js (IndexedDB wrapper)               |
| PWA        | Service Worker + Vite PWA Plugin           |
| Mobile     | Capacitor (Android/iOS build target)       |

---

## 🎨 Branding & UI

### Logo Assets

- **Primary Logo**: `elephant-logo.png` (sourced from legacy Android
  `ic_launcher_foreground.png`).
- **Scaling Fix**: Due to Android "safe zone" padding, the logo is wrapped in a
  CSS container (`overflow-visible`) and scaled to `150%` to ensure the elephant
  fills the intended bounding box.
- **Localized Typography**: Both "Wild Elephant Monitoring System" and "जंगली
  हाथी निगरानी प्रणाली (2025)" are prominently displayed on the Login and
  Dashboard entry screens.
- **Dynamic Styling**: Branding headers use a `from-primary to-emerald-500`
  gradient for a modern, field-friendly look.

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
│   │       ├── AdminDivisions.tsx # Divisions & primary contacts hierarchy
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

> **Note:** The new `sb_publishable_` key format replaces the legacy `anon` JWT
> key in newer Supabase projects. It works identically with
> `@supabase/supabase-js` v2.

---

## 🗄 Supabase Database Schema

Project URL: `https://mnytrlcmdpkfhrzrtesf.supabase.co`

### Custom Enum Types

```sql
user_role  -- admin, ccf, biologist, veterinarian, dfo, rrt, range_officer, beat_guard, volunteer
obs_type   -- direct_sighting, indirect_sign, conflict_loss
loss_category -- (for conflict_damages)
sync_status   -- pending, synced, reviewed
```

### Tables

#### `profiles` — User Profiles

Links directly to `auth.users` by `id` (same UUID, no separate `auth_id`
column).

| Column       | Type        | Notes           |
| ------------ | ----------- | --------------- |
| `id`         | uuid PK     | = auth.users.id |
| `role`       | user_role   | Enum            |
| `first_name` | text        |                 |
| `last_name`  | text        |                 |
| `phone`      | text        |                 |
| `is_active`  | bool        |                 |
| `created_at` | timestamptz |                 |
| `updated_at` | timestamptz |                 |

#### `geo_divisions` — Division-level Geography

| Column       | Type        |
| ------------ | ----------- |
| `id`         | uuid PK     |
| `name`       | text        |
| `code`       | text        |
| `state`      | text        |
| `created_at` | timestamptz |

#### `geo_ranges` — Range-level Geography

| Column        | Type                 |
| ------------- | -------------------- |
| `id`          | uuid PK              |
| `division_id` | uuid → geo_divisions |
| `name`        | text                 |
| `code`        | text                 |
| `created_at`  | timestamptz          |

#### `geo_beats` — Beat-level Geography

| Column       | Type                        |
| ------------ | --------------------------- |
| `id`         | uuid PK                     |
| `range_id`   | uuid → geo_ranges           |
| `name`       | text                        |
| `code`       | text                        |
| `boundary`   | geography (PostGIS polygon) |
| `created_at` | timestamptz                 |

#### `user_region_assignments` — Maps users to their territory

| Column               | Type                 |
| -------------------- | -------------------- |
| `id`                 | uuid PK              |
| `user_id`            | uuid → profiles      |
| `division_id"        | uuid → geo_divisions |
| `range_id`           | uuid → geo_ranges    |
| `beat_id`            | uuid → geo_beats     |
| `is_primary_contact` | bool                 |
| `assigned_at`        | timestamptz          |

#### `reports` — Field Reports (parent)

| Column              | Type             | Notes                     |
| ------------------- | ---------------- | ------------------------- |
| `id`                | uuid PK          |                           |
| `user_id`           | uuid → profiles  | Reporter                  |
| `beat_id`           | uuid → geo_beats | Territory                 |
| `device_timestamp`  | timestamptz      | When recorded             |
| `location`          | geography        | PostGIS POINT (SRID 4326) |
| `status`            | sync_status      | pending/synced/reviewed   |
| `notes`             | text             |                           |
| `server_created_at` | timestamptz      | Server insert time        |

#### `observations` — Observation Details (child of reports)

| Column                  | Type           | Notes                                       |
| ----------------------- | -------------- | ------------------------------------------- |
| `id`                    | uuid PK        |                                             |
| `report_id`             | uuid → reports |                                             |
| `type`                  | obs_type       | direct_sighting/indirect_sign/conflict_loss |
| `male_count`            | int4           |                                             |
| `female_count`          | int4           |                                             |
| `calf_count`            | int4           |                                             |
| `unknown_count`         | int4           |                                             |
| `compass_bearing`       | numeric        | 0–360°                                      |
| `indirect_sign_details` | text[]         | Array of sign types                         |

#### `conflict_damages` — Damage Reports (child of reports)

| Column            | Type           |
| ----------------- | -------------- |
| `id`              | uuid PK        |
| `report_id`       | uuid → reports |
| `category`        | loss_category  |
| `description`     | text           |
| `estimated_value` | numeric        |

#### `report_media` — Photos (child of reports)

| Column         | Type                |
| -------------- | ------------------- |
| `id`           | uuid PK             |
| `report_id`    | uuid → reports      |
| `file_path`    | text (Storage path) |
| `created_at`   | timestamptz         |

> **Important:** live environments may differ in optional path/mime columns
> (`file_path`, `storage_path`, `path`, etc.). The sync layer now uses fallback
> payload shapes to handle schema drift.

---

## 🔐 RLS Policies

| Table                     | Status      | Policy Summary                                                                                                            |
| ------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| `reports`                 | **ENABLED** | Admin: full access · DFO/RRT: division-scoped · Range Officer: range-scoped · Beat Guard: beat-scoped · Self: own reports |
| `observations`            | **ENABLED** | Insert/Update if author; View if can view parent report                                                                   |
| `profiles`                | Disabled    | —                                                                                                                         |
| `geo_*`                   | Disabled    | Public read                                                                                                               |
| `user_region_assignments` | Disabled    | —                                                                                                                         |

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
  │ observations    │ ← normalized counts + signs array
  │ conflict_damages│ ← multi-row insert (one per loss type)
  │ report_media    │ ← via Supabase Storage bucket
  └─────────────────┘
        ↓
sync_status = 'synced'
```

---

## 🚀 Running Locally

### Web Development

```bash
cd "eravat-app"
npm install
npm run dev         # → http://localhost:5173
```

### Android Development

1. **Prerequisites**: Requires **JDK 21** and **Android Studio**.
2. **Environment**: Set `JAVA_HOME` to your JDK 21 path (e.g.,
   `export JAVA_HOME=/Library/Java/JavaVirtualMachines/openjdk-21.jdk/Contents/Home`).
3. **Run in Emulator**:
   ```bash
   npm run build
   npx cap sync
   npx cap run android --target <emulator_id>
   ```
4. **Generate APK**:
   ```bash
   npm run build
   npx cap sync
   cd android && ./gradlew assembleDebug
   # Output: android/app/build/outputs/apk/debug/app-debug.apk
   ```

---

## 🚧 Known Issues / Notes

1. **Email Confirmation** — New users created via `supabase.auth.signUp()`
   normally need email confirmation disabled in Supabase Auth settings for dev.
   Our custom Edge function logic automatically unpads this.
2. **User Management** — Handled entirely by the Edge Functions (`create-user`,
   `update-user`, `delete-user`) to securely operate on `auth.users` with
   Role-Based Access Control.
3. **Geography data** — `geo_divisions`, `geo_ranges`, `geo_beats` have been
   seeded with initial Madhya Pradesh forest department territory data.
4. **Mobile build** — Fixed Android Capacitor build and initialized location
   permissions. Requires JDK 21. Ensures assets are served from `/` (localhost)
   for native Capacitor compatibility.
5. **Notifications** — Enriched notifications are dispatched to Range Officers
   and DFOs via SQL triggers after data insertion.
6. **Multi-Select** — Supporting true multi-row conflict reporting and
   array-based indirect signs.
7. **Auth Diagnostics** — `signInWithPhone` now emits console logs to help debug
   "Phone not found" errors in the field.
8. **Sync Safety (2026-03-14)** — Auto-sync now processes pending reports by
   default. Manual sync includes failed reports for remediation. Media insert and
   conflict damage writes are hardened for live-schema drift.

---

## 🌎 Deployment

### GitHub Pages

The application is configured to deploy to GitHub Pages with a specific base
path override.

1. `npm run deploy`

> **Note:** The `predeploy` script automatically runs
> `vite build --base=/Eravat2.0/` to ensure asset paths are correct for GitHub
> Pages, while the standard `npm run build` is kept clean for Capacitor/Native
> compatibility.
