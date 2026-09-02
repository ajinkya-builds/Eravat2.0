/** AUTO-GENERATED from ../version.json — run `npm run version:bump` or `npm run version:sync`. Do not edit by hand. */
export const APP_VERSION_META = {
  versionName: "2.1.1",
  versionCode: 20101,
  channel: "staging",
  releasedAt: "2026-09-02",
  changes: [
    "Fix reinstall restoring PIN-era UI via Android Auto Backup / Service Worker",
    "Disable Service Worker on Capacitor APK builds",
    "Block Android backup restore of WebView data",
    "Clear stale SW caches on version change without wiping offline data"
  ],
} as const;
