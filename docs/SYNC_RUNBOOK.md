# Sync Failure Runbook (Field + Dev)

Use this runbook when reports are stuck pending/failed, media does not appear in DB, or console shows repeated Supabase 400 errors.

## 1) Quick Triage

1. Confirm user is authenticated (valid session in app).
2. Confirm network is available.
3. Check browser console for latest `[SyncService] Error details` block.
4. Identify table from URL/error:
   - `/rest/v1/observations`
   - `/rest/v1/conflict_damages`
   - `/rest/v1/report_media`
5. Note `code` and `message` (for example `PGRST204`, `22P02`, `23502`).

## 2) Known Error Patterns and Fixes

### A) `PGRST204` missing column on `report_media`

Symptoms:
- `Could not find the 'content_type' column...`
- `Could not find the 'mime_type' column...`

Meaning:
- Live schema differs from docs and does not include that column.

Current app behavior:
- `syncService` inserts `report_media` with fallback path columns only:
  - `file_path`, `storage_path`, `path`, `media_path`, `object_path`
- It does not rely on `content_type` or `mime_type`.

If this still fails:
- Check latest `report_media` error details and confirm the missing column name.
- Add that path variant in `insertReportMediaWithFallback()`.

### B) `observations` malformed array literal (`22P02`)

Symptoms:
- `malformed array literal: "Dung"` or similar.

Meaning:
- `indirect_sign_details` expected `text[]`, received plain string.

Current app behavior:
- Uses `normalizeTextArray()` before upsert.

If it reappears:
- Verify incoming local value type in Dexie and UI form mapping.

### C) `conflict_damages` enum/id errors

Symptoms:
- `invalid input value for enum loss_category: "fencing"`
- `null value in column "id" violates not-null constraint`

Meaning:
- Enum accepts fewer values than UI labels.
- Table requires explicit UUID id.

Current app behavior:
- Maps UI labels to safe enum values (`none`, `crop`, `livestock`, fallback `property`).
- Uses deterministic UUID for `conflict_damages.id`.
- Writes with upsert for retry safety.

## 3) Pending vs Failed Behavior

- Auto/background sync processes only `pending` reports.
- Manual sync from Dashboard includes failed reports for remediation.
- Dashboard badge shows pending count only.

This prevents repetitive noise from historical failed records while still allowing operator-triggered retries.

## 4) Verification Checklist

After any sync fix:

1. Submit one fresh report with photo.
2. Confirm Storage upload path exists (`report_media` bucket).
3. Confirm row is created in `report_media`.
4. Confirm report moves to `sync_status = 'synced'` in Dexie.
5. Run unit test:
   - `npm run test -- src/services/__tests__/SyncService.test.ts`

## 5) SQL Checks (Supabase SQL Editor)

Use these for quick sanity checks:

```sql
-- Recent report_media rows
select * from public.report_media order by created_at desc limit 20;

-- Recent reports and owners
select id, user_id, beat_id, status, server_created_at
from public.reports
order by server_created_at desc
limit 20;

-- Recent conflict damages
select id, report_id, category, description
from public.conflict_damages
order by id desc
limit 20;
```

## 6) Logging Hygiene

- Keep actionable sync logs (`Error details`, report id, media id).
- Avoid noisy per-item success logs in steady state.
- Ignore dev-only non-actionable logs:
  - React DevTools prompt
  - i18next/locize message

## 7) When Updating Docs

After resolving sync issues:

1. Add a dated session note in `docs/sessions/`.
2. Update `docs/INDEX.md` history.
3. Update `docs/schema.md` with live-schema drift notes.
4. Update `docs/README.md` Known Issues/Notes.

