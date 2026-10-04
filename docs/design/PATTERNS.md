# Eravat mobile UI — design patterns

## Intent

One cohesive product experience: field home and Command Center should feel like the **same app** (tokens, chrome, cards, spacing), without a radical redesign outside Command Center.

| Area | How much may change |
|---|---|
| **Command Center (`/admin/*`)** | Meaningful phone UX fixes — cards instead of horizontal tables, bottom sheets for dense edit/calls, KPI/map chrome. **Capabilities unchanged.** |
| **Field app (home, report, map, people, profile, settings)** | **Light polish only** — alignment with shared tokens/spacing/tap targets. Keep current layout, hierarchy, and flows. No “new homepage.” |
| **Backend** | **No changes** — APIs, RLS, Edge Functions, sync, OTP stay as-is. |

---

## Content & i18n (hard rule)

1. **Do not invent or rewrite user-facing copy.** Use existing keys from [`eravat-app/src/i18n/translations.ts`](../../eravat-app/src/i18n/translations.ts).
2. Prototypes and production UI must show the **same words** as today’s `en` / `hi` / `mr` strings (via `t('…')`).
3. If a UI change needs a new label → **reuse an existing key** or leave the old string. Do not ship English-only new phrases.
4. Hindi and Marathi must stay in lockstep: any key used in UI already has (or must keep) `hi` + `mr` entries. No orphan English.

**Examples (home — keep these keys/words):**

| Key | EN (do not paraphrase in UI) |
|---|---|
| `dashboard.reportAction` | Add Sighting |
| `dashboard.reportDesc` | Log sightings or conflicts |
| `dashboard.nearbyAction` | Nearby Sightings |
| `dashboard.nearbyDesc` | Sightings within 1–100 km |
| `hathiMitra.onboardTitle` | Onboard Villager |
| `volunteer.onboardTitle` | Onboard Hathi Mitra |
| `hathiMitra.myListTitle` | My Villagers |
| `volunteer.myListTitle` | My Hathi Mitra |
| `dashboard.historyAction` | My Sightings |
| `dashboard.commandCenter` | Command Center |

---

## Cohesion (shared visual language)

Reuse across field + CC (already in app CSS):

- Primary emerald, glass-card, radii, safe-area
- Field: existing top bar + bottom nav + Report Issue FAB
- CC: existing hamburger shell; phone lists use the same card language as field lists where helpful

Field home tile **structure** stays (hero Add Sighting, nearby row, 2-up onboard, list rows, Command Center). Allowed tweaks: spacing consistency, touch target size, pending-sync clarity — not a new information architecture.

---

## Command Center phone rules

See [command-center-mobile/PATTERNS.md](./command-center-mobile/PATTERNS.md).

- Phone: cards for wide tables; desktop tables kept  
- Edit/calls: bottom sheet on phone  
- Always-visible actions (no hover-only)  
- Dense filters → disclosure; map height capped on phone  
- No capability removal; admin i18n keys unchanged  

---

## Non-goals

- New flows, routes, or permissions  
- Rewording product copy / new translation keys for “nicer” English  
- Backend or data-model changes  
- Replacing the field homepage composition with a different tile system  
