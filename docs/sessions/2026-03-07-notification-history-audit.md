# Session Log: 2026-03-07 (Notification & Activity History Logic Fix)

## Goal
Audit and fix the Proximity Notification radius system, the chain-of-command notification triggers (for beat_guard and others), and the Activity History data scoping.

## What was discovered
1. **Beat Guards Excluded**: The `notify_observation_chain` and `notify_conflict_chain` SQL triggers queried for `range_officer` and `dfo` (and sometimes `rrt`), but completely omitted the `beat_guard` assigned to that specific beat.
2. **Double Notifications**: If a user's assigned territory overlaps closely with their configured `notification_radius_km` (proximity), they would receive *two* notifications for the exact same report (one from the proximity trigger and one from the territory chain-of-command trigger).
3. **History Missing Source Badges**: The `/history` page accurately pulled RLS-scoped reports, but it didn't visually indicate *why* a user was seeing an activity (i.e. was it in their assigned territory, or was it just within their proximity radius?).
4. **Reports RLS Policies**: The territorial scoping rules for the `reports` table were verified to require comprehensive RLS policies matching the user roles.

## What was implemented

### Database (New Migration: `20260307000000_fix_notifications_and_history.sql`)
1. **New Column**: Added `notification_type` (`'territory'` or `'proximity'`) to the `notifications` table.
2. **Deduplication**: Added a unique constraint `UNIQUE (user_id, report_id, notification_type)` to `notifications` to prevent duplicates.
3. **Trigger Refactor**: Rewrote all three notification triggers:
   - `notify_observation_chain` + `notify_conflict_chain`: Now include `beat_guard` properly. Uses `ON CONFLICT DO NOTHING` to insert `'territory'` notifications safely.
   - `notify_proximity_on_report`: Uses `ON CONFLICT DO NOTHING` to insert `'proximity'` notifications. If a user already got a `'territory'` notification for that report, the proximity notification is skipped.
4. **RLS Policies**: Added the complete suite of territorial scoping RLS policies to the `reports` table (e.g., Beat Guard sees beat reports, Range Officer sees range reports, etc.).

> **Action Required**: The migration must be applied manually to the `mnytrlcmdpkfhrzrtesf` Supabase instance via the SQL Editor.

### Frontend
1. **History Badges**: `TerritoryHistory.tsx` was enhanced to display visual tags. It now runs a parallel query to check if a report ID corresponds to a `'proximity'` notification. If so, it gets a blue **"Radius"** badge. Otherwise, it defaults to a green **"Territory"** badge.

### Testing
1. **Unit Tests**: Wrote `NotificationService.test.ts` with 8 unit tests covering all methods (`getNotifications`, `markAsRead`, `markAllAsRead`, `subscribeToNotifications`). Tests pass successfully.
2. **E2E Tests**: Wrote `tests/notifications.spec.ts` to test the Settings Page UI (Proximity Radius slider loads correctly, updates state) and the `/history` UI badges. Note that these skip safely if `TEST_PHONE` auth env vars aren't provided.

## Next Steps
- Apply the SQL migration to the production Supabase instance.
- Check the E2E and unit test executions.
