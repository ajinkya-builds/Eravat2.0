/** AUTO-GENERATED from ../version.json — run `npm run version:bump` or `npm run version:sync`. Do not edit by hand. */
export const APP_VERSION_META = {
  versionName: "2.1.3",
  versionCode: 20103,
  channel: "staging",
  releasedAt: "2026-09-03",
  changes: [
    "Pause notification realtime socket while backgrounded; FCM covers push, resume refetches",
    "Unify reconnect sync debounce across Capacitor and native online events",
    "Exponential backoff after failed automatic offline sync batches"
  ],
} as const;
