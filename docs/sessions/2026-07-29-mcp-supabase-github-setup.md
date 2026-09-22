# Session: 2026-07-29 — Project MCP setup (Supabase + GitHub)

## Goal

Arm Desktop Cursor and Cloud Agents with shared Supabase + GitHub MCP for Eravat 2.0.

## Changes

- [`.cursor/mcp.json`](../../.cursor/mcp.json): `supabase-prod` (`mnytrlcmdpkfhrzrtesf`), `supabase-staging` (`ttjtyvxfiqhjdngkgdkf`), `github` (`${env:GITHUB_PAT}`).
- [`docs/MCP_SETUP.md`](../MCP_SETUP.md): copy-paste Cloud Agents + Desktop auth steps.
- Cursor rule + doc links.

## Manual follow-up (human)

1. Cloud Agents MCP UI: add all three HTTP servers; OAuth both Supabase; GitHub PAT header.
2. Desktop Tools & MCP: same auth (not the Plugins release page).
3. Start a **new** Cloud Agent to verify.
