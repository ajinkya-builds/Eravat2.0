# MCP setup — do this once (Supabase prod + staging + GitHub)

Agents **cannot** finish OAuth or paste PATs for you. Repo config is already set in [`.cursor/mcp.json`](../.cursor/mcp.json). You only need to enable + authenticate the same servers in Cursor.

| Server name | Points at | Project ref |
|-------------|-----------|-------------|
| `supabase-prod` | Production DB | `mnytrlcmdpkfhrzrtesf` |
| `supabase-staging` | Staging DB | `ttjtyvxfiqhjdngkgdkf` |
| `github` | GitHub API (PRs, issues, Actions) | — |

> Cloud Agents **ignore** `.cursor/mcp.json` until the same servers are added under [cursor.com/agents](https://cursor.com/agents) → MCP (or Dashboard → Integrations & MCP).

---

## A. Cloud Agents (required for agents like this one)

Do these **3 adds** on [cursor.com/agents](https://cursor.com/agents) → open the **MCP** dropdown → **Add MCP server** (type **HTTP**).

### 1) Supabase production

| Field | Value |
|-------|--------|
| Name | `supabase-prod` |
| URL | `https://mcp.supabase.com/mcp?project_ref=mnytrlcmdpkfhrzrtesf&features=docs,database,debugging,development,functions` |
| Auth | Click **Connect / Authenticate** → browser OAuth → choose the Supabase org that owns Eravat prod |

### 2) Supabase staging

| Field | Value |
|-------|--------|
| Name | `supabase-staging` |
| URL | `https://mcp.supabase.com/mcp?project_ref=ttjtyvxfiqhjdngkgdkf&features=docs,database,debugging,development,functions` |
| Auth | Same OAuth (usually already done after #1) |

### 3) GitHub

| Field | Value |
|-------|--------|
| Name | `github` |
| URL | `https://api.githubcopilot.com/mcp/` |
| Headers | Key: `Authorization` · Value: `Bearer ` + your PAT (one space after Bearer) |

**Create the PAT** (if you don’t have one): https://github.com/settings/tokens  
- Classic: enable `repo`, `read:org`, `workflow` (optional but useful)  
- Or fine-grained: this repo `ajinkya-builds/Eravat2.0` with Contents/PRs/Issues/Actions read-write as you prefer  

Paste the token **only** in the MCP header field — never in chat or git.

Then: **enable** all three for Cloud Agents → start a **new** Cloud Agent (this run cannot pick them up mid-flight).

---

## B. Desktop Cursor (your Mac) — same three servers

1. Merge/pull so `.cursor/mcp.json` is present.
2. **Settings → Tools & MCP** (not Plugins).
3. You should see `supabase-prod`, `supabase-staging`, `github`.
4. Authenticate both Supabase entries (OAuth).
5. For GitHub either:
   - `export GITHUB_PAT=ghp_…` in your shell and restart Cursor, or  
   - paste `Bearer ghp_…` in that server’s Headers UI.
6. Ignore the Plugins → Supabase card that opens a GitHub **release** page — that is the plugin package, not auth.

---

## C. How you’ll know it worked

Ask a **new** Cloud Agent:

> List your MCP servers. Using supabase-prod and supabase-staging, list tables (or migrations) on each. Using github, list open PRs on Eravat2.0.

Expected: tools from `supabase-prod`, `supabase-staging`, `github`, plus `cursor-cloud`.

---

## D. Optional: Supabase access token instead of OAuth

Only if OAuth fails in Cloud Agents: create a token at https://supabase.com/dashboard/account/tokens and set header `Authorization: Bearer <token>` on both Supabase HTTP servers in the Agents MCP UI.

---

## Security

- MCP uses **your** permissions on those projects.
- Prefer staging for experiments; treat prod writes carefully.
- Never commit PATs. Dashboard headers are encrypted/redacted after save.
