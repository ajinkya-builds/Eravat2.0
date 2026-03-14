# Dashboard Metrics Reference

This document explains exactly how Admin Command Center metrics are computed in
`eravat-app/src/pages/AdminDashboard.tsx`.

---

## Scope

- **Dashboard Surface**: Admin Command Center (`/admin`)
- **Primary Data Window**: Last 30 days of `reports` (by `device_timestamp`)
- **Trend Window**: Last 7 days (derived from same 30-day dataset)
- **Time Basis**: Client-local `Date` handling in browser/app runtime

---

## Source Tables and Fields

The dashboard query pulls from:

- `reports`: `id`, `device_timestamp`, `beat_id`
- `geo_beats`: `name` (joined as `geo_beats (name)`)
- `observations`: `type`, `male_count`, `female_count`, `calf_count`,
  `unknown_count`, `indirect_sign_details`, `conflict_loss_details`
- `conflict_damages`: `category`
- `profiles` (separately, for personnel count)

Query characteristics:

- Last 30 days filter: `reports.device_timestamp >= subDays(now, 30)`
- Ordered by newest first
- Max records: `limit(500)`

---

## Observation Type Normalization

Raw DB values are normalized into dashboard buckets:

- `direct_sighting` or `direct` -> `direct`
- `indirect_sign` or `indirect` -> `indirect`
- `conflict_loss` or `loss` -> `loss`
- Any unknown value defaults to `direct` (defensive fallback)

If `observations.type` is absent, the dashboard infers:

- `loss` if any `conflict_damages` rows exist
- otherwise `direct`

---

## Core KPI Cards (Top Row)

### 1) Sightings Today

- Label: `sightings_today`
- Calculation:
  - Count reports where `isToday(device_timestamp)` is true
  - Includes all normalized types (`direct`, `indirect`, `loss`)

Formula:

`sightingsToday = count(reports where date(device_timestamp) == today)`

### 2) Active Conflicts

- Label: `Active Conflicts`
- Calculation:
  - Count reports in 30-day dataset where normalized type is `loss`

Formula:

`activeConflicts = count(reports30 where type == loss)`

### 3) Elephants Sighted

- Label: `Elephants Sighted`
- Calculation:
  - For reports recorded today AND normalized as `direct`, sum:
    `male_count + female_count + calf_count + unknown_count`

Formula:

`elephantCountToday = sum(total_elephants for direct reports today)`

### 4) Total Personnel

- Label: `total_personnel`
- Calculation:
  - Exact row count of `profiles`

Formula:

`totalPersonnel = count(profiles)`

---

## Role-Specific KPI Cue Cards (Added 2026-03-14)

Role cards provide quick decision cues for key operating perspectives:
biologist, wildlife conservation, veterinary, and forest official.

### 1) Biologist - Calf Representation

- Value: `%` of calves among direct-sighting elephant totals in last 7 days
- Inputs:
  - `elephantDayMap` (7-day direct-only age/sex totals)
  - `calf_count`, `male_count`, `female_count`, `unknown_count`

Formulas:

- `elephant7Total = sum(male + female + calf + unknown across 7d)`
- `calf7Total = sum(calf across 7d)`
- `calfShare = round((calf7Total / elephant7Total) * 100)` if denominator > 0

Severity thresholds:

- `Stable` when `calfShare >= 20`
- `Watch` when `10 <= calfShare < 20`
- `Critical` when `calfShare < 10`
- Special case: when no direct-sighting total exists (`elephant7Total == 0`),
  state is `Watch` and value displays as `No data`

### 2) Wildlife Conservation - Coexistence Pressure

- Value: `%` of conflict/loss reports in 30-day window
- Inputs:
  - `lossCount`
  - `totalReports30`

Formula:

`conflictRate = round((lossCount / totalReports30) * 100)` if denominator > 0

Severity thresholds:

- `Stable` when `conflictRate < 15`
- `Watch` when `15 <= conflictRate < 30`
- `Critical` when `conflictRate >= 30`

### 3) Veterinary - Emergency Signal

- Value: count of high-severity conflict indicators in 30 days
- Inputs:
  - `observations.conflict_loss_details` (array)
  - `conflict_damages.category` (fallback signal source)
  - Keyword regex:
    `(injur|death|dead|electroc|poison|wire|fracture|bleed|trap|snare)`

Calculation approach:

- For each report normalized as `loss`, merge detail strings from both sources.
- If any detail string matches regex, increment `emergencySignalCount` by 1 for
  that report.

Severity thresholds:

- `Stable` when `count == 0`
- `Watch` when `count` is `1..2`
- `Critical` when `count >= 3`

### 4) Forest Official - Hotspot Concentration

- Value: `%` of all 30-day reports in the single most active beat
- Inputs:
  - `beatCountMap` grouped by beat name
  - `totalReports30`

Formula:

- `topBeatCount = max(report_count per beat)`
- `topBeatShare = round((topBeatCount / totalReports30) * 100)` if denominator > 0

Severity thresholds:

- `Stable` when `topBeatShare < 30`
- `Watch` when `30 <= topBeatShare <= 50`
- `Critical` when `topBeatShare > 50`

---

## Visual Analytics Panels

### 7-Day Activity Trend (Line)

- Buckets last 7 days by `EEE` day label
- Series:
  - `direct` reports/day
  - `indirect` reports/day
  - `loss` reports/day

### Observation Types (Donut)

- Counts in 30-day dataset:
  - Direct Sighting
  - Indirect Sign
  - Conflict / Loss

### Sightings by Beat (Horizontal Bar)

- Group 30-day reports by `geo_beats.name`
- Sort descending by count
- Show top 6 beats

### Elephant Count Breakdown (Stacked Bar)

- Last 7 days, direct sightings only
- Stacked components:
  - Male
  - Female
  - Calf
  - Unknown

### Indirect Sign Types (Tag Frequency)

- Flatten `observations.indirect_sign_details` arrays
- Count each tag occurrence
- Sort descending; display progress bars normalized to highest tag count

### Recent Alerts Feed

- Newest reports first, max 8 entries
- Type-specific icon and summary
- For direct alerts, shows total elephants in that report
- For conflict alerts, shows first conflict category (if available)

---

## Data Quality and Interpretation Notes

- Dashboard uses **report-level counting** (one report contributes once to many
  count-based metrics), while elephant totals use observation count fields.
- If some reports have missing observation rows, fallback type inference can
  bias unknowns toward `direct`.
- 30-day report fetch has a hard cap of 500 rows; very high-volume periods may
  under-represent true totals unless pagination/query strategy is expanded.
- Severity thresholds are currently heuristic operational defaults and can be
  tuned per division policy.

---

## Change Safety

This metrics update is presentation-level only:

- No database migrations
- No sync pipeline changes
- No report creation/update logic changes

Only admin dashboard aggregation and display logic are affected.
