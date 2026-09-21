/** AUTO-GENERATED from ../version.json — run `npm run version:bump` or `npm run version:sync`. Do not edit by hand. */
export const APP_VERSION_META = {
  versionName: "2.1.8",
  versionCode: 20108,
  channel: "staging",
  releasedAt: "2026-09-21",
  changes: [
    "Open the app offline without the long Loading wait",
    "GPS fills on first try instead of 2–3 refreshes",
    "Ask to turn on location when the app starts",
    "Retry GPS automatically after location is turned on"
  ],
} as const;
