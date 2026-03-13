# Session Log — 2026-03-14 — Sync and Media Schema Drift Fix

## Context

Users reported that photo files were uploading to Supabase Storage, but rows were not being created in `report_media`. The dashboard also showed recurring pending/failed sync noise with repeated 400 errors.

## Symptoms Observed

- `report_media` insert errors from PostgREST:
  - `Could not find the 'mime_type' column of 'report_media' in the schema cache`
  - `Could not find the 'content_type' column of 'report_media' in the schema cache`
- `observations` sync errors:
  - `malformed array literal: "Broken Branches"` (and similar values)
- `conflict_damages` sync errors:
  - `invalid input value for enum loss_category: "fencing"`
  - `null value in column "id" ... violates not-null constraint`
- Repeated background retries caused noisy logs even without active report submission.

## Root Causes

1. **Live DB schema drift** from doc assumptions:
   - `report_media` does not expose `mime_type` or `content_type`.
   - Path column name differs between environments (`file_path` not guaranteed).
2. **Array coercion issue**:
   - `observations.indirect_sign_details` (`text[]`) was occasionally sent as a plain string.
3. **Conflict damage compatibility issues**:
   - `loss_category` enum accepts a narrower value set than UI labels.
   - `conflict_damages.id` is required (no DB default in live env).
4. **Retry strategy**:
   - Auto-sync previously retried failed reports continuously, surfacing historical failures repeatedly.

## Code Changes Applied

### `eravat-app/src/services/syncService.ts`

- Added MIME normalization and stable base64-to-buffer upload path for media.
- Added `normalizeTextArray()` before writing `observations.indirect_sign_details`.
- Reworked `report_media` insert logic:
  - Removed assumptions on `mime_type`/`content_type`.
  - Insert payload now uses only safe keys and path-column fallbacks:
    - `file_path`, `storage_path`, `path`, `media_path`, `object_path`
  - Tries with and without explicit `id`.
  - Caches successful path column hint for later inserts to reduce 400 retries.
- Updated conflict damage sync:
  - Added stable UUID generation for row `id` (deterministic per report/loss row).
  - Mapped unsupported loss labels to safe enum categories.
  - Uses upsert with stable ids for idempotent retries.
- Added defensive logging around report/media insertion while reducing noisy per-item logs.
- Auto-sync now defaults to **pending-only** reports. Optional `includeFailed` is available for manual retry.

### `eravat-app/src/pages/Dashboard.tsx`

- Manual sync now calls `syncData({ includeFailed: true })`.
- Pending badge shows only truly `pending` items (not failed backlog).

### `eravat-app/src/components/reporting/ReportStepper.tsx`

- Hardened data URL parsing for captured photos.
- Normalized image MIME (`image/jpg` -> `image/jpeg`) before local media save.

### `eravat-app/src/hooks/useCamera.ts`

- Normalized camera format values so `jpg` is consistently treated as `jpeg`.

### `eravat-app/index.html`

- Removed `frame-ancestors` from meta CSP (browser ignores it in meta context and emits warning).

## Operational Guidance for Future Sessions

1. **Do not trust docs as exact DB schema** when PostgREST returns `PGRST204`.
   - Use API errors as the source of truth for column existence.
2. **For `report_media` writes**, prefer minimal payload:
   - Always include `report_id`.
   - Include only one candidate path column at a time.
   - Avoid optional metadata columns unless confirmed in live schema.
3. **For array columns (`text[]`)**, always normalize:
   - string -> `[string]`
   - empty -> `null`
4. **For enum writes**, map UI labels to DB enum values explicitly.
5. **For required UUID PKs without defaults**, generate deterministic IDs in client sync layer.
6. **Retry policy**:
   - Background/auto sync: pending only.
   - Manual sync: include failed for operator-driven remediation.

## Validation Performed

- Type/lint diagnostics on edited files: no issues.
- Unit tests: `src/services/__tests__/SyncService.test.ts` passed after each significant sync-service change.

## Follow-Up Recommendation

Create a small authenticated SQL or RPC introspection endpoint for sync-critical tables (`reports`, `observations`, `conflict_damages`, `report_media`) so the client can resolve schema shape once and avoid trial-and-error inserts.

