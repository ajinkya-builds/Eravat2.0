import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useLanguage } from '../contexts/LanguageContext';

const HOME_PATHS = new Set(['/', '/login']);

function isHomePath(pathname: string): boolean {
    const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
    const normalized = pathname.replace(new RegExp(`^${base}`), '') || '/';
    return HOME_PATHS.has(normalized);
}

/** Android hardware back: navigate home first, then confirm exit. */
export function useAndroidBackButton() {
    const location = useLocation();
    const navigate = useNavigate();
    const { t } = useLanguage();

    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return;

        const sub = CapApp.addListener('backButton', () => {
            if (!isHomePath(location.pathname)) {
                navigate('/', { replace: false });
                return;
            }
            const leave = window.confirm(t('app.exitConfirm'));
            if (leave) {
                void CapApp.exitApp();
            }
        });

        return () => {
            void sub.then((h) => h.remove());
        };
    }, [location.pathname, navigate, t]);
}
