# Session: 2026-03-07 — Report Activity Sync Bug Fix

## Overview

Investigated and fixed a bug where reports submitted through the in-app wizard were saved to Dexie locally but never appeared in Supabase.

## Root Cause Analysis

Three bugs were found in the sync pipeline (`syncService.ts`):

### Bug 1: Invalid Column — `total_elephants` (Critical)
- **File:** `src/services/syncService.ts` (line 93)
- **Problem:** The `observations` table upsert included `total_elephants`, a field that **does not exist** in the Supabase `observations` schema.
- **Effect:** PostgREST returned a 400 error, causing the entire report to be marked as `failed` locally and never synced.
- **Fix:** Removed `total_elephants` from the upsert payload.

### Bug 2: Invalid UUID Format for Observation ID
- **File:** `src/services/syncService.ts` (line 85)
- **Problem:** Observation IDs were prefixed as `obs-<uuid>` (e.g. `obs-de7271ec-...`). Postgres rejected this because `observations.id` is a `uuid` type, which requires the bare UUID format without any prefix.
- **Fix:** Generate a proper UUID (`crypto.randomUUID()`) for `obs_id` at report-save time and store it in Dexie. `syncService.ts` reads this value for the upsert.

### Bug 3: Invalid Enum Value — `'failed'` on `reports.status`
- **File:** `src/services/syncService.ts` (lines 103, 133, 184)
- **Problem:** On sync failures, the code attempted to set `reports.status = 'failed'`. However, the `sync_status` enum in Supabase only has: `pending | synced | reviewed` — no `'failed'` value.
- **Effect:** The error-recovery `PATCH` itself returned a 400 error, creating a cascading failure log in the console.
- **Fix:** Removed all `supabase.from('reports').update({ status: 'failed' })` calls. Error state is now only tracked in Dexie (as `sync_status: 'failed'`), not pushed to Supabase.

## Files Changed

| File | Change |
|------|--------|
| `src/services/syncService.ts` | Removed `total_elephants`, fixed obs ID, removed invalid enum updates |
| `src/db.ts` | Added `obs_id: string | null` to `LocalReport` interface; bumped to Dexie schema v3 |
| `src/components/reporting/ReportStepper.tsx` | Added `obs_id: crypto.randomUUID()` to the `db.reports.add()` call |
| `src/services/__tests__/SyncService.test.ts` | Added regression test asserting `total_elephants` is never sent to Supabase |

## Verification

- ✅ All 3 unit tests pass (`npx vitest run`)
- ✅ `POST /rest/v1/reports` → **201 Created**
- ✅ `POST /rest/v1/observations` → **201 Created**
- ✅ Reports visible in Supabase Table Editor
- ✅ History page in app shows synced entries
