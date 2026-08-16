import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.forestdept.eravat',
  appName: 'Eravat',
  webDir: 'dist',
  android: {
    minWebViewVersion: 55,
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
