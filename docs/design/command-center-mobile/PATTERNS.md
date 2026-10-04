# Command Center — Mobile Patterns

Design rules for Android (phone-width) Command Center. Desktop (`md+`) keeps tables and centered modals unless noted. Prototypes in this folder encode these visually; production should follow the same contracts.

**Breakpoint:** phone patterns apply below `md` (~768px). Target review width: **390×844**.

**Copy / i18n:** Do not rewrite labels. Keep existing `admin.*`, `ed_*`, and related keys in `translations.ts` for `en` / `hi` / `mr`. Layout changes only.

---

## 1. List (card vs table)

| | Phone | Desktop |
|---|---|---|
| Layout | Stacked **cards** | `<table>` (may `overflow-x-auto` only if needed) |
| Fields | **3–5 priority** fields only | Full columns |
| Actions | Always-visible icon/button row | Same or hover-enhanced |

**Priority field order (ops lists):** identity → status/type → place/time → one metric → actions.

**Never** require horizontal scroll on phone to see primary data or tap an action.

**Canonical target:** extend `AdminDataTable` with `primaryKeys` / `secondaryKeys` and an `actions` slot. Secondary fields may sit behind “More” on phone.

---

## 2. Edit / configure (bottom sheet)

| | Phone | Desktop |
|---|---|---|
| Container | Bottom sheet from bottom | Centered modal |
| Height | `max-h-[90vh]`, scroll body | `max-h-[90vh]` |
| Footer | Sticky Save / Cancel | Same |

Use `items-end` + slide-up (same idea as field `ReportIssueWidget`). Forms stay single-column stacks; pair small numeric fields in a 2-col grid only when labels stay short.

**Canonical target:** shared `AdminBottomSheet` component.

---

## 3. Touch actions

- Do **not** hide actions behind `group-hover` / opacity-0.
- Minimum tap target ~44×44px.
- Destructive actions use clear destructive styling; confirm in a second sheet/dialog.

---

## 4. Filters

- Stack controls vertically on phone.
- If **more than 3** controls: collapse behind a “Filters” disclosure (chevron); show active filter count badge.
- Primary CTA (Apply / Refresh) stays visible after the disclosure or as a sticky bar under filters.

---

## 5. KPIs

- Max **2 columns** on phone.
- 4–6 KPIs → `2×N` grid **or** horizontal snap strip (`scroll-snap-x`, peek of next card). Prefer snap strip when comparing many metrics at a glance (Live / Conflict).
- One primary number + short label per card; no secondary sparklines in the first pass.

---

## 6. Charts

- Full width, **one chart per block**.
- Phone: hide pie slice labels (tooltip / legend only); shorten legend text; avoid negative chart margins that clip axes.
- Stack chart cards vertically; do not put two charts side-by-side below `lg`.

---

## 7. Map

- Filter chrome collapses into a sheet or disclosure; map stays the hero.
- Phone map height: `min(50dvh, 360px)` (not fixed `520px`).
- Overview keeps deferred “Show live map”; Live/Map may mount the map but must not bury it under a tall filter stack.

---

## 8. Density (long text)

- Notification body, ED “action”, notes: **2-line clamp** + Expand/Collapse.
- Avoid repeating every column as a full label/value row when a scannable card header (title + badge + meta) is enough.

---

## Screen mapping (priority fields)

| Surface | Phone primary fields | Edit pattern |
|---|---|---|
| Observations | Time, type badge, beat, status + Edit/Calls/Delete | Bottom sheet |
| Report calls | Villager, phone (tap-to-call), status, time | Sheet list (no 7-col table) |
| ED Intelligence | Beat, tier, events; action clamped | Read-only cards |
| Divisions | Name, type, contact; inline Save in card | Inline (keep) |
| Notifications | Title, time, 2-line message | Read-only |
| Users / Villagers | Name, role/village, status + actions | Bottom sheet (align later) |
| Overview / Conflict / Live | KPI strip → charts → lists; map rules above | N/A |

---

## Implementation checklist (post-approval)

1. `AdminBottomSheet` + upgrade `AdminDataTable`.
2. Observations + Calls + ED panel.
3. Overview / Conflict / Live / Map KPI & map rules.
4. Notifications density; Users/Villagers sheet alignment.
5. Playwright mobile viewport: no horizontal overflow on key `/admin/*` pages.
