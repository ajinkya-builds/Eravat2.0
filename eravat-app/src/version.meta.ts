/** AUTO-GENERATED from ../version.json — run `npm run version:bump` or `npm run version:sync`. Do not edit by hand. */
export const APP_VERSION_META = {
  versionName: "2.1.4",
  versionCode: 20104,
  channel: "staging",
  releasedAt: "2026-09-03",
  changes: [
    "Sign staging APKs with a stable keystore so in-app updates can install",
    "If Android says App not installed, uninstall Eravat once then install this build"
  ],
} as const;
