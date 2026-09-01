import { useEffect } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../supabase';
import { syncAllPending } from '../lib/appSync';

const RESUME_EVENT = 'eravat-app-resume';
const ONLINE_EVENT = 'eravat-network-online';

/** Refresh auth + flush outboxes when the app resumes or native connectivity returns. */
export function useAppLifecycleSync(enabled: boolean) {
    useEffect(() => {
        if (!enabled) return;

        const onResume = () => {
            void supabase.auth.getSession().then(() => syncAllPending('resume'));
        };

        if (Capacitor.isNativePlatform()) {
            const sub = CapApp.addListener('appStateChange', ({ isActive }) => {
                if (isActive) onResume();
            });
        const onNativeOnline = () => {
            void syncAllPending('native-online');
        };
        window.addEventListener(RESUME_EVENT, onResume);
        window.addEventListener(ONLINE_EVENT, onNativeOnline);

        return () => {
            void sub.then((h) => h.remove());
            window.removeEventListener(RESUME_EVENT, onResume);
            window.removeEventListener(ONLINE_EVENT, onNativeOnline);
        };
        }

        const onVisible = () => {
            if (document.visibilityState === 'visible') onResume();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, [enabled]);
}
