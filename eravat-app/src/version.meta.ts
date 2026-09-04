/** AUTO-GENERATED from ../version.json — run `npm run version:bump` or `npm run version:sync`. Do not edit by hand. */
export const APP_VERSION_META = {
  versionName: "2.1.6",
  versionCode: 20106,
  channel: "staging",
  releasedAt: "2026-09-04",
  changes: [
    "Open app offline offline after JWT expiry (cold start)",
    "Hydrate session from local storage when Auth refresh fails",
    "PostHog: auth.offline_session_hydrated / init_timeout events"
  ],
} as const;
