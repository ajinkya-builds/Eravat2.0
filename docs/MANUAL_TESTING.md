# Eravat 2.0 Manual Test Suite

While we use Vitest and Playwright to catch regressions within React components and business logic, certain edge cases in a mobile PWA—specifically centered around hardware sensors and IndexedDB offline logic—demand structured manual verification.

This document outlines scenarios to test before every major release.

## 1. Offline Sync & Persistence
**Objective:** Verify that `Dexie.js` successfully queues a completed observation when the user has no internet, and that the `SyncService` resumes the queue successfully.

### Setup
1. Open the Eravat 2.0 web app or Android APK.
2. Log in with a valid physical user account.
3. Once the Dashboard loads, put the device in **Airplane Mode** (disconnect Wi-Fi/cellular).

### Execution
1. Tap **"Report Sighting / Activity"**.
2. Complete all 4 steps of the wizard (Date/Time, Type, Compass, Photo).
3. On the final step, tap **"Submit Offline"**.
4. Confirm you see the success green orb animation.
5. Exit back to the Dashboard.

### Verification
1. Reload or reopen the app while still in Airplane Mode. 
2. Ensure you do not see a blank screen or a crash loop (Dexie should hold state).
3. **Turn off Airplane Mode** and restore Wi-Fi/cellular connection.
4. Refresh the page or wait up to 15 seconds.
5. **Expected Outcome:** The background `SyncService` wakes up. Open the Supabase Database dashboard and ensure the `reports`, `observations`, and (if attached) `report_media` tables reflect your submitted data without duplication.

---

## 2. Hardware GPS Accuracy
**Objective:** Confirm that the Capacitor Geolocation plugin correctly requests Android device permissions and returns coordinates within acceptable tolerance.

### Setup
1. Build and install the `app-debug.apk` onto a physical Android device.
2. Ensure Android Location settings are toggled **ON**.
3. Go to App Settings > Eravat > Permissions, and intentionally set Location permission to **Deny**.

### Execution
1. Open the app and log in.
2. Tap **"Report Sighting / Activity"**.
3. On Step 1 (Date/Time & Location), tap the GPS crosshair button.

### Verification
1. **Expected Outcome (Deny state):** A native Capacitor prompt should immediately appear asking for Location Permission ("While using the app"). 
2. Accept the permission.
3. Tap the GPS crosshair button again.
4. **Expected Outcome (Permit state):** A loading spinner should briefly appear, followed by dropping a pin exactly at your current coordinate (zoom level 16).
5. Open an alternative map app (like Google Maps) and ensure the Eravat dropped pin matches your physical footprint (testing for `enableHighAccuracy: true` functionality).

---

## 3. PWA Installation & Cache
**Objective:** Ensure the Vite PWA service-worker correctly installs Eravat 2.0 to a device homescreen for rapid access and that icons scale correctly.

### Setup
1. Access the production URL via a mobile browser (Chrome for Android, Safari for iOS).

### Execution
1. Scroll down the Dashboard to trigger the native installation heuristic.
2. If no prompt appears spontaneously, tap the browser's "Share/Menu" icon and select **"Add to Home Screen"**.
3. Approve the installation pop-up.
4. Close the browser entirely.

### Verification
1. Locate the shortcut on the device's home grid.
2. Confirm the app icon strictly matches `elephant-logo.png` (scaled correctly, not clipped).
3. Tap the icon to launch the app.
4. **Expected Outcome:** Eravat 2.0 should open in a standalone (fullscreen) window with no browser URL bar or bottom navigation tabs visible, creating a native feel.
