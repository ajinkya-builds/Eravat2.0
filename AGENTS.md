# AGENTS.md

## Cursor Cloud specific instructions

### What this repo is
Two dev services:
- **Web app** — `eravat-app/`, a React 19 + TypeScript + Vite PWA (Eravat 2.0, elephant monitoring). Served in dev at `http://localhost:5173/Eravat2.0/` (note the `/Eravat2.0/` base path).
- **Backend** — Supabase (Postgres + PostGIS, Auth, Storage, Edge Functions). For local dev use a **local** Supabase stack in Docker; the cloud projects in `docs/` are staging/production only.

Standard commands live in `docs/README.md` and `docs/LOCAL_DEVELOPMENT.md`; `package.json` scripts cover lint/test/build.

### Preinstalled in the VM snapshot (do not add to the update script)
- Docker CE (configured with the `fuse-overlayfs` storage driver; `containerd-snapshotter` disabled), Supabase CLI, Node 22, JDK 21.
- The update script only refreshes JS deps (`npm install --prefix eravat-app`).

### Bringing the environment up (non-obvious; not done by the update script)
Run these once per fresh VM boot, in order:
1. **Start the Docker daemon** (it is NOT auto-started): run `sudo dockerd` in a background/tmux session. If `docker` commands hit a permission error, `sudo chmod 666 /var/run/docker.sock`.
2. **Start local Supabase** from the repo root: `supabase start --ignore-health-check`. The analytics `vector`/logflare container often logs a Rust panic (`invalid authority`) — this is harmless; Postgres/REST/Auth/Storage still work.
3. **Seed the local DB**: `./scripts/dev-seed-local.sh`. This loads MP geography and creates a local admin login. Re-run it after every `supabase db reset` (it is safe to re-run).
4. **Create `eravat-app/.env.local`** (gitignored) with the local URL + publishable key from `supabase status`:
   ```
   VITE_SUPABASE_URL=http://localhost:54321
   VITE_SUPABASE_PUBLISHABLE_KEY=<PUBLISHABLE_KEY from `supabase status`>
   ```
   IMPORTANT: use `http://localhost:54321`, NOT `127.0.0.1`. The app's `index.html` CSP `connect-src` only whitelists `localhost`/`*.supabase.co`, so `127.0.0.1` requests are blocked by the browser.
5. **Run the dev server**: `cd eravat-app && npm run dev`. Editing `.env.local` auto-restarts Vite.

Useful local URLs: API `http://localhost:54321`, Studio `http://127.0.0.1:54323`, Postgres `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

### Test login (local)
Log in with phone `9988775566`, OTP `123456` (a fixed test OTP defined in `supabase/config.toml` `[auth.sms.test_otp]`), then set any 4-digit PIN (e.g. `1111`). After a `supabase db reset`, previously-saved browser PIN sessions become invalid — use a fresh/incognito window to log in again.

### Pre-existing repo caveats (do NOT "fix" these as part of setup)
- `supabase/seeds/01_mp_geography.sql` has a few divisions whose `code` collides with a `UNIQUE(code)` constraint (plus dependent ranges/beats). It must be loaded WITHOUT `ON_ERROR_STOP` (which `dev-seed-local.sh` handles) — a partial load (~8 divisions / ~59 ranges / ~870 beats) is expected and sufficient.
- `scripts/create_admin_user.sql` omits the NOT NULL `profiles.latitude`/`profiles.longitude` columns and fails. Use `scripts/dev-seed-local.sh` to create the local admin instead.
- `supabase/config.toml` `[db.seed] sql_paths = ["./seed.sql"]` points at a file that doesn't exist → `db reset` prints a harmless `no files matched pattern: supabase/seed.sql` warning.

### Lint / test / build (from `eravat-app/`)
- Lint: `npm run lint` — the repo currently has many PRE-EXISTING lint errors (mostly unused vars in `tests/**`); they are not caused by env setup.
- Unit tests: `npm run test:run` (vitest; all pass, no backend needed).
- Build: `npm run build` (tsc + vite). `npm run predeploy`/`deploy` target GitHub Pages.
- E2E: `npm run test:e2e` (Playwright) needs browsers installed and the dev server + seeded local Supabase running.

### Notes
- Local Supabase data is ephemeral (Docker volumes); `supabase stop` / `db reset` wipes it — reseed with `scripts/dev-seed-local.sh`.
- The Android/Capacitor target (JDK 21 is installed) is optional and not required for web development.
