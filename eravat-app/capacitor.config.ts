import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.forestdept.eravat',
  appName: 'Eravat',
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
