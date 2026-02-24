import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { LogOut, User, Settings, HelpCircle, Lock, ChevronRight, Shield, AlertTriangle, MapPin } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

export default function UserProfile() {
    const { user, profile, signOut } = useAuth();
    const navigate = useNavigate();
    const { t } = useLanguage();

    const initials = profile
        ? `${profile.first_name?.charAt(0) ?? ''}${profile.last_name?.charAt(0) ?? ''}`.toUpperCase() || 'U'
        : user?.email?.charAt(0).toUpperCase() ?? 'U';

    const displayName = profile
        ? `${profile.first_name} ${profile.last_name}`.trim() || user?.email
        : user?.email;

    const roleLabel = profile?.role
        ? profile.role.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
        : t('profile.user');

    const menuItems = [
        { id: 'profile', label: t('profile.editProfile'), icon: User, onClick: () => navigate('/profile/edit') },
        { id: 'settings', label: t('profile.appSettings'), icon: Settings, onClick: () => navigate('/settings') },
        { id: 'privacy', label: t('profile.privacySecurity'), icon: Lock, onClick: () => navigate('/privacy') },
        { id: 'help', label: t('profile.helpSupport'), icon: HelpCircle, onClick: () => navigate('/help') },
    ];

    const handleLogout = async () => {
        await signOut();
        navigate('/login');
    };

    return (
        <div className="min-h-screen p-6 space-y-8 max-w-lg mx-auto">
            {/* Avatar card */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                className="glass-card rounded-3xl p-8 text-center space-y-4">
                <div className="relative inline-block">
                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary to-emerald-400 flex items-center justify-center text-white text-3xl font-bold shadow-lg shadow-primary/30 mx-auto">
                        {initials}
                    </div>
                    {profile?.role === 'admin' && (
                        <div className="absolute -bottom-1 -right-1 bg-emerald-500 text-white rounded-full p-1">
                            <Shield size={14} />
                        </div>
                    )}
                </div>
                <div>
                    <h2 className="text-xl font-bold text-foreground">{displayName}</h2>
                    <span className="mt-1 inline-block px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary">
                        {roleLabel}
                    </span>
                </div>

                {(profile as any)?.divisions?.name || (profile as any)?.ranges?.name || (profile as any)?.beats?.name ? (
                    <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground bg-muted/50 py-2 px-4 rounded-xl border border-border/50">
                        <MapPin size={12} className="text-primary" />
                        <span className="font-semibold">
                            {(profile as any)?.beats?.name || (profile as any)?.ranges?.name || (profile as any)?.divisions?.name}
                        </span>
                        <span className="opacity-50">•</span>
                        <span>
                            {(profile as any)?.beats ? t('profile.beat') : (profile as any)?.ranges ? t('profile.range') : t('profile.division')}
                        </span>
                    </div>
                ) : profile?.role && profile.role !== 'admin' && profile.role !== 'volunteer' ? (
                    <div className="text-xs text-destructive font-medium flex items-center justify-center gap-1">
                        <AlertTriangle size={12} /> {t('profile.territoryNotAssigned')}
                    </div>
                ) : null}
            </motion.div>

            {/* Menu items */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                className="glass-card rounded-3xl overflow-hidden divide-y divide-border/50">
                {menuItems.map((item) => (
                    <button key={item.id} onClick={item.onClick}
                        className="w-full flex items-center gap-4 p-5 text-left hover:bg-muted/30 transition-colors">
                        <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                            <item.icon size={20} />
                        </div>
                        <span className="flex-1 text-sm font-medium text-foreground">{item.label}</span>
                        <ChevronRight size={16} className="text-muted-foreground" />
                    </button>
                ))}
            </motion.div>

            {/* Logout */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                <button
                    onClick={handleLogout}
                    className="w-full glass-card rounded-2xl p-4 flex items-center gap-4 text-destructive hover:bg-destructive/5 transition-colors"
                >
                    <div className="w-10 h-10 rounded-2xl bg-destructive/10 flex items-center justify-center">
                        <LogOut size={20} />
                    </div>
                    <span className="flex-1 text-sm font-semibold">{t('profile.logout')}</span>
                </button>
            </motion.div>
        </div>
    );
}
