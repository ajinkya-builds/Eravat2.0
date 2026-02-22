import { Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, Map, Plus, Settings, User } from 'lucide-react';
import { cn } from '../lib/utils';
import { NotificationBell } from '../components/shared/NotificationBell';
import elephantLogo from '../../public/elephant-logo.svg';

const NAV_ITEMS = [
    { id: 'dashboard', path: '/', icon: Home, label: 'Home' },
    { id: 'map', path: '/map', icon: Map, label: 'Map' },
    { id: 'report', path: '/report', icon: Plus, label: 'Report', isFloating: true },
    { id: 'profile', path: '/profile', icon: User, label: 'Profile' },
    { id: 'settings', path: '/settings', icon: Settings, label: 'Settings' },
];

export function AppLayout() {
    const location = useLocation();
    const navigate = useNavigate();

    // We hide nav on auth pages
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

            {/* Global Header with Logo */}
            <header className="fixed top-0 left-0 right-0 h-16 bg-background/80 backdrop-blur-md border-b border-border z-40 flex items-center justify-between px-4 md:px-6 shadow-sm">
                <Link to="/" className="flex items-center gap-3 active:scale-95 transition-transform">
                    <img src={elephantLogo} alt="ERAVAT Logo" className="w-8 h-8 object-contain drop-shadow-md" />
                    <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-primary to-emerald-500 text-transparent bg-clip-text">ERAVAT</span>
                </Link>
                <NotificationBell />
            </header>

            {/* Main Content Area */}
            <main className="flex-1 w-full pt-16 pb-20 relative z-10">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={location.pathname}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                        className="w-full h-full"
                    >
                        <Outlet />
                    </motion.div>
                </AnimatePresence>
            </main>

            {/* Modern Glassmorphic Bottom Navigation */}
            {!hideBottomNav && (
                <nav className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-6 pt-2">
                    <div className="mx-auto max-w-md">
                        <div className="glass-card rounded-2xl p-2 px-4 flex items-center justify-between premium-shadow relative">

                            {NAV_ITEMS.map((item) => {
                                const isActive = location.pathname === item.path;
                                const Icon = item.icon;

                                if (item.isFloating) {
                                    return (
                                        <button
                                            key={item.id}
                                            onClick={() => navigate(item.path)}
                                            className="relative -top-6 bg-gradient-to-br from-primary to-emerald-600 text-primary-foreground p-4 rounded-full shadow-lg hover:shadow-primary/50 hover:scale-105 active:scale-95 transition-all duration-300"
                                        >
                                            <Icon size={28} className={cn(isActive && "animate-pulse")} />
                                        </button>
                                    );
                                }

                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => navigate(item.path)}
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
                                            {item.label}
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
