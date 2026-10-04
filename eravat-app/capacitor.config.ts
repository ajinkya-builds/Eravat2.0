import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Experiment branch only: side-by-side with staging fleet APK (com.forestdept.eravat).
  appId: 'com.forestdept.eravat.uifeedback',
  appName: 'Eravat UI Lab',
  webDir: 'dist',
  android: {
    // Chrome 61+ for native ESM; match Vite modernTargets (chrome >= 69).
    minWebViewVersion: 69,
    useLegacyBridge: true,
    backgroundColor: '#ffffff',
  },
  server: {
    androidScheme: 'https',
    hostname: 'localhost',
    errorPath: 'outdated-webview.html',
  },
  plugins: {
    StatusBar: {
      overlaysWebView: false,
      style: 'DARK',
      backgroundColor: '#ffffff',
    },
  },
};

export default config;
