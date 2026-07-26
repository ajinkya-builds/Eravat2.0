# Local Development — Supabase on Your Laptop

> **Goal:** Develop and test against a **local copy** of production. Cloud Supabase (`mnytrlcmdpkfhrzrtesf`) stays **production only**.

---

## What you get locally (Option A)

| Included | Count (snapshot) |
|----------|------------------|
| Users + login (`auth.users`, `profiles`) | 108 |
| Geography (`geo_divisions`, `geo_ranges`, `geo_beats`) | 11 / 80 / 1,222 |
| Reports + observations | 35 / 45 |
| RLS policies, triggers, RPCs | Yes (from baseline schema) |

**Not included:** report photo files in Storage, Twilio SMS, push notifications.

---

## Prerequisites

1. **Docker Desktop** — must be running (whale icon in menu bar).
2. **Supabase CLI** — already installed (`supabase --version`).
3. Project linked to production (`supabase projects list` shows ● on Eravat 2.0).

---

## First-time setup (one command)

From the repo root:

```bash
./scripts/bootstrap-local-supabase.sh
```

This will:

1. Dump production data to `supabase/seeds/02_remote_app_data.sql` (gitignored).
2. Start local Supabase in Docker.
3. Apply the baseline schema migration.
4. Load the production data snapshot.

Then start the app:

```bash
cd eravat-app
npm run dev
```

Open http://localhost:5173 and log in with your **same production phone/password**.

---

## URLs when running locally

| Service | URL |
|---------|-----|
| Eravat app | http://localhost:5173 |
| Supabase API | http://127.0.0.1:54321 |
| Supabase Studio (DB admin UI) | http://127.0.0.1:54323 |
| Postgres direct | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

---

## Environment files

| File | Purpose |
|------|---------|
| `eravat-app/.env.local` | **Default for dev** — points at local Supabase |
| `eravat-app/.env.production.local` | Optional — swap in when you need to hit cloud prod from your laptop |
| GitHub Actions secrets | Production deploy only (`VITE_SUPABASE_*` on `main` → gh-pages) |

To temporarily use production from your laptop, copy `.env.production.local` over `.env.local` (or swap the `VITE_SUPABASE_URL` values).

---

## Daily commands

```bash
# Start local Supabase (if Docker was restarted)
supabase start --ignore-health-check

# Stop local Supabase (frees RAM)
supabase stop

# Refresh local data from production (after prod changes you want locally)
./scripts/refresh-local-data.sh

# Full rebuild from scratch
./scripts/bootstrap-local-supabase.sh
```

---

## How schema is managed

| Location | Purpose |
|----------|---------|
| `supabase/migrations/20260220100000_remote_baseline_schema.sql` | Full schema snapshot for **local bootstrap** |
| `supabase/migrations_applied_on_remote/` | Historical migrations already applied on production (reference only) |
| New migration files in `supabase/migrations/` | Future changes — test locally, then `supabase db push` to production |

**Workflow for database changes:**

1. Write and test migration locally.
2. Apply to production via Supabase MCP or `supabase db push` (see `docs/SUPABASE_OPERATIONS.md`).
3. Optionally refresh local data: `./scripts/refresh-local-data.sh`.
4. Periodically re-dump baseline schema if local drift is hard to manage.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Cannot connect to Docker daemon` | Open Docker Desktop and wait until it says "Running" |
| `supabase start` fails health check | Use `supabase start --ignore-health-check` (edge runtime may show a warning; core DB/API still work) |
| Login fails locally | Confirm `eravat-app/.env.local` has `VITE_SUPABASE_URL=http://127.0.0.1:54321` |
| Empty dashboard | Run `./scripts/bootstrap-local-supabase.sh` to reload data |
| Seed file missing | Script auto-dumps from linked production project |

---

## Security notes

- `supabase/seeds/02_remote_app_data.sql` contains **real user passwords (hashed)** and is **gitignored**.
- Local Supabase uses **default dev keys** — never expose your laptop's port 54321 to the public internet.
- Production keys stay in `.env.production.local` and GitHub secrets only.

---

## Related docs

- [`SUPABASE_OPERATIONS.md`](./SUPABASE_OPERATIONS.md) — production migration policy
- [`README.md`](./README.md) — full architecture
- [`testing/E2E_RUN_LOG.md`](./testing/E2E_RUN_LOG.md) — Playwright against localhost:5173
