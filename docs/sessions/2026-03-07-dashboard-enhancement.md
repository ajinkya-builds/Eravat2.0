# 2026-03-07 — Dashboard Enhancement: Command Center KPIs, Charts & Observation Pins

## Session Goal

Enhance the Admin Command Center dashboard (`AdminDashboard.tsx`) with more meaningful
KPIs and analytical charts derived from the existing data model, and add observation
location pins on the territory map.

---

## What Was Done

### 1. Map: Observation Pins (MapComponent.tsx)

**Problem:** `AdminDashboard` was trying to parse PostGIS WKB hex strings using fragile 
inline `require('wkx')` calls, which silently failed. Map pins were not showing.

**Fix:** Moved observation pin fetching entirely into `MapComponent.tsx`. The component
now fetches `reports` joined with `observations` and `geo_beats`, parses the `location`
hex using the already-bundled `wkx` library, and renders color-coded `Leaflet` markers.

**New features in MapComponent:**
- Internal `useEffect` fetches up to 300 most recent reports with locations
- WKB hex → lat/lng parsing (reuses same `wkx` that was already in bundle)
- Color-coded pins: 🟢 Direct (emerald), 🟡 Indirect (amber), 🔴 Loss/Conflict (red)
- **Rich popups** showing: type badge, beat name, timestamp, elephant counts (male/female/calf), compass bearing, indirect sign tags
- **Pin type filter** (All / Direct / Indirect / Conflict) with colored toggle buttons
- **Live count legend** ("Direct Sighting (5) · Indirect Sign (1) · Conflict / Loss (0)")
- `showObservationPins` prop (default `true`) to toggle the internal fetch
- Backward-compatible `reportPoints` prop still works for legacy callers

### 2. CSP Fix (index.html)

The Leaflet map was using Carto Voyager tiles (`basemaps.cartocdn.com`) but the
Content Security Policy only allowed `*.tile.openstreetmap.org`. Added Carto domains
to `img-src`.

**Changed:**
```
img-src 'self' data: blob: https://*.tile.openstreetmap.org
  → + https://*.basemaps.cartocdn.com https://*.cartocdn.com
```

### 3. New Dashboard Sections (AdminDashboard.tsx)

**KPI Cards (row 1):**
| Card | Data | Was |
|---|---|---|
| Sightings Today | count of today's reports | ✓ (kept) |
| Active Conflicts | `conflict_loss` obs count (30d) | ✓ (kept, improved) |
| **Elephants Sighted** | sum of `male+female+calf+unknown` for direct sightings today | 🆕 NEW |
| Total Personnel | `profiles` count | ✓ (kept) |

**Charts (rows 3-4):**
- **7-Day Activity Trend** — `LineChart` with 3 lines (Direct / Indirect / Conflict), replacing the 12-hour area chart. Better for spotting weekly patterns.
- **Observation Types Donut** — `PieChart` showing relative proportion of report types (last 30 days)
- **Sightings by Beat** — Horizontal `BarChart`, top 6 beats by activity (last 30 days)
- **Elephant Count Breakdown** — Stacked `BarChart`, male/female/calf/unknown counts from direct sightings over the last 7 days

**Supports section (row 5):**
- **Indirect Sign Frequency** — Bar chart showing Pugmark / Dung / Broken Branches / Sound / Eyewitness frequency using `indirect_sign_details` array
- **Recent Alerts** — Enhanced feed showing elephant total count for direct sightings, conflict category for loss reports

---

## Bugs Fixed During Implementation

1. **`profiles` join HTTP 400** — The Supabase query joined `profiles(full_name)` but
   the table only has `first_name` and `last_name`. Tried `profiles!user_id(...)` FK hint
   which also failed (FK relationship not recognized). Removed profiles join entirely from
   the reports query; officer name shows as "Officer" fallback in feed.

2. **CSP blocking Carto tiles** — Map background was grey. Fixed by adding `*.basemaps.cartocdn.com`
   to `img-src` in `index.html`.

3. **Unused AreaChart/Area imports** — Removed from AdminDashboard lint warnings.

4. **Pie label `percent` undefined** — Added null-safety: `percent != null ? ...`.

---

## Verification Results

- **KPIs:** Sightings Today: 4 ✅ | Active Conflicts: 0 ✅ | Elephants Sighted: 3 ✅ | Personnel: 104 ✅  
- **Map:** Carto tiles render ✅ | 5 Direct Sighting pins + 1 Indirect Sign pin visible ✅ | Popups functional ✅
- **7-Day Trend:** Renders with data ✅ (spikes visible for today in Direct line)
- **Observation Types Donut:** 83% Direct / 17% Indirect ✅
- **Sightings by Beat:** "Batwar" beat visible ✅
- **Elephant Breakdown:** Stacked bar renders with today's counts ✅

---

## Files Modified

| File | Change |
|---|---|
| `src/components/shared/MapComponent.tsx` | Full rewrite — internal pin fetch, rich popups, pin filter, legend |
| `src/pages/AdminDashboard.tsx` | Full rewrite — removed WKB parsing, added 5 chart panels, 4 KPI cards |
| `index.html` | CSP: added `*.basemaps.cartocdn.com` to `img-src` |
