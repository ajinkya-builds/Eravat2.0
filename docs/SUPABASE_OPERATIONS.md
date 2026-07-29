# Supabase Operations — Agent & Developer Policy

> **Project:** `mnytrlcmdpkfhrzrtesf`  
> **Dashboard:** https://supabase.com/dashboard/project/mnytrlcmdpkfhrzrtesf

**MCP setup (Desktop + Cloud Agents):** see [`MCP_SETUP.md`](./MCP_SETUP.md). Project config lives in [`.cursor/mcp.json`](../.cursor/mcp.json).

---

## Required workflow (always)

When a task needs **any** Supabase change (schema, RLS, triggers, RPCs, Edge Functions):

1. **Add or update** the migration/SQL under `supabase/migrations/` (or `supabase/functions/`) in the repo.
2. **Apply to the live project** — do **not** stop at local files only.
   - **DDL / migrations:** Supabase MCP `apply_migration` (preferred) or `supabase db push`.
   - **Edge Functions:** `supabase functions deploy <name> --project-ref mnytrlcmdpkfhrzrtesf` or MCP `deploy_edge_function`.
3. **Verify** with MCP `execute_sql` or `list_migrations` (columns exist, functions deployed, row counts sane).
4. **Document** in `docs/sessions/` and update `schema.md` / `PROJECT_BRAIN.md` when behavior changes.

---

## MCP tools (Cursor Supabase plugin)

| Tool | Use for |
|------|---------|
| `apply_migration` | DDL + one-shot SQL on remote |
| `execute_sql` | Read-only checks, data fixes (non-DDL) |
| `list_migrations` | Confirm remote migration history |
| `deploy_edge_function` | Edge deploy when CLI unavailable |
| `get_logs` | Debug auth/API errors |

---

## 2026-05-21 — Applied remotely

| Change | Remote status |
|--------|----------------|
| Migration `profile_location_and_volunteer_onboarding` | Applied (`20260521162228`) |
| `profiles.latitude` / `longitude` NOT NULL | Verified |
| RPCs `get_geo_centroid_lat_lng`, `resolve_profile_centroid_lat_lng` | Verified |
| Edge Function `create-user` (volunteer onboarding + GPS) | Deployed via CLI |
