# MCP setup — Desktop vs Cloud (verified)

## What works where

| Surface | How MCP is configured | Notes |
|---------|----------------------|--------|
| **Desktop Cursor (Mac)** | `.cursor/mcp.json` + **Customize → MCPs** | Repo file already declares `supabase-prod`, `supabase-staging`, `github`. |
| **Cloud Agents — Pro** | **Only** via [cursor.com/agents](https://cursor.com/agents) → **New Agent** → MCP controls under the prompt | **Not** on Integrations. Pro does not show “Add MCP” there. |
| **Cloud Agents — Teams** | Also [Dashboard → Integrations](https://cursor.com/dashboard/integrations) → **Team MCP Servers** / Add MCP | Team-plan UI. Missing on Pro is expected. |

Official correction from Cursor staff (Mar 2026): Cloud Agents do **not** auto-load `.cursor/mcp.json`. Configure via `cursor.com/agents`; Team Plan also gets `cursor.com/dashboard/integrations`.

---

## Repo config (Desktop)

[`.cursor/mcp.json`](../.cursor/mcp.json):

| Name | Project |
|------|---------|
| `supabase-prod` | `mnytrlcmdpkfhrzrtesf` |
| `supabase-staging` | `ttjtyvxfiqhjdngkgdkf` |
| `github` | `https://api.githubcopilot.com/mcp/` + `${env:GITHUB_PAT}` |

---

## Cloud Agents on Pro — where Add MCP actually is

Do **not** use Integrations (GitHub/Slack page). That page has no MCP on Pro.

1. Open **https://cursor.com/agents**
2. Start **New Agent** (empty compose screen — not an already-running chat).
3. Leave the prompt **empty**.
4. Below the prompt, open the **MCP** dropdown / icon.
5. Click **+** → add custom HTTP (or library entry), then **Add MCP**.

Verified UI path from Cursor forum (Apr 2026): *New Agent → MCP dropdown below prompt → + → Add MCP*.

Add:

**supabase-prod**  
`https://mcp.supabase.com/mcp?project_ref=mnytrlcmdpkfhrzrtesf&features=docs,database,debugging,development,functions`

**supabase-staging**  
`https://mcp.supabase.com/mcp?project_ref=ttjtyvxfiqhjdngkgdkf&features=docs,database,debugging,development,functions`

**github**  
URL `https://api.githubcopilot.com/mcp/`  
Header `Authorization: Bearer <PAT>` (literal token in Cloud UI; `${env:…}` interpolation is unreliable there per Cursor staff).

6. Enable the toggles for the new agent, then send the prompt / start the run.

If that MCP control is still missing on New Agent, that is a product/UI gap on your account — not something an agent can fix from the VM. Use Desktop for Supabase until Cursor Support confirms Cloud MCP for your plan, or use a Team plan Integrations → Team MCP Servers path.

---

## Honest limits

- This Cloud Agent run only has `cursor-cloud` until you add/enable servers on a **new** agent.
- Desktop auth does not transfer to Cloud.
- Integrations “GitHub Connected” ≠ GitHub MCP.
