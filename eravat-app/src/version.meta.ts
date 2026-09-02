/** AUTO-GENERATED from ../version.json — run `npm run version:bump` or `npm run version:sync`. Do not edit by hand. */
export const APP_VERSION_META = {
  versionName: "2.1.0",
  versionCode: 20100,
  channel: "staging",
  releasedAt: "2026-09-03",
  changes: [
    "In-app APK updates from Settings (check, download, install)",
    "Clear stale web caches on update while keeping login and offline queues",
    "Session persistence: stay signed in across idle/offline; OTP only when needed",
    "Offline-first villager and Hathi Mitra registration queues with sync on reconnect",
    "GPS-based Division/Range/Beat resolution for offline sightings",
    "Android back button goes home first, then confirms exit",
    "Native reconnect / app-resume sync for pending uploads",
    "App versioning + changelog tracking for every deploy"
  ],
} as const;
