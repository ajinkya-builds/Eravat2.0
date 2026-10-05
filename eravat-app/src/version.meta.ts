/** AUTO-GENERATED from ../version.json — run `npm run version:bump` or `npm run version:sync`. Do not edit by hand. */
export const APP_VERSION_META = {
  versionName: "2.1.19",
  versionCode: 20119,
  channel: "staging",
  releasedAt: "2026-10-05",
  changes: [
    "Report sync: retry stale beat_id; media-only retries without failing report",
    "Admin home: defer intelligence panel load",
    "Playwright OTP from UAT manifest; admin onboarding test IDs",
    "Maestro invalid-phone flow; staging onboarding E2E script"
  ],
} as const;
