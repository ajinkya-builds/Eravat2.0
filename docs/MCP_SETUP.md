# MCP setup — Supabase + GitHub (project-wide)

This repo declares shared MCP servers in [`.cursor/mcp.json`](../.cursor/mcp.json) so **Desktop Cursor**, **Cloud Agents**, and teammates can use the same tooling.

| Server | URL | Auth |
|--------|-----|------|
| **supabase** | `https://mcp.supabase.com/mcp?project_ref=mnytrlcmdpkfhrzrtesf&features=docs,database,debugging,development,functions` | Browser OAuth (preferred). Optional PAT for headless/CI. |
| **github** | `https://api.githubcopilot.com/mcp/` | GitHub Personal Access Token in `Authorization` header |

Scoped Supabase project: **`mnytrlcmdpkfhrzrtesf`** (Eravat 2.0 prod). Account-level tools are disabled when `project_ref` is set.

> **Important:** Committing `.cursor/mcp.json` configures the **IDE**. Cloud Agents only see MCP servers that are also **enabled in the Cursor Agents / team MCP dashboard**, plus per-user auth.

---

## 1. Desktop Cursor (your Mac)

1. Pull this branch / `main` so `.cursor/mcp.json` is present.
2. Open the repo in Cursor → **Settings → Cursor Settings → Tools & MCP**.
3. Confirm **supabase** and **github** appear.
4. **Supabase:** click Connect / Authenticate → complete browser OAuth → pick the org that owns `mnytrlcmdpkfhrzrtesf`.
5. **GitHub:** create a [fine-grained or classic PAT](https://github.com/settings/tokens) with repo + (as needed) Actions / PR scopes.
6. Export it in your shell profile (never commit the token):

   ```bash
   export GITHUB_PAT=ghp_your_token_here
   ```

   Restart Cursor so `${env:GITHUB_PAT}` resolves. Alternatively paste the Bearer token in the MCP server’s Headers UI (stored locally, not in git).

7. Ask the agent: “List Supabase tables via MCP” and “List open PRs via GitHub MCP” to verify.

---

## 2. Cloud Agents (project-wide for this repo)

Cloud Agents **do not** automatically load `.cursor/mcp.json`. Register the same HTTP servers in the dashboard:

1. Open [cursor.com/agents](https://cursor.com/agents) → MCP dropdown → **Add MCP server**  
   **or** (Teams) **Dashboard → Integrations & MCP**.
2. Add **HTTP** servers (recommended; credentials stay out of the VM):

   **Supabase**

   - Name: `supabase`
   - URL: `https://mcp.supabase.com/mcp?project_ref=mnytrlcmdpkfhrzrtesf&features=docs,database,debugging,development,functions`
   - Auth: complete **OAuth** when prompted (per user).

   **GitHub**

   - Name: `github`
   - URL: `https://api.githubcopilot.com/mcp/`
   - Headers: `Authorization` = `Bearer <GITHUB_PAT>`  
     (stored encrypted/redacted in the dashboard — do not put the raw PAT in the repo.)

3. Enable both servers for Cloud Agents / link to the team marketplace if you want teammates to install them once.
4. Start a **new** Cloud Agent run and ask it to list MCP tools — `supabase` and `github` should appear alongside `cursor-cloud`.

OAuth is **per-user**, even for team-shared servers. Each person who runs agents must authenticate Supabase once.

### Optional: Supabase PAT for headless Cloud Agents

If browser OAuth is awkward, create a [Supabase access token](https://supabase.com/dashboard/account/tokens) and set the HTTP header in the Cloud Agents MCP form:

```http
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
```

Do not commit that token. Prefer OAuth when available.

---

## 3. What agents can do once connected

| Supabase MCP | GitHub MCP |
|--------------|------------|
| `list_tables`, `execute_sql`, `apply_migration`, `list_migrations` | Issues, PRs, file contents, search, Actions (per PAT scopes) |
| `get_logs`, `get_advisors` | Repo metadata |
| `list_edge_functions`, `deploy_edge_function` | |
| `search_docs`, `get_project_url`, `get_publishable_keys` | |

Repo policy for DB changes remains: update `supabase/migrations/`, apply remotely, verify — see [`SUPABASE_OPERATIONS.md`](./SUPABASE_OPERATIONS.md).

---

## 4. Security notes

- MCP runs with **your** Supabase/GitHub permissions.
- This project intentionally scopes Supabase MCP to **production** `mnytrlcmdpkfhrzrtesf` (same as go-live ops). Review every write/`apply_migration` / `deploy_edge_function` call.
- Never commit PATs, service role keys, or OAuth secrets. Use `${env:…}` or dashboard encrypted headers.
- Keep Cursor’s tool-call approval on for destructive operations.

---

## 5. Verify checklist

- [ ] `.cursor/mcp.json` present on the branch you use
- [ ] Desktop: Supabase OAuth connected; `GITHUB_PAT` set
- [ ] Cloud Agents dashboard: both HTTP servers added + enabled
- [ ] New Cloud Agent run sees `supabase` and `github` in MCP tools
- [ ] Smoke: `list_tables` / `list_migrations` and a GitHub `list_pull_requests` (or equivalent) succeed
