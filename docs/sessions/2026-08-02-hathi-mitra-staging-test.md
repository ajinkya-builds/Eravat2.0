# Phase 3 — Hathi Mitra / Villagers staging test plan & results

**Date:** 2026-08-02  
**Environment:** Staging only (`ttjtyvxfiqhjdngkgdkf`)  
**Seed source:** `Go live Prep - Staging/villagers (3).csv` (6,771 rows)

## Checklist & results

| # | Check | Expected | Result |
|---|--------|----------|--------|
| 1 | Village count after seed | ~541 unique names; more if name×division | **PASS** — 563 villages (542 unique names in CSV; 563 with division affinity; 3 empty → `Unknown`) |
| 2 | Villager count | ~6.7k (dup mobiles skipped) | **PASS** — 6,764 villagers (7 duplicate mobiles skipped) |
| 3 | Spot-check CSV row | Gyanendra Patel / Kushmaha present | **PASS** — `Gyanendra Patel` `+918120977096` |
| 4 | Division mapping | CSV labels map to `geo_divisions` | **PASS** — Anuppur 2249, Bandhavgarh NP 2071, North Shahdol 1610, South Shahdol 637, Sanjay NP 95, Umaria 89, South Balaghat 12, null 1 |
| 5 | Missing GPS allowed | CSV had 2 bad coords | **PASS** — 2 rows with null lat/lng |
| 6 | No auth user for villager | Seed does not create `auth.users` | **PASS** by design (insert into `villagers` only). Note: **47** mobiles also appear on existing `auth.users` (coincidental overlap with staff/volunteers on staging); Hathi Mitra rows still have no role/profile of their own. |
| 7 | `ensure_village` reuse | Same name returns same id | **PASS** (admin JWT simulation) |
| 8 | Onboard sets `created_by` | Optional; set when logged-in | **PASS** in SQL sim with Staging admin id; app sets `profile.id` |
| 9 | New village metadata | New name insertable + reusable | **PASS** via `ensure_village` |
| 10 | Volunteer cannot read/write villagers | RLS deny | **PASS** — `can_manage_villagers`/`can_read_villagers` false; `ensure_village` raises 42501; SELECT count = 0 under volunteer JWT claims |
| 11 | Volunteer onboard path unchanged | `/volunteers/onboard` + `create-user` | **PASS** — code path untouched except i18n labels (Volunteer wording) |
| 12 | Prod untouched | No `villages`/`villagers` on prod | **PASS** — `to_regclass` null on prod |
| 13 | App smoke (manual) | Home tile → form → list/search | **PENDING user** — use staging web/APK with `.env.staging.local`; Staging admin `+919999990001` |

## Manual UI smoke (for Ajinkya)

1. Build/run app against staging (`eravat-app/.env.staging.local`).
2. Sign in as field role that can onboard (admin / dfo / RO / beat_guard).
3. Home → **Onboard Villager / Hathi Mitra** → fill name, phone, village autocomplete, GPS → submit.
4. Confirm success; open list via header list icon; search by name/mobile.
5. Type a **new** village name; onboard another person; confirm village appears in suggestions next time.
6. Home → **Onboard Volunteer** still creates an auth volunteer (separate tile).
7. Confirm a seeded Hathi Mitra mobile cannot log into the app (no profile / not enrolled) unless that number also exists as a real staff/volunteer user by coincidence.

## Promote to prod (blocked)

Do **not** apply `20260802115452_villages_and_villagers_hathi_mitra.sql` or seed to prod until explicit sign-off.
