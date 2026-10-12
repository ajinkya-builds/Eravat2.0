# Phase 0 — Prod ↔ UAT sync audit (Hathi Mitra)

**Date:** 2026-08-02  
**Prod:** `mnytrlcmdpkfhrzrtesf` (Eravat 2.0)  
**UAT:** `ttjtyvxfiqhjdngkgdkf` (Eravat UAT)  
**App branch:** `cursor/batch1-settings-hindi-177a`

## Verdict

Schema/migration history was already aligned. UAT edge functions were behind prod; they were brought in line before Hathi Mitra work. **Villagers schema was applied only on UAT.** Prod still has no `villages` / `villagers` tables.

## Migrations

| Check | Result |
|-------|--------|
| Migration versions on prod vs UAT | Identical (through `20260626074932_fix_assign_report_geography_search_path`) |
| Public base tables | Identical (13 tables) before this feature |
| Helper RPCs (`get_my_role`, geo scope helpers) | Present on both |

## Data / geography

| Check | Result |
|-------|--------|
| `geo_divisions` names + IDs | Match on prod and UAT |
| CSV Division → geo mapping | `Bandhavgarh TR`→`Bandhavgarh NP`, `Sanjay TR`→`Sanjay National Park`; others by exact name |

## Edge functions (drift found + fixed)

| Function | Before (UAT) | After |
|----------|------------------|--------|
| `create-user` | v1, older hash | Redeployed from repo |
| `update-user` | v1, older hash | Redeployed from repo |
| `delete-user` | Missing | Deployed |
| `send-push` | Missing | Deployed (`verify_jwt=false`, same as prod) |
| `send-push-notifications` | Missing on UAT; **no local `index.ts`** (legacy README-only) | Left as documented orphan on prod; canonical is `send-push` |

## Remaining acceptable drift

- Postgres patch versions differ slightly (UAT `17.6.1.127` vs prod `17.6.1.063`) — platform, not app schema.
- UAT now has **extra** migration `villages_and_villagers_hathi_mitra` + seed data — **intentional**, not for prod until sign-off.
- `send-push-notifications` remains prod-only legacy (not in repo source).

## App baseline

Feature work continues on `cursor/batch1-settings-hindi-177a` with UAT env (`eravat-app/.env.uat.local` → `ttjtyvxfiqhjdngkgdkf`). Do not merge/promote villagers DDL to prod until Ajinkya verifies UAT.
