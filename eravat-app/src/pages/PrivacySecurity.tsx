import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Lock, KeyRound, Eye, EyeOff, CheckCircle,
    AlertCircle, Loader2, Shield, Smartphone, Clock,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../supabase';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function PrivacySecurity() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { t } = useLanguage();

    // Password change state
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [pwSaveState, setPwSaveState] = useState<SaveState>('idle');
    const [pwError, setPwError] = useState('');

    const handlePasswordChange = async () => {
        setPwError('');

        if (newPassword.length < 6) {
            setPwError(t('password_min_length'));
            return;
        }
        if (newPassword !== confirmPassword) {
            setPwError(t('passwords_no_match'));
            return;
        }

        setPwSaveState('saving');

        const { error } = await supabase.auth.updateUser({ password: newPassword });

        if (error) {
            setPwSaveState('error');
            setPwError(error.message);
            setTimeout(() => setPwSaveState('idle'), 3000);
        } else {
            setPwSaveState('saved');
            setNewPassword('');
            setConfirmPassword('');
            setTimeout(() => setPwSaveState('idle'), 2500);
        }
    };

    // Session info
    const lastSignIn = user?.last_sign_in_at
        ? new Date(user.last_sign_in_at).toLocaleString()
        : 'Unknown';

    const accountCreated = user?.created_at
        ? new Date(user.created_at).toLocaleDateString()
        : 'Unknown';

    return (
        <div className="min-h-screen p-6 space-y-6 max-w-lg mx-auto">
            {/* Header */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3">
                <button onClick={() => navigate('/profile')}
                    className="w-10 h-10 rounded-2xl bg-muted/50 flex items-center justify-center text-foreground hover:bg-muted transition-colors">
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-foreground">{t('privacy_security')}</h1>
                    <p className="text-sm text-muted-foreground">{t('manage_security')}</p>
                </div>
            </motion.div>

            {/* Change Password Card */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
                className="glass-card rounded-3xl p-6 space-y-5">

                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                        <KeyRound size={20} />
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-foreground">{t('change_password')}</h2>
                        <p className="text-xs text-muted-foreground">{t('update_password_desc')}</p>
                    </div>
                </div>

                {/* New Password */}
                <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <Lock size={15} className="text-primary" />
                        {t('new_password')}
                    </label>
                    <div className="relative">
                        <input
                            type={showNew ? 'text' : 'password'}
                            value={newPassword}
                            onChange={e => setNewPassword(e.target.value)}
                            placeholder={t('enter_new_password')}
                            className="w-full bg-muted/50 border border-border/50 rounded-2xl px-4 py-3 pr-12 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
                        />
                        <button onClick={() => setShowNew(!showNew)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                            {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>
                </div>

                {/* Confirm Password */}
                <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <Lock size={15} className="text-primary" />
                        {t('confirm_password')}
                    </label>
                    <div className="relative">
                        <input
                            type={showConfirm ? 'text' : 'password'}
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            placeholder={t('confirm_new_password')}
                            className="w-full bg-muted/50 border border-border/50 rounded-2xl px-4 py-3 pr-12 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
                        />
                        <button onClick={() => setShowConfirm(!showConfirm)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                            {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>
                </div>

                {/* Error */}
                {pwError && (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-2xl px-4 py-3">
                        <AlertCircle size={16} />
                        {pwError}
                    </motion.div>
                )}

                {/* Save Button */}
                <button
                    onClick={handlePasswordChange}
                    disabled={pwSaveState === 'saving' || !newPassword || !confirmPassword}
                    className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-primary to-emerald-400 text-white font-semibold text-sm shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                >
                    {pwSaveState === 'saving' ? (
                        <><Loader2 size={18} className="animate-spin" /> {t('updating')}</>
                    ) : pwSaveState === 'saved' ? (
                        <><CheckCircle size={18} /> {t('password_updated')}</>
                    ) : (
                        t('update_password_btn')
                    )}
                </button>
            </motion.div>

            {/* Session Info Card */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}
                className="glass-card rounded-3xl p-6 space-y-4">

                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                        <Shield size={20} />
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-foreground">{t('account_info')}</h2>
                        <p className="text-xs text-muted-foreground">{t('session_details')}</p>
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-2xl border border-border/30">
                        <Clock size={18} className="text-primary shrink-0" />
                        <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">{t('last_sign_in')}</p>
                            <p className="text-sm font-medium text-foreground truncate">{lastSignIn}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-2xl border border-border/30">
                        <Smartphone size={18} className="text-primary shrink-0" />
                        <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">{t('account_created')}</p>
                            <p className="text-sm font-medium text-foreground truncate">{accountCreated}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-2xl border border-border/30">
                        <Shield size={18} className="text-primary shrink-0" />
                        <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">{t('authentication')}</p>
                            <p className="text-sm font-medium text-foreground">{t('email_password')}</p>
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Data & Privacy Card */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }}
                className="glass-card rounded-3xl p-6 space-y-4">

                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                        <Lock size={20} />
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-foreground">{t('data_privacy')}</h2>
                        <p className="text-xs text-muted-foreground">{t('data_handled')}</p>
                    </div>
                </div>

                <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
                    <div className="p-4 bg-muted/30 rounded-2xl border border-border/30 space-y-2">
                        <p className="font-medium text-foreground">{t('data_storage')}</p>
                        <p>{t('data_storage_desc')}</p>
                    </div>
                    <div className="p-4 bg-muted/30 rounded-2xl border border-border/30 space-y-2">
                        <p className="font-medium text-foreground">{t('location_data')}</p>
                        <p>{t('location_data_desc')}</p>
                    </div>
                    <div className="p-4 bg-muted/30 rounded-2xl border border-border/30 space-y-2">
                        <p className="font-medium text-foreground">{t('offline_data')}</p>
                        <p>{t('offline_data_desc')}</p>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
