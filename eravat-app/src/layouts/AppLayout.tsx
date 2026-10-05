import { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, Map, Settings, User, AlertTriangle, MapPin, Loader2 } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { LocationSettings } from '../plugins/LocationSettings';
import { LOCATION_ENABLED_EVENT } from '../lib/deviceLocation';
import { ensureDeviceLocationOn } from '../hooks/useGeolocation';
import { trackGeo, trackGeoDialog } from '../lib/geoTelemetry';

import { cn } from '../lib/utils';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { NotificationBell } from '../components/shared/NotificationBell';
import { BrandMark } from '../components/shared/BrandMark';



export function AppLayout() {
    const location = useLocation();
    const navigate = useNavigate();
    const { t } = useLanguage();
    const { sessionExpired, clearSessionExpired } = useAuth();
    const [isOnline, setIsOnline] = useState(true);
    const [locationOff, setLocationOff] = useState(false);
    const [enablingLocation, setEnablingLocation] = useState(false);

    useEffect(() => {
        let isMounted = true;

        const updateStatus = (connected: boolean) => {
            if (isMounted) setIsOnline(connected);
        };

        Network.getStatus().then(status => {
            updateStatus(status.connected);
        });

        const listener = Network.addListener('networkStatusChange', status => {
            updateStatus(status.connected);
        });

        const handleOnline = () => updateStatus(true);
        const handleOffline = () => updateStatus(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            isMounted = false;
            void listener.then(l => l.remove());
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return;

        let cancelled = false;
        const refresh = async () => {
            try {
                const { enabled } = await LocationSettings.isEnabled();
                if (!cancelled) {
                    setLocationOff(!enabled);
                    trackGeo('geo.location_service_state', {
                        enabled,
                        source: 'layout_refresh',
                    });
                }
            } catch {
                if (!cancelled) setLocationOff(false);
            }
        };
        void refresh();

        const onState = (event: Event) => {
            const enabled = (event as CustomEvent<{ enabled?: boolean }>).detail?.enabled;
            if (typeof enabled === 'boolean') {
                setLocationOff(!enabled);
                trackGeo('geo.location_service_state', {
                    enabled,
                    source: 'location_enabled_event',
                });
            } else void refresh();
        };
        window.addEventListener(LOCATION_ENABLED_EVENT, onState);

        // Bootstrap owns the first Location Accuracy / ensure dialog.
        // Do not launch a second ensureEnabled here — concurrent dialogs + cancelFreshFix
        // were racing first-grant acquires (UAT). Banner still lets the user tap.
        void (async () => {
            await new Promise((r) => setTimeout(r, 1200));
            if (cancelled) return;
            await refresh();
        })();

        return () => {
            cancelled = true;
            window.removeEventListener(LOCATION_ENABLED_EVENT, onState);
        };
    }, []);

    const getStatusLabel = () => (isOnline ? t('status_online') : t('status_offline'));

    const NAV_ITEMS = [
        { id: 'dashboard', path: '/', icon: Home, label: 'nav.dashboard' },
        { id: 'map', path: '/map', icon: Map, label: 'nav.map' },
        { id: 'profile', path: '/profile', icon: User, label: 'nav.profile' },
        { id: 'settings', path: '/settings', icon: Settings, label: 'nav.settings' },
    ];

    // We hide nav on auth pages
    if (location.pathname === '/login') {
        return <Outlet />;
    }

    // Hide bottom nav on specific routes where we have custom bottom bars
    const hideBottomNav = ['/report'].includes(location.pathname);

    return (
        <div className="relative flex min-h-screen w-full flex-col bg-background text-foreground overflow-hidden">

            {/* Decorative ambient background glows */}
            <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/10 blur-[100px] pointer-events-none" />
            <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-accent/20 blur-[100px] pointer-events-none" />

            {/* BUG-012 FIX: Session expiry notification banner */}
            <AnimatePresence>
                {sessionExpired && (
                    <motion.div
                        initial={{ y: -60, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: -60, opacity: 0 }}
                        className="fixed top-16 left-0 right-0 z-50 bg-destructive/95 text-destructive-foreground px-4 py-2.5 flex items-center justify-between gap-3 shadow-lg text-sm"
                    >
                        <div className="flex items-center gap-2">
                            <AlertTriangle size={16} className="shrink-0" />
                            <span className="font-medium">{t('session_expired')}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                onClick={() => { clearSessionExpired(); navigate('/login'); }}
                                className="px-3 py-1 rounded-lg bg-white/20 hover:bg-white/30 font-semibold text-xs transition-colors"
                            >
                                {t('sign_in')}
                            </button>
                            <button onClick={clearSessionExpired} className="p-1 rounded-lg hover:bg-white/20">
                                <span className="sr-only">{t('dismiss')}</span>✕
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {locationOff && (
                <div className="fixed top-[calc(3.5rem+env(safe-area-inset-top,0px))] left-0 right-0 z-40 px-4 pt-2">
                    <div className="mx-auto max-w-lg flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/15 px-4 py-3 text-sm text-amber-900 dark:text-amber-100 shadow-sm">
                        <MapPin size={16} className="shrink-0" />
                        <p className="flex-1 font-medium">{t('location_off_banner')}</p>
                        <button
                            type="button"
                            disabled={enablingLocation}
                            onClick={async () => {
                                setEnablingLocation(true);
                                const ensureStarted = Date.now();
                                trackGeoDialog({
                                    phase: 'shown',
                                    dialog_kind: 'location_accuracy',
                                    source: 'banner_tap',
                                });
                                try {
                                    const enabled = await ensureDeviceLocationOn();
                                    trackGeoDialog({
                                        phase: 'result',
                                        dialog_kind: 'location_accuracy',
                                        source: 'banner_tap',
                                        enabled,
                                        ensure_elapsed_ms: Date.now() - ensureStarted,
                                    });
                                    setLocationOff(!enabled);
                                } catch (err) {
                                    trackGeoDialog({
                                        phase: 'result',
                                        dialog_kind: 'location_accuracy',
                                        source: 'banner_tap',
                                        enabled: false,
                                        ensure_elapsed_ms: Date.now() - ensureStarted,
                                        error: String(err instanceof Error ? err.message : err).slice(0, 80),
                                    });
                                } finally {
                                    setEnablingLocation(false);
                                }
                            }}
                            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 text-white text-xs font-semibold disabled:opacity-50"
                        >
                            {enablingLocation ? <Loader2 size={14} className="animate-spin" /> : null}
                            {t('location_off_action')}
                        </button>
                    </div>
                </div>
            )}

            {/* Field top chrome — matches docs/design field-top */}
            <header className="fixed top-0 left-0 right-0 pt-safe bg-background/92 backdrop-blur-md border-b border-border z-40">
                <div className="h-14 flex items-center justify-between px-4 md:px-6">
                    <Link to="/" className="flex items-center gap-2.5 active:scale-95 transition-transform">
                        <BrandMark size="sm" />
                        <span className="font-extrabold text-[0.95rem] tracking-[0.04em] text-foreground">ERAVAT</span>
                    </Link>
                    <div className="flex items-center gap-2">
                        <div className={cn(
                            "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold transition-all duration-300",
                            isOnline
                                ? "bg-primary/15 text-emerald-800 dark:text-emerald-400"
                                : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                        )}>
                            <span className={cn(
                                "w-1.5 h-1.5 rounded-full shrink-0",
                                isOnline ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                            )} />
                            <span>{getStatusLabel()}</span>
                        </div>
                        <div className="min-h-10 min-w-10 rounded-xl border border-border bg-card grid place-items-center">
                            <NotificationBell />
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content Area — clear fixed header + edge bottom nav */}
            <main className="flex-1 w-full pt-[calc(3.5rem+env(safe-area-inset-top,0px))] pb-[calc(5.25rem+env(safe-area-inset-bottom,0px))] relative z-10">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={location.pathname}
                        // Opacity-only: CSS transforms on ancestors break Leaflet pan/zoom performance.
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        className="w-full h-full"
                    >
                        <Outlet />
                    </motion.div>
                </AnimatePresence>
            </main>

            {/* Edge bottom nav — matches docs/design .bottom-nav */}
            {!hideBottomNav && (
                <nav
                    className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/94 backdrop-blur-md"
                    style={{ paddingBottom: 'max(0.35rem, env(safe-area-inset-bottom, 0px))' }}
                >
                    <div className="mx-auto max-w-lg grid grid-cols-4 gap-1 px-3 pt-2">
                        {NAV_ITEMS.map((item) => {
                            const isActive = location.pathname === item.path;
                            const Icon = item.icon;

                            return (
                                <button
                                    key={item.id}
                                    data-ph-action={`nav.${item.id}`}
                                    data-ph-screen="app_shell"
                                    onClick={() => navigate(item.path, { replace: true })}
                                    className={cn(
                                        'relative flex flex-col items-center justify-center gap-0.5 min-h-12 rounded-[0.85rem] px-1 py-1.5 transition-colors',
                                        isActive
                                            ? 'bg-primary/12 text-primary'
                                            : 'text-muted-foreground',
                                    )}
                                >
                                    <Icon
                                        size={20}
                                        className={cn(
                                            'transition-colors',
                                            isActive ? 'stroke-[2.5px]' : '',
                                        )}
                                    />
                                    <span className="text-[10px] font-semibold">
                                        {t(item.label)}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </nav>
            )}
        </div>
    );
}
