import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Phone, Mail, CheckCircle, AlertCircle, Loader2, Camera } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../supabase';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function EditProfile() {
    const { user, profile, refreshProfile } = useAuth();
    const navigate = useNavigate();
    const { t } = useLanguage();

    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [phone, setPhone] = useState('');
    const [saveState, setSaveState] = useState<SaveState>('idle');
    const [errorMsg, setErrorMsg] = useState('');

    // Seed form from profile
    useEffect(() => {
        if (profile) {
            setFirstName(profile.first_name ?? '');
            setLastName(profile.last_name ?? '');
            setPhone(profile.phone ?? '');
        }
    }, [profile]);

    const initials = profile
        ? `${profile.first_name?.charAt(0) ?? ''}${profile.last_name?.charAt(0) ?? ''}`.toUpperCase() || 'U'
        : user?.email?.charAt(0).toUpperCase() ?? 'U';

    const handleSave = async () => {
        if (!user?.id) return;
        if (!firstName.trim() || !lastName.trim()) {
            setErrorMsg(t('name_required'));
            return;
        }

        setSaveState('saving');
        setErrorMsg('');

        const { error } = await supabase
            .from('profiles')
            .update({
                first_name: firstName.trim(),
                last_name: lastName.trim(),
                phone: phone.trim() || null,
            })
            .eq('id', user.id);

        if (error) {
            setSaveState('error');
            setErrorMsg(error.message);
            setTimeout(() => setSaveState('idle'), 3000);
        } else {
            setSaveState('saved');
            await refreshProfile();
            setTimeout(() => setSaveState('idle'), 2500);
        }
    };

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
                    <h1 className="text-2xl font-bold text-foreground">{t('edit_profile')}</h1>
                    <p className="text-sm text-muted-foreground">{t('update_personal_info')}</p>
                </div>
            </motion.div>

            {/* Avatar */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}
                className="flex justify-center">
                <div className="relative">
                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary to-emerald-400 flex items-center justify-center text-white text-3xl font-bold shadow-lg shadow-primary/30">
                        {initials}
                    </div>
                    <div className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-card border-2 border-border flex items-center justify-center text-muted-foreground">
                        <Camera size={14} />
                    </div>
                </div>
            </motion.div>

            {/* Form */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                className="glass-card rounded-3xl p-6 space-y-5">

                {/* First Name */}
                <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <User size={15} className="text-primary" />
                        {t('first_name')}
                    </label>
                    <input
                        type="text"
                        value={firstName}
                        onChange={e => setFirstName(e.target.value)}
                        placeholder={t('enter_first_name')}
                        className="w-full bg-muted/50 border border-border/50 rounded-2xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
                    />
                </div>

                {/* Last Name */}
                <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <User size={15} className="text-primary" />
                        {t('last_name')}
                    </label>
                    <input
                        type="text"
                        value={lastName}
                        onChange={e => setLastName(e.target.value)}
                        placeholder={t('enter_last_name')}
                        className="w-full bg-muted/50 border border-border/50 rounded-2xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
                    />
                </div>

                {/* Phone */}
                <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <Phone size={15} className="text-primary" />
                        {t('phone_number')}
                    </label>
                    <input
                        type="tel"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        placeholder={t('enter_phone_number')}
                        className="w-full bg-muted/50 border border-border/50 rounded-2xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
                    />
                </div>

                {/* Email (read-only) */}
                <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <Mail size={15} className="text-primary" />
                        {t('email')}
                    </label>
                    <input
                        type="email"
                        value={user?.email ?? ''}
                        readOnly
                        className="w-full bg-muted/30 border border-border/30 rounded-2xl px-4 py-3 text-sm text-muted-foreground cursor-not-allowed"
                    />
                    <p className="text-xs text-muted-foreground">{t('email_cannot_change')}</p>
                </div>

                {/* Error */}
                {errorMsg && (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-2xl px-4 py-3">
                        <AlertCircle size={16} />
                        {errorMsg}
                    </motion.div>
                )}

                {/* Save Button */}
                <button
                    onClick={handleSave}
                    disabled={saveState === 'saving'}
                    className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-primary to-emerald-400 text-white font-semibold text-sm shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                >
                    {saveState === 'saving' ? (
                        <><Loader2 size={18} className="animate-spin" /> {t('saving')}</>
                    ) : saveState === 'saved' ? (
                        <><CheckCircle size={18} /> {t('saved_success')}</>
                    ) : (
                        t('save_changes')
                    )}
                </button>
            </motion.div>
        </div>
    );
}
