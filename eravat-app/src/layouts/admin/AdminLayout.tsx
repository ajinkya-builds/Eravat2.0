import { Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    LayoutDashboard, Users, Activity, Settings, LogOut, Menu, X,     Layers,
    AlertTriangle, Radio, ListOrdered, BarChart3, Bell, Lock, Map, Contact, LifeBuoy
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '../../lib/utils';
import { useLanguage } from '../../contexts/LanguageContext';
import { NotificationBell } from '../../components/shared/NotificationBell';
import { ELEPHANT_LOGO_URL } from '../../lib/publicAsset';
import { DEFERRED_CAPABILITIES } from '../../admin/deferredCapabilities';

type NavItem = {
    id: string;
    path?: string;
    icon: typeof LayoutDashboard;
    label: string;
    deferred?: boolean;
};

const dashboardNav = (): NavItem[] => [
    { id: 'overview', path: '/admin', icon: LayoutDashboard, label: 'admin.nav.general' },
    { id: 'conflict', path: '/admin/conflict', icon: AlertTriangle, label: 'admin.nav.conflict' },
    { id: 'live', path: '/admin/live', icon: Radio, label: 'admin.nav.live' },
    { id: 'latest', path: '/admin/latest', icon: ListOrdered, label: 'admin.nav.latest' },
    { id: 'user-stats', path: '/admin/user-stats', icon: BarChart3, label: 'admin.nav.userStats' },
];

const operationsNav = (): NavItem[] => [
    { id: 'users', path: '/admin/users', icon: Users, label: 'admin.nav.users' },
    { id: 'villagers', path: '/admin/villagers', icon: Contact, label: 'admin.nav.villagers' },
    { id: 'divisions', path: '/admin/divisions', icon: Layers, label: 'admin.nav.divisions' },
    { id: 'observations', path: '/admin/observations', icon: Activity, label: 'admin.nav.observations' },
    { id: 'map', path: '/admin/map', icon: Map, label: 'nav.map' },
    { id: 'notifications', path: '/admin/notifications', icon: Bell, label: 'admin.nav.notifications' },
    { id: 'support', path: '/admin/support', icon: LifeBuoy, label: 'admin.nav.support' },
    { id: 'settings', path: '/admin/settings', icon: Settings, label: 'admin.nav.settings' },
];

const deferredNav = (): NavItem[] =>
    DEFERRED_CAPABILITIES.slice(0, 6).map((cap) => ({
        id: cap.id,
        icon: Lock,
        label: cap.labelKey,
        deferred: true,
    }));

function NavButton({
    item,
    isActive,
    onNavigate,
}: {
    item: NavItem;
    isActive: boolean;
    onNavigate: () => void;
}) {
    const { t } = useLanguage();
    const Icon = item.icon;

    return (
        <button
            type="button"
            disabled={item.deferred}
            onClick={onNavigate}
            title={item.deferred ? t('admin.deferred.comingSoon') : undefined}
            className={cn(
                'w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all font-medium text-sm text-left group relative',
                item.deferred && 'opacity-45 cursor-not-allowed',
                isActive
                    ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
        >
            <Icon size={17} className={cn(isActive ? 'text-primary-foreground' : 'text-muted-foreground group-hover:text-foreground')} />
            <span className="relative z-10 truncate">{t(item.label)}</span>
            {item.deferred && <Lock size={12} className="ml-auto opacity-70" />}
            {isActive && (
                <motion.div
                    layoutId="admin-active-pill"
                    className="absolute inset-0 bg-primary rounded-xl -z-10"
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
            )}
        </button>
    );
}

export function AdminLayout() {
    const location = useLocation();
    const navigate = useNavigate();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const { t } = useLanguage();

    const isActive = (path?: string) => {
        if (!path) return false;
        if (path === '/admin') return location.pathname === '/admin';
        return location.pathname === path || location.pathname.startsWith(`${path}/`);
    };

    const renderSection = (titleKey: string, items: NavItem[]) => (
        <div className="space-y-1">
            <p className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/70">
                {t(titleKey)}
            </p>
            {items.map((item) => (
                <NavButton
                    key={item.id}
                    item={item}
                    isActive={isActive(item.path)}
                    onNavigate={() => {
                        if (item.path) navigate(item.path);
                        setIsMobileMenuOpen(false);
                    }}
                />
            ))}
        </div>
    );

    return (
        <div className="h-screen bg-background flex flex-col md:flex-row overflow-hidden relative">
            <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/10 blur-[100px] pointer-events-none z-0" />
            <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-accent/20 blur-[100px] pointer-events-none z-0" />

            <div className="md:hidden pt-safe bg-card border-b border-border z-30 relative">
                <div className="flex items-center justify-between p-4">
                    <Link to="/" className="flex items-center gap-2 active:scale-95 transition-transform">
                        <div className="w-10 h-10 relative flex items-center justify-center overflow-visible">
                            <img src={ELEPHANT_LOGO_URL} alt="ERAVAT Logo" className="absolute w-[150%] h-[150%] max-w-none object-contain drop-shadow-md" />
                        </div>
                        <h1 aria-label="ERAVAT Admin" className="font-bold text-lg bg-gradient-to-r from-primary to-emerald-500 text-transparent bg-clip-text">ERAVAT Admin</h1>
                    </Link>
                    <div className="flex items-center gap-2">
                        <NotificationBell />
                        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 bg-muted rounded-md text-foreground">
                            {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
                        </button>
                    </div>
                </div>
            </div>

            <aside className={cn(
                'fixed md:relative z-20 top-0 left-0 h-full w-64 bg-card border-r border-border transition-transform duration-300 ease-in-out flex flex-col premium-shadow',
                isMobileMenuOpen ? 'translate-x-0 pt-[calc(4rem+env(safe-area-inset-top,0px))] md:pt-0' : '-translate-x-full md:translate-x-0 pt-0',
            )}>
                <div className="p-6 hidden md:block border-b border-border/50">
                    <Link to="/" className="flex items-center gap-3 active:scale-95 transition-transform group">
                        <motion.div className="p-1 bg-gradient-to-br from-primary/20 to-emerald-500/20 rounded-xl group-hover:shadow-md transition-all overflow-hidden relative w-12 h-12 flex items-center justify-center">
                            <img src={ELEPHANT_LOGO_URL} alt="ERAVAT Logo" className="absolute w-[150%] h-[150%] max-w-none object-contain drop-shadow-md" />
                        </motion.div>
                        <div>
                            <h1 aria-label="ERAVAT 2.0" className="text-xl font-bold leading-tight bg-gradient-to-r from-primary to-emerald-500 text-transparent bg-clip-text">
                                ERAVAT <span className="text-primary font-light">2.0</span>
                            </h1>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">{t('admin.commandCenter')}</p>
                        </div>
                    </Link>
                </div>

                <nav className="flex-1 py-2 overflow-y-auto no-scrollbar">
                    {renderSection('admin.sections.dashboards', dashboardNav())}
                    {renderSection('admin.sections.operations', operationsNav())}
                    {renderSection('admin.sections.planned', deferredNav())}
                </nav>

                <div className="p-4 border-t border-border mt-auto">
                    <button
                        type="button"
                        onClick={() => navigate('/')}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-destructive hover:bg-destructive/10 transition-colors font-medium text-sm"
                    >
                        <LogOut size={18} />
                        {t('admin.nav.exit')}
                    </button>
                </div>
            </aside>

            <main className="flex-1 relative overflow-hidden flex flex-col w-full h-full max-h-screen">
                <div className="absolute inset-0 bg-gradient-to-br from-background to-muted/50 -z-10" />
                <AnimatePresence mode="wait">
                    <motion.div
                        key={location.pathname}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="flex-1 overflow-y-auto p-4 md:p-8"
                        data-scroll-reset
                    >
                        <Outlet />
                    </motion.div>
                </AnimatePresence>
            </main>

            {isMobileMenuOpen && (
                <div className="md:hidden fixed inset-0 z-10 bg-black/50 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />
            )}
        </div>
    );
}
