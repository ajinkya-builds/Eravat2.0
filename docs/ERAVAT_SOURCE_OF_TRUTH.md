# Eravat 2.0 — The Ultimate Source of Truth & Technical Handbook

> **Project Status:** Production / Active Development\
> **Last Comprehensive Audit:** 2026-02-26\
> **Target Audience:** Developers, Administrators, AI Agents

This document provides a 360-degree view of **Eravat 2.0**, consolidating all
functional, technical, and historical context built into the application.

---

## 1. Project Vision & User Personas

### 1.1 The Mission

Eravat 2.0 is a mobile-first digital platform for the **Forest Department** to
modernize wild elephant monitoring. The primary focus is **offline reliability**
in dense forest regions and **structured data collection** to inform Rapid
Response Teams (RRT) and conservation research.

### 1.2 User Personas & Permissions (RBAC)

| Role              | Scope    | Primary Actions                                                |
| :---------------- | :------- | :------------------------------------------------------------- |
| **Admin**         | Global   | Full system access, personnel management, global analytics.    |
| **CCF**           | State    | Read-only global analytics, state-level monitoring.            |
| **Biologist/Vet** | Research | Specialized research access to observation data.               |
| **DFO**           | Division | Manages Range Officers/Beat Guards in their Division.          |
| **Range Officer** | Range    | Manages Beat Guards in their Range; receives proximity alerts. |
| **Beat Guard**    | Beat     | Field reporting, territory monitoring, local history view.     |
| **Volunteer**     | Self     | Citizen reporting; can only view their own submissions.        |

---

## 2. Technical Architecture Deep Dive

### 2.1 The Stack

- **Frontend Framework**: React 18 + Vite (optimized for fast cold starts).
- **Type Safety**: TypeScript 5+ with strict mode.
- **Styling Engine**: **Tailwind CSS v4** (using `@tailwindcss/vite`).
- **Persistence (Online)**: Supabase (PostgreSQL 15 + PostGIS).
- **Persistence (Offline)**: **Dexie.js** (Standardized IndexedDB wrapper).
- **Native Bridge**: **Capacitor 8.0** (Targeting Android SDK 34/35).
- **Global State**: React Context API (`AuthContext`, `ActivityFormContext`).
- **I18n**: `react-i18next` with English and Hindi (`hi`) bundles.

### 2.2 Offline-First Sync Strategy

The application uses a "Shadow Database" pattern.

1. **Collector**: User enters data into `ReportStepper`.
2. **Local Commit**: Data is saved to `Dexie` with `sync_status = 'pending'`.
3. **Connectivity Watcher**: `SyncService.ts` fires on network restoration.
4. **Normalized Upsert**: The flat local object is parsed into three server-side
   tables (`reports`, `observations`, `conflict_damages`).

---

## 3. Database Schema & Spatial Logic

### 3.1 Core Tables

#### `profiles` (User Meta)

- `id`: UUID (FK to `auth.users.id`).
- `role`: Enum (`user_role`).
- `phone`: Text (Fuzzy-matched via RPC for login).
- `notification_radius_km`: Integer (Default 10, Range 1–500).

#### `reports` (Parent)

- `location`: **PostGIS Geometry** `SRID=4326;POINT(lng lat)`.
- `device_timestamp`: Timestamptz (Captured at the moment of sighting).

#### `observations` (Child)

- `type`: Enum (`direct_sighting`, `indirect_sign`, `conflict_loss`).
- `indirect_sign_details`: **PostgreSQL Array** (`text[]`) — Supports
  multi-select signs like "Dung", "Pugmark", "Broken Branches".

#### `geo_*` (Territory)

- `geo_divisions`, `geo_ranges`, `geo_beats`.
- **Centroids**: Each contains a `centroid` column (Point) for fast radial
  notification triggering.

### 3.2 SQL Triggers & Logic

- **Enriched Notifications**: Instead of simple insertion webhooks, Suapbase
  triggers fetch the Beat/Range names to send human-readable alerts:\
  _"3 elephant(s) recorded in Pali Beat (Pali Range)."_
- **Proximity Logic**: Uses `ST_DWithin` to compare incoming report coordinates
  against user-specific territory centroids.

---

## 4. UI/UX Design System

### 4.1 Branding Rationale

- **The Elephant Logo**: Sourced from legacy Android assets.
- **Visual Fix**: The logo is wrapped in an `overflow-visible` container and
  scaled to **150%** relative to its parent to negate built-in Android "safe
  zone" padding, ensuring the elephant icon appears prominent and clear.
- **Ambient UI**: Uses Framer Motion for glassy transitions and "Ambient Glows"
  (top-left/bottom-right) to reduce ocular strain for field workers in variable
  lighting.

### 4.2 Mobile-Specific Components

- **Custom Counters**: Replaced standard HTML number inputs with `+` / `-`
  buttons to prevent the mobile keyboard from obscuring the form.
- **Compass Rose**: Uses `deviceorientationabsolute` on Android to provide a
  high-precision compass for recording elephant movement direction.

---

## 5. Security & RBAC Enforcement

### 5.1 Edge Functions (The Multi-Layer Guard)

Mutations on `auth.users` are prohibited from the client side. Management is
delegated to Supabase Edge Functions:

1. **`create-user`**: Validates admin JWT -> Creates Auth User -> Inserts
   Profile -> Maps Territory.
2. **`update-user`**: Handles safe password resets and geography re-assignment.
3. **`delete-user`**: Performs a cascading delete (Assignment -> Profile ->
   Auth).

### 5.2 RLS Rules

- `reports`: Visible if (`user_role = 'admin'`) OR (`beat_id` in user's
  assignment) OR (`user_id = auth.uid()`).
- `notifications`: Strictly scoped where `user_id = auth.uid()`.

---

## 6. Development & Operations

### 6.1 Building for Android

1. **Requirement**: JDK 21. Any lower version will cause Capacitor gradle
   failure.
2. **Pathing**: The app must be built with `npm run build` (no base path) for
   native use.
3. **Permissions**: Requires `ACCESS_FINE_LOCATION` and `ACCESS_COARSE_LOCATION`
   in the manifest.

### 6.2 Deployment Pipeline (GitHub Pages)

- **Subpath**: The site is hosted under `/Eravat2.0/`.
- **Automation**: `npm run deploy` triggers a build using `--base=/Eravat2.0/`
  to ensure relative asset resolution on the web.

---

## 7. Historical Context & Troubleshooting Logs

### 7.1 Major Bugs Resolved

1. **The White Screen of Death**: Resolved by decoupling the Vite `base` path
   from the main config, allowing Capacitor to serve from `localhost/` while GH
   Pages served from a subpath.
2. **The "Ajinkya" Login Failure**: Diagnosed as a digit-swap typo in the
   database (`9765...` vs `9756...`). Resolved by updating the `profiles` table.
3. **Sync Data Loss**: Fixed a column mismatch (`observation_type` vs `type`)
   and added 10-digit fuzzy matching to the phone-to-email RPC.
4. **Corrupted Assets**: Fixed the Elephant logo which was originally a 39-byte
   corrupted pointer by extracting the raw payload from native assets.

### 7.2 Core Refactors

- **Map Refactor**: Moved from server-side GeoJSON processing to **Client-side
  WKB parsing** (using `@turf/turf` and `wkx`) to allow real-time boundary
  rendering without database lag.
- **Notification Chain**: Switched from report-level triggers to
  observation-level triggers to ensure notifications contain actual sighting
  counts, not just empty shells.

---

> **End of Source of Truth**\
> _Maintainer Note: Keep this updated after every major feature merge._
