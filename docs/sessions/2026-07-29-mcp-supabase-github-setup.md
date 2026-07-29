# Session: 2026-07-29 — Project MCP setup (Supabase + GitHub)

## Goal

Arm Desktop Cursor and Cloud Agents with shared Supabase + GitHub MCP for Eravat 2.0.

## Changes

- Added [`.cursor/mcp.json`](../../.cursor/mcp.json): HTTP servers for Supabase (scoped to `mnytrlcmdpkfhrzrtesf`) and GitHub (`api.githubcopilot.com/mcp/` + `${env:GITHUB_PAT}`).
- Added [`docs/MCP_SETUP.md`](../MCP_SETUP.md) with Mac OAuth/PAT steps and Cloud Agents dashboard registration (required — repo file alone does not enable Cloud Agent MCPs).
- Linked from `SUPABASE_OPERATIONS.md`, `LOCAL_DEVELOPMENT.md`, and `INDEX.md`.

## Manual follow-up (human)

1. Desktop: authenticate Supabase OAuth; export `GITHUB_PAT`.
2. Cloud Agents: add the same HTTP servers under [cursor.com/agents](https://cursor.com/agents) MCP / Integrations & MCP; OAuth + encrypted GitHub header.
3. Start a **new** Cloud Agent run to verify both servers appear.
