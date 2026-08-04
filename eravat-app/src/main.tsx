import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { defineCustomElements } from '@ionic/pwa-elements/loader';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import './index.css'
import './lib/posthog'
import App from './App.tsx'
import { AppErrorBoundary } from './components/AppErrorBoundary.tsx'

defineCustomElements(window);

async function configureNativeChrome() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#ffffff' });
  } catch (err) {
    console.warn('[StatusBar] configure failed', err);
  }
}

void configureNativeChrome();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
