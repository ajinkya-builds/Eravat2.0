import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, UserPlus, Loader2, CheckCircle2 } from 'lucide-react';
import { supabase } from '../supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { LocationFields } from '../components/profile/LocationFields';
import { TerritorySelect, type TerritoryValue } from '../components/shared/TerritorySelect';
import { canOnboardVolunteers } from '../lib/rbac';
import { track } from '../lib/analytics';
import { digitsForMobileInput, toE164India } from '../lib/phone';

export default function OnboardVolunteer() {
    const navigate = useNavigate();
    const { profile, session } = useAuth();
    const { t } = useLanguage();

    const [fullName, setFullName] = useState('');
    const [phone, setPhone] = useState('');
    const [location, setLocation] = useState<{ latitude: number | null; longitude: number | null }>({
        latitude: null,
        longitude: null,
    });
    const [territory, setTerritory] = useState<TerritoryValue>({
        division_id: null,
        range_id: null,
        beat_id: null,
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<{ name: string } | null>(null);

    useEffect(() => {
        if (!profile) return;
        setTerritory((prev) => ({
            division_id: prev.division_id ?? profile.division_id ?? null,
            range_id: prev.range_id ?? profile.range_id ?? null,
            beat_id: prev.beat_id ?? profile.beat_id ?? null,
        }));
    }, [profile?.id]);

    if (!canOnboardVolunteers(profile?.role)) {
        return (
            <div className="min-h-screen p-6 max-w-lg mx-auto">
                <p className="text-destructive text-sm">{t('volunteer.onboardForbidden')}</p>
                <button onClick={() => navigate(-1)} className="mt-4 text-primary text-sm font-semibold">
                    {t('profile.cancel')}
                </button>
            </div>
        );
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!fullName.trim() || !phone.trim()) {
            setError(t('volunteer.onboardRequired'));
            return;
        }
        const mobile = toE164India(phone);
        if (!mobile) {
            setError(t('otp.invalidPhone'));
            return;
        }
        if (location.latitude == null || location.longitude == null) {
            setError(t('volunteer.onboardGpsRequired'));
            return;
        }

        setIsSubmitting(true);
        try {
            const accessToken = session?.access_token;
            if (!accessToken) throw new Error('Not authenticated');

            const { data, error: fnErr } = await supabase.functions.invoke('create-user', {
                body: {
                    role: 'volunteer',
                    full_name: fullName.trim(),
                    phone: mobile,
                    latitude: location.latitude,
                    longitude: location.longitude,
                    onboard_volunteer: true,
                    division_id: territory.division_id,
                    range_id: territory.range_id,
                    beat_id: territory.beat_id,
                },
                headers: { Authorization: `Bearer ${accessToken}` },
            });

            if (fnErr) throw fnErr;
            if (data?.error) throw new Error(data.error);

            track('volunteer_onboarded', { role: 'volunteer' });
            setSuccess({
                name: fullName.trim(),
            });
            setFullName('');
            setPhone('');
            setLocation({ latitude: null, longitude: null });
            setTerritory({ division_id: null, range_id: null, beat_id: null });
        } catch (err) {
            setError(err instanceof Error ? err.message : t('volunteer.onboardFailed'));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-background pb-24">
            <div className="sticky top-16 z-30 glass-effect border-b border-border/50 px-4 py-4 flex items-center gap-3">
                <button
                    type="button"
                    onClick={() => navigate(-1)}
                    className="p-2 rounded-xl hover:bg-muted/50 transition-colors"
                >
                    <ArrowLeft size={20} />
                </button>
                <h1 className="text-lg font-bold">{t('volunteer.onboardTitle')}</h1>
            </div>

            <div className="p-6 max-w-lg mx-auto space-y-6">
                <p className="text-sm text-muted-foreground">{t('volunteer.onboardDesc')}</p>

                {success && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 space-y-2"
                    >
                        <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm">
                            <CheckCircle2 size={18} />
                            {`${success.name} ${t('volunteer.onboardSuccess')}`}
                        </div>

                        <p className="text-xs text-muted-foreground">{t('volunteer.onboardOtpHint')}</p>
                    </motion.div>
                )}

                {error && (
                    <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl p-3">
                        {error}
                    </p>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="space-y-2">
                        <label className="text-sm font-medium ml-1">{t('volunteer.onboardName')}</label>
                        <input
                            required
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            placeholder={t('volunteer.onboardNamePlaceholder')}
                            className="w-full p-3 rounded-xl bg-muted/50 border border-border text-sm"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium ml-1">{t('profile.phoneNumber')}</label>
                        <input
                            required
                            type="tel"
                            inputMode="numeric"
                            maxLength={16}
                            value={phone}
                            onChange={(e) => setPhone(digitsForMobileInput(e.target.value))}
                            placeholder="9876543210"
                            className="w-full p-3 rounded-xl bg-muted/50 border border-border text-sm"
                        />
                    </div>

                    <LocationFields value={location} onChange={setLocation} required />

                    <TerritorySelect
                        value={territory}
                        onChange={setTerritory}
                        latitude={location.latitude}
                        longitude={location.longitude}
                        includeBeat
                        required
                    />

                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full h-12 bg-primary text-primary-foreground rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <UserPlus size={18} />}
                        {isSubmitting ? t('volunteer.onboardSubmitting') : t('volunteer.onboardSubmit')}
                    </button>
                </form>
            </div>
        </div>
    );
}
