import './lib/legacyPolyfills'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { defineCustomElements } from '@ionic/pwa-elements/loader';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import './index.css'
import App from './App.tsx'
import { AppErrorBoundary } from './components/AppErrorBoundary.tsx'
import { initPostHog } from './lib/posthogClient'
import { logger } from './lib/logger'
import { runPendingCacheClearIfNeeded } from './lib/appCacheCleanup'
import { AppUpdate } from './plugins/AppUpdate'

initPostHog();
defineCustomElements(window);

async function configureNativeChrome() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#ffffff' });
  } catch (err) {
    logger.warn('StatusBar', 'configure failed', { error: String(err) });
  }
}

async function clearCachesAfterUpdate() {
  try {
    let versionCode = Number(import.meta.env.VITE_APP_VERSION_CODE || 0);
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
      const info = await AppUpdate.getAppInfo();
      versionCode = info.versionCode;
    }
    await runPendingCacheClearIfNeeded(versionCode);
  } catch (err) {
    logger.warn('AppUpdate', 'post-update cache clear skipped', { error: String(err) });
  }
}

void configureNativeChrome();
void clearCachesAfterUpdate();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
