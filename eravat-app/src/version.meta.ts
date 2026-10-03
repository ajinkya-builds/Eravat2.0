/** AUTO-GENERATED from ../version.json — run `npm run version:bump` or `npm run version:sync`. Do not edit by hand. */
export const APP_VERSION_META = {
  versionName: "2.1.14",
  versionCode: 20114,
  channel: "staging",
  releasedAt: "2026-10-03",
  changes: [
    "Fix OnePlus GPS hang after cancelFreshFix",
    "Offline location falls back to last known faster",
    "Stop dual concurrent location calls that stall OxygenOS"
  ],
} as const;
