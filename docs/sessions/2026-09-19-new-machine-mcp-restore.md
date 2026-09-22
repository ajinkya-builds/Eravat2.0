# Session: 2026-09-19 — New machine MCP restore

## Goal

Restore Desktop MCP servers used by Eravat (from prior `cursor/mcp-supabase-github-setup-612f` work) plus PostHog on a new Mac.

## Done on this machine

- Wrote [`.cursor/mcp.json`](../../.cursor/mcp.json) with `supabase-prod`, `supabase-staging`, `github`, `posthog`.
- Mirrored servers in `~/.cursor/mcp.json` (GitHub Authorization header set locally from `gh auth token`; file mode `600`).
- Restored / updated [`docs/MCP_SETUP.md`](../MCP_SETUP.md) and [`.cursor/rules/mcp-project-setup.mdc`](../../.cursor/rules/mcp-project-setup.mdc).
- Installed Cursor marketplace plugins: **posthog**, **github**.
- Authenticated: `user-supabase-prod`, `user-supabase-staging`, `user-posthog`, plus existing `plugin-supabase-supabase`.
- `gh` auth OK; `GITHUB_PAT` / `GITHUB_PERSONAL_ACCESS_TOKEN` in `~/.zshrc` + LaunchAgent `com.eravat.github-mcp-env`.
- Supabase CLI: `/opt/homebrew/bin/supabase` v2.117.0.

## Still needs one human action

1. **Fully quit and relaunch Cursor** so GitHub MCP (`user-github`) reloads with the token (or paste a PAT in **Plugins → GitHub → Configure**).
2. Optional: restore missing `supabase/.env` / root `.env` from the old machine for Edge Function local serve.
