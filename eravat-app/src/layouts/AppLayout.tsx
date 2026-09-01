import { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, Map, Settings, User, AlertTriangle } from 'lucide-react';
import { useGeolocation } from '../hooks/useGeolocation';
import { Network } from '@capacitor/network';

import { cn } from '../lib/utils';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { NotificationBell } from '../components/shared/NotificationBell';
import { ELEPHANT_LOGO_URL } from '../lib/publicAsset';



export function AppLayout() {
    const location = useLocation();
    const navigate = useNavigate();
    const { t } = useLanguage();
    const { sessionExpired, clearSessionExpired } = useAuth();
    const [isOnline, setIsOnline] = useState(true);
    const { fetchLocation } = useGeolocation();

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
        void fetchLocation();
        // Ask for device location as soon as the shell opens (review §3.1).
        // eslint-disable-next-line react-hooks/exhaustive-deps
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

            {/* Global Header with Logo — padded below system status bar */}
            <header className="fixed top-0 left-0 right-0 pt-safe bg-background/80 backdrop-blur-md border-b border-border z-40 shadow-sm">
                <div className="h-16 flex items-center justify-between px-4 md:px-6">
                    <Link to="/" className="flex items-center gap-2 active:scale-95 transition-transform">
                        <div className="w-10 h-10 relative flex items-center justify-center overflow-visible">
                            <img src={ELEPHANT_LOGO_URL} alt="ERAVAT Logo" className="absolute w-[150%] h-[150%] max-w-none object-contain drop-shadow-md" />
                        </div>
                        <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-primary to-emerald-500 text-transparent bg-clip-text">ERAVAT</span>
                    </Link>
                    <div className="flex items-center gap-3">
                        <div className={cn(
                            "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all duration-300",
                            isOnline 
                                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-500" 
                                : "bg-amber-500/10 text-amber-600 border-amber-500/20 dark:bg-amber-500/15 dark:text-amber-500"
                        )}>
                            <span className={cn(
                                "w-1.5 h-1.5 rounded-full shrink-0",
                                isOnline ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                            )} />
                            <span>{getStatusLabel()}</span>
                        </div>
                        <NotificationBell />
                    </div>
                </div>
            </header>

            {/* Main Content Area — clear fixed header + status bar */}
            <main className="flex-1 w-full pt-[calc(4rem+env(safe-area-inset-top,0px))] pb-[calc(5rem+env(safe-area-inset-bottom,0px))] relative z-10">
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

            {/* Modern Glassmorphic Bottom Navigation */}
            {!hideBottomNav && (
                <nav className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-safe pt-2" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 0px))' }}>
                    <div className="mx-auto max-w-md">
                        <div className="glass-card rounded-2xl p-2 px-4 flex items-center justify-between premium-shadow relative">

                            {NAV_ITEMS.map((item) => {
                                const isActive = location.pathname === item.path;
                                const Icon = item.icon;

                                return (
                                    <button
                                        key={item.id}
                                        data-ph-action={`nav.${item.id}`}
                                        data-ph-screen="app_shell"
                                        onClick={() => navigate(item.path, { replace: true })}
                                        className="relative p-2 flex flex-col items-center justify-center gap-1 min-w-[64px] transition-all"
                                    >
                                        {/* Active Indicator Bubble */}
                                        {isActive && (
                                            <motion.div
                                                layoutId="active-nav-indicator"
                                                className="absolute inset-0 bg-primary/10 rounded-xl"
                                                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                            />
                                        )}

                                        <Icon
                                            size={22}
                                            className={cn(
                                                "relative z-10 transition-colors duration-300",
                                                isActive ? "text-primary stroke-[2.5px]" : "text-muted-foreground hover:text-foreground"
                                            )}
                                        />
                                        <span
                                            className={cn(
                                                "text-[10px] font-medium relative z-10 transition-all duration-300",
                                                isActive ? "text-primary opacity-100" : "text-muted-foreground opacity-70"
                                            )}
                                        >
                                            {t(item.label)}
                                        </span>
                                    </button>
                                );
                            })}

                        </div>
                    </div>
                </nav>
            )}
        </div>
    );
}
