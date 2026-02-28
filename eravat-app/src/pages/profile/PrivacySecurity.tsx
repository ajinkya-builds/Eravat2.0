import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Key, Fingerprint, Activity, ShieldAlert, LogOut, ChevronRight, Check } from 'lucide-react';
import { supabase } from '../../supabase';
import { useLanguage } from '../../contexts/LanguageContext';

export default function PrivacySecurity() {
    const navigate = useNavigate();
    const { t } = useLanguage();

    // Toggles state
    const [biometricEnabled, setBiometricEnabled] = useState(false);
    const [analyticsEnabled, setAnalyticsEnabled] = useState(true);

    // Password change state
    const [isChangingPassword, setIsChangingPassword] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();
        setPasswordMessage(null);

        if (newPassword !== confirmPassword) {
            setPasswordMessage({ type: 'error', text: "Passwords don't match." });
            return;
        }

        if (newPassword.length < 6) {
            setPasswordMessage({ type: 'error', text: "Password must be at least 6 characters." });
            return;
        }

        setIsLoading(true);

        try {
            const { error } = await supabase.auth.updateUser({
                password: newPassword
            });

            if (error) throw error;

            setPasswordMessage({ type: 'success', text: "Password updated successfully." });

            // Reset and close after 2s
            setTimeout(() => {
                setIsChangingPassword(false);
                setNewPassword('');
                setConfirmPassword('');
                setPasswordMessage(null);
            }, 2000);

        } catch (error: any) {
            setPasswordMessage({ type: 'error', text: error.message || "Failed to update password." });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-background pb-[80px]">
            {/* Header */}
            <div className="sticky top-0 z-40 glass-effect border-b border-border/50 px-4 py-4 flex items-center gap-3">
                <button
                    onClick={() => navigate(-1)}
                    className="p-2 rounded-xl hover:bg-muted/50 transition-colors"
                >
                    <ArrowLeft size={20} className="text-foreground" />
                </button>
                <h1 className="text-lg font-bold text-foreground">{t('privacy.title')}</h1>
            </div>

            <div className="p-6 max-w-lg mx-auto space-y-8">

                {/* Account Security section */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="space-y-3"
                >
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider pl-1">{t('privacy.security')}</h2>
                    <div className="glass-card rounded-2xl overflow-hidden divide-y divide-border/50">

                        {/* Change Password Expanding Section */}
                        <div className="flex flex-col">
                            <button
                                onClick={() => setIsChangingPassword(!isChangingPassword)}
                                className="p-4 flex items-center justify-between hover:bg-muted/20 transition-colors text-left"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                                        <Key size={18} />
                                    </div>
                                    <span className="font-medium text-foreground">{t('privacy.changePassword')}</span>
                                </div>
                                <ChevronRight size={16} className={`text-muted-foreground transition-transform ${isChangingPassword ? 'rotate-90' : ''}`} />
                            </button>

                            <AnimatePresence>
                                {isChangingPassword && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="overflow-hidden bg-muted/30"
                                    >
                                        <form onSubmit={handlePasswordChange} className="p-4 space-y-4 border-t border-border/50">
                                            {passwordMessage && (
                                                <div className={`p-3 rounded-xl text-sm ${passwordMessage.type === 'success' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-destructive/10 text-destructive'}`}>
                                                    {passwordMessage.text}
                                                </div>
                                            )}
                                            <input
                                                type="password"
                                                placeholder="New Password"
                                                required
                                                value={newPassword}
                                                onChange={(e) => setNewPassword(e.target.value)}
                                                className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary"
                                            />
                                            <input
                                                type="password"
                                                placeholder="Confirm New Password"
                                                required
                                                value={confirmPassword}
                                                onChange={(e) => setConfirmPassword(e.target.value)}
                                                className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary"
                                            />
                                            <div className="flex justify-end pt-2">
                                                <button
                                                    type="submit"
                                                    disabled={isLoading || !newPassword || !confirmPassword}
                                                    className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
                                                >
                                                    {isLoading ? 'Updating...' : <><Check size={16} /> Update</>}
                                                </button>
                                            </div>
                                        </form>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Biometric Toggle */}
                        <label className="p-4 flex items-center justify-between cursor-pointer hover:bg-muted/20 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500">
                                    <Fingerprint size={18} />
                                </div>
                                <div>
                                    <div className="font-medium">{t('privacy.biometric')}</div>
                                    <div className="text-xs text-muted-foreground mt-0.5">{t('privacy.biometricDesc')}</div>
                                </div>
                            </div>
                            <div className="relative inline-block w-12 h-6 align-middle select-none">
                                <input type="checkbox" className="toggle-checkbox peer absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer z-10" checked={biometricEnabled} onChange={(e) => setBiometricEnabled(e.target.checked)} />
                                <label className="toggle-label block overflow-hidden h-6 rounded-full cursor-pointer bg-muted peer-checked:bg-primary transition-colors"></label>
                            </div>
                        </label>
                    </div>
                </motion.div>

                {/* Device & Data */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="space-y-3"
                >
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider pl-1">{t('privacy.deviceData')}</h2>
                    <div className="glass-card rounded-2xl overflow-hidden divide-y divide-border/50">
                        <button className="w-full p-4 flex items-center justify-between hover:bg-muted/20 transition-colors text-left">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                                    <Activity size={18} />
                                </div>
                                <span className="font-medium">{t('privacy.activeSessions')}</span>
                            </div>
                            <div className="flex items-center gap-2 text-muted-foreground text-sm">
                                1 Device <ChevronRight size={16} />
                            </div>
                        </button>

                        <label className="p-4 flex items-center justify-between cursor-pointer hover:bg-muted/20 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                                    <ShieldAlert size={18} />
                                </div>
                                <div>
                                    <div className="font-medium">{t('privacy.shareAnalytics')}</div>
                                    <div className="text-xs text-muted-foreground mt-0.5">{t('privacy.analyticsDesc')}</div>
                                </div>
                            </div>
                            <div className="relative inline-block w-12 h-6 align-middle select-none">
                                <input type="checkbox" className="toggle-checkbox peer absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer z-10" checked={analyticsEnabled} onChange={(e) => setAnalyticsEnabled(e.target.checked)} />
                                <label className="toggle-label block overflow-hidden h-6 rounded-full cursor-pointer bg-muted peer-checked:bg-primary transition-colors"></label>
                            </div>
                        </label>
                    </div>
                </motion.div>

                {/* Danger Zone */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                >
                    <button className="w-full glass-card rounded-2xl p-4 flex items-center gap-3 text-destructive hover:bg-destructive/5 transition-colors border border-destructive/20">
                        <div className="p-2 rounded-lg bg-destructive/10 text-destructive">
                            <LogOut size={18} />
                        </div>
                        <div className="flex-1 text-left">
                            <div className="font-semibold text-sm">{t('privacy.signOutAll')}</div>
                            <div className="text-xs opacity-80 font-medium">{t('privacy.revokeWarning')}</div>
                        </div>
                        <ChevronRight size={16} />
                    </button>
                </motion.div>

            </div>
        </div>
    );
}
