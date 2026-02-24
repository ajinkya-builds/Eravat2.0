import { Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutDashboard, Users, Activity, Settings, LogOut, Menu, X, Layers } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../../lib/utils';
import { useLanguage } from '../../contexts/LanguageContext';
import { NotificationBell } from '../../components/shared/NotificationBell';
import elephantLogo from '../../../public/elephant-logo.png';

const ADMIN_NAV = [
    { id: 'overview', path: '/admin', icon: LayoutDashboard, label: 'admin_overview' },
    { id: 'users', path: '/admin/users', icon: Users, label: 'admin_manage_personnel' },
    { id: 'divisions', path: '/admin/divisions', icon: Layers, label: 'admin_divisions_contacts' },
    { id: 'observations', path: '/admin/observations', icon: Activity, label: 'admin_observations' },
    { id: 'settings', path: '/admin/settings', icon: Settings, label: 'admin_system_settings' },
];

export function AdminLayout() {
    const location = useLocation();
    const navigate = useNavigate();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const { t } = useLanguage();

    return (
        <div className="h-screen bg-background flex flex-col md:flex-row overflow-hidden relative">

            {/* Decorative ambient background glows */}
            <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/10 blur-[100px] pointer-events-none z-0" />
            <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-accent/20 blur-[100px] pointer-events-none z-0" />

            {/* Mobile Header */}
            <div className="md:hidden flex items-center justify-between p-4 bg-card border-b border-border z-30 relative">
                <Link to="/" className="flex items-center gap-2 active:scale-95 transition-transform">
                    <div className="w-10 h-10 relative flex items-center justify-center overflow-visible">
                        <img src={elephantLogo} alt="ERAVAT Logo" className="absolute w-[150%] h-[150%] max-w-none object-contain drop-shadow-md" />
                    </div>
                    <h1 className="font-bold text-lg bg-gradient-to-r from-primary to-emerald-500 text-transparent bg-clip-text">ERAVAT Admin</h1>
                </Link>
                <div className="flex items-center gap-2">
                    <NotificationBell />
                    <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 bg-muted rounded-md text-foreground">
                        {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
                    </button>
                </div>
            </div>

            {/* Sidebar Navigation */}
            <aside className={cn(
                "fixed md:relative z-20 top-0 left-0 h-full w-64 bg-card border-r border-border transition-transform duration-300 ease-in-out flex flex-col premium-shadow",
                isMobileMenuOpen ? "translate-x-0 pt-16 md:pt-0" : "-translate-x-full md:translate-x-0 pt-0"
            )}>
                <div className="p-6 hidden md:block border-b border-border/50">
                    <Link to="/" className="flex items-center gap-3 active:scale-95 transition-transform group">
                        <div className="p-1 bg-gradient-to-br from-primary/20 to-emerald-500/20 rounded-xl group-hover:shadow-md transition-all overflow-hidden relative w-12 h-12 flex items-center justify-center">
                            <img src={elephantLogo} alt="ERAVAT Logo" className="absolute w-[150%] h-[150%] max-w-none object-contain drop-shadow-md" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold leading-tight bg-gradient-to-r from-primary to-emerald-500 text-transparent bg-clip-text">ERAVAT <span className="text-primary font-light">2.0</span></h1>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">{t('command_center')}</p>
                        </div>
                    </Link>
                </div>

                <nav className="flex-1 px-4 py-4 space-y-2 overflow-y-auto no-scrollbar">
                    {ADMIN_NAV.map((item) => {
                        const isActive = location.pathname === item.path || (item.path !== '/admin' && location.pathname.startsWith(item.path));
                        const Icon = item.icon;

                        return (
                            <button
                                key={item.id}
                                onClick={() => {
                                    navigate(item.path);
                                    setIsMobileMenuOpen(false);
                                }}
                                className={cn(
                                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium text-sm text-left group relative",
                                    isActive
                                        ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                )}
                            >
                                <Icon size={18} className={cn(isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground")} />
                                <span className="relative z-10">{t(item.label)}</span>

                                {isActive && (
                                    <motion.div
                                        layoutId="admin-active-pill"
                                        className="absolute inset-0 bg-primary rounded-xl -z-10"
                                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                    />
                                )}
                            </button>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-border mt-auto">
                    <button
                        onClick={() => navigate('/')}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-destructive hover:bg-destructive/10 transition-colors font-medium text-sm"
                    >
                        <LogOut size={18} />
                        {t('exit_dashboard')}
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 relative overflow-hidden flex flex-col w-full h-full max-h-screen">
                <div className="absolute inset-0 bg-gradient-to-br from-background to-muted/50 -z-10" />
                <AnimatePresence mode="wait">
                    <motion.div
                        key={location.pathname}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.3 }}
                        className="flex-1 overflow-y-auto p-4 md:p-8"
                    >
                        <Outlet />
                    </motion.div>
                </AnimatePresence>
            </main>

            {/* Mobile Overlay */}
            {isMobileMenuOpen && (
                <div
                    className="md:hidden fixed inset-0 z-10 bg-black/50 backdrop-blur-sm"
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}
        </div>
    );
}
