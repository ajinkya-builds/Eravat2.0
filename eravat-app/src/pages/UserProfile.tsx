import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { LogOut, User, HelpCircle, Lock, ChevronRight, Shield, AlertTriangle, MapPin } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { track } from '../lib/analytics';
import { logger } from '../lib/logger';
import { describeSyncSignOutResult, signOutQueueTraceFields } from '../lib/signOutUnsynced';
import SignOutUnsyncedDialog from '../components/profile/SignOutUnsyncedDialog';
import { discardReportsNeedingSync, snapshotReportsNeedingSync, syncData } from '../services/syncService';

export default function UserProfile() {
    const { user, profile, signOut } = useAuth();
    const navigate = useNavigate();
    const { t } = useLanguage();
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    const [showUnsyncedDialog, setShowUnsyncedDialog] = useState(false);
    const [unsyncedCount, setUnsyncedCount] = useState(0);
    const [unsyncedBusy, setUnsyncedBusy] = useState<'sync' | 'discard' | null>(null);
    const [unsyncedError, setUnsyncedError] = useState<string | null>(null);
    const [signOutCheckError, setSignOutCheckError] = useState<string | null>(null);
    const [checkingSignOut, setCheckingSignOut] = useState(false);

    const initials = profile
        ? `${profile.first_name?.charAt(0) ?? ''}${profile.last_name?.charAt(0) ?? ''}`.toUpperCase() || 'U'
        : user?.phone?.slice(-4) ?? 'U';

    const displayName = profile
        ? `${profile.first_name} ${profile.last_name}`.trim() || user?.phone || 'User'
        : user?.phone || 'User';

    const roleLabel = profile?.role
        ? profile.role.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
        : t('profile.user');

    const menuItems = [
        { id: 'profile', label: t('profile.editProfile'), icon: User, onClick: () => navigate('/profile/edit') },
        { id: 'privacy', label: t('profile.privacySecurity'), icon: Lock, onClick: () => navigate('/privacy') },
        { id: 'help', label: t('profile.helpSupport'), icon: HelpCircle, onClick: () => navigate('/help') },
    ];

    const finishSignOut = async () => {
        setShowLogoutConfirm(false);
        setShowUnsyncedDialog(false);
        await signOut();
        navigate('/login');
    };

    const handleSignOutPress = async () => {
        if (checkingSignOut || unsyncedBusy) return;
        setSignOutCheckError(null);
        setCheckingSignOut(true);
        try {
            const snapshot = await snapshotReportsNeedingSync();
            if (snapshot.reports.length === 0) {
                setShowLogoutConfirm(true);
                return;
            }
            const trace = signOutQueueTraceFields(user?.id ?? null, snapshot);
            logger.warn('SignOut', 'Sign-out blocked by unsynced reports', trace);
            track('sign_out.unsynced_prompt_shown', trace);
            setUnsyncedCount(snapshot.reports.length);
            setUnsyncedError(null);
            setShowUnsyncedDialog(true);
        } catch (error) {
            const errorCode = error instanceof Error ? error.message.slice(0, 120) : 'queue_read_failed';
            logger.error('SignOut', 'Could not read unsynced reports before sign-out', error, {
                actor_user_id: user?.id ?? 'none',
            });
            track('sign_out.unsynced_check_failed', {
                actor_user_id: user?.id ?? 'none',
                error_code: errorCode,
            });
            setSignOutCheckError(t('profile.logoutUnsyncedCheckFailed'));
        } finally {
            setCheckingSignOut(false);
        }
    };

    const logUnsyncedChoice = async (choice: 'sync' | 'discard' | 'cancel') => {
        const snapshot = await snapshotReportsNeedingSync();
        const trace = signOutQueueTraceFields(user?.id ?? null, snapshot);
        logger.warn('SignOut', 'Unsynced sign-out choice', { ...trace, choice });
        track('sign_out.unsynced_choice', { ...trace, choice });
        return snapshot;
    };

    const handleSyncAndSignOut = async () => {
        if (unsyncedBusy) return;
        setUnsyncedBusy('sync');
        setUnsyncedError(null);
        try {
            await logUnsyncedChoice('sync');
            const result = await syncData();
            const remaining = await snapshotReportsNeedingSync();
            const remainingTrace = signOutQueueTraceFields(user?.id ?? null, remaining);
            const described = describeSyncSignOutResult(result, remaining.reports.length);
            logger.warn('SignOut', 'Sync-and-sign-out finished', {
                ...remainingTrace,
                outcome: described.outcome,
                uploaded: described.uploaded,
                failed: described.failed,
                error_code: described.errorCode,
            });
            track('sign_out.unsynced_sync_finished', {
                ...remainingTrace,
                outcome: described.outcome,
                uploaded: described.uploaded,
                failed: described.failed,
                remaining_count: remaining.reports.length,
                error_code: described.errorCode,
            });
            if (!described.allowed) {
                setUnsyncedCount(remaining.reports.length);
                setUnsyncedError(
                    remaining.reports.length > 0
                        ? t('profile.logoutUnsyncedSyncFailed', { count: remaining.reports.length })
                        : t('profile.logoutUnsyncedSyncFailedGeneric'),
                );
                return;
            }
            await finishSignOut();
        } catch (error) {
            const errorCode = error instanceof Error ? error.message.slice(0, 120) : 'sync_threw';
            logger.error('SignOut', 'Sync-and-sign-out threw', error, {
                actor_user_id: user?.id ?? 'none',
            });
            track('sign_out.unsynced_sync_finished', {
                actor_user_id: user?.id ?? 'none',
                outcome: 'error',
                error_code: errorCode,
            });
            setUnsyncedError(t('profile.logoutUnsyncedSyncFailedGeneric'));
        } finally {
            setUnsyncedBusy(null);
        }
    };

    const handleDiscardAndSignOut = async () => {
        if (unsyncedBusy) return;
        setUnsyncedBusy('discard');
        setUnsyncedError(null);
        try {
            await logUnsyncedChoice('discard');
            await discardReportsNeedingSync(user?.id ?? null);
            await finishSignOut();
        } catch (error) {
            const errorCode = error instanceof Error ? error.message.slice(0, 120) : 'discard_threw';
            logger.error('SignOut', 'Discard-and-sign-out threw', error, {
                actor_user_id: user?.id ?? 'none',
            });
            track('sign_out.unsynced_discard_failed', {
                actor_user_id: user?.id ?? 'none',
                outcome: 'error',
                error_code: errorCode,
                choice: 'discard',
            });
            setUnsyncedError(t('profile.logoutUnsyncedDiscardFailed'));
        } finally {
            setUnsyncedBusy(null);
        }
    };

    const handleCancelUnsyncedSignOut = async () => {
        if (unsyncedBusy) return;
        try {
            await logUnsyncedChoice('cancel');
        } catch (error) {
            logger.error('SignOut', 'Could not log unsynced sign-out cancel', error, {
                actor_user_id: user?.id ?? 'none',
            });
        }
        setShowUnsyncedDialog(false);
        setUnsyncedError(null);
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

                {profile?.beat_name || profile?.range_name || profile?.division_name ? (
                    <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground bg-muted/50 py-2 px-4 rounded-xl border border-border/50">
                        <MapPin size={12} className="text-primary" />
                        <span className="font-semibold">
                            {profile.beat_name || profile.range_name || profile.division_name}
                        </span>
                        <span className="opacity-50">•</span>
                        <span>
                            {profile.beat_name ? t('profile.beat') : profile.range_name ? t('profile.range') : t('profile.division')}
                        </span>
                    </div>
                ) : profile?.role && profile.role !== 'admin' && profile.role !== 'volunteer' ? (
                    <div className="text-xs text-destructive font-medium flex items-center justify-center gap-1">
                        <AlertTriangle size={12} /> {t('profile.territoryNotAssigned')}
                    </div>
                ) : null}

                {profile?.latitude != null && profile?.longitude != null && (
                    <p className="text-xs text-muted-foreground">
                        {t('profile.gpsLocation')}: {profile.latitude.toFixed(5)}, {profile.longitude.toFixed(5)}
                    </p>
                )}
            </motion.div>

            {/* Menu items — design pack menu-row density */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                className="glass-card rounded-3xl overflow-hidden">
                {menuItems.map((item) => (
                    <button key={item.id} onClick={item.onClick}
                        className="ui-menu-row hover:bg-muted/30 transition-colors">
                        <span className="flex items-center gap-3 min-w-0">
                            <span className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                                <item.icon size={20} />
                            </span>
                            <span className="truncate">{item.label}</span>
                        </span>
                        <ChevronRight size={16} className="text-muted-foreground shrink-0" />
                    </button>
                ))}
            </motion.div>

            {/* Logout */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                <button
                    onClick={() => { void handleSignOutPress(); }}
                    disabled={checkingSignOut || unsyncedBusy !== null}
                    className="w-full glass-card rounded-2xl p-4 flex items-center gap-4 text-destructive hover:bg-destructive/5 transition-colors disabled:opacity-60"
                >
                    <div className="w-10 h-10 rounded-2xl bg-destructive/10 flex items-center justify-center">
                        <LogOut size={20} />
                    </div>
                    <span className="flex-1 text-sm font-semibold">{t('profile.logout')}</span>
                </button>
                {signOutCheckError && (
                    <p className="mt-2 text-sm text-destructive" role="alert">{signOutCheckError}</p>
                )}
            </motion.div>

            <SignOutUnsyncedDialog
                open={showUnsyncedDialog}
                count={unsyncedCount}
                busy={unsyncedBusy}
                error={unsyncedError}
                onSync={() => { void handleSyncAndSignOut(); }}
                onDiscard={() => { void handleDiscardAndSignOut(); }}
                onCancel={() => { void handleCancelUnsyncedSignOut(); }}
            />

            {/* Sign-out Confirmation Dialog */}
            <AnimatePresence>
                {showLogoutConfirm && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
                        onClick={() => setShowLogoutConfirm(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-background rounded-2xl p-6 w-full max-w-sm shadow-xl border border-border/50 space-y-4"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                                    <LogOut size={20} className="text-destructive" />
                                </div>
                                <h3 className="text-lg font-bold text-foreground">{t('profile.logout')}</h3>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                {t('profile.logoutConfirmation')}
                            </p>
                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={() => setShowLogoutConfirm(false)}
                                    className="flex-1 py-2.5 px-4 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
                                >
                                    {t('profile.cancel')}
                                </button>
                                <button
                                    onClick={() => { void finishSignOut(); }}
                                    className="flex-1 py-2.5 px-4 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold hover:bg-destructive/90 transition-colors"
                                >
                                    {t('profile.logout')}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
