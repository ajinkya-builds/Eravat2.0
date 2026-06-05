import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { MapPin, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../supabase';
import { useLanguage } from '../../contexts/LanguageContext';
import { LocationFields } from '../../components/profile/LocationFields';

/** Shown when a logged-in user has no valid profile GPS coordinates yet. */
export default function CompleteProfileLocation() {
    const navigate = useNavigate();
    const { profile, refreshProfile } = useAuth();
    const { t } = useLanguage();
    const [location, setLocation] = useState({
        latitude: profile?.latitude ?? null,
        longitude: profile?.longitude ?? null,
    });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!profile?.id || location.latitude == null || location.longitude == null) {
            setError(t('volunteer.onboardGpsRequired'));
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            const { error: updateErr } = await supabase
                .from('profiles')
                .update({
                    latitude: location.latitude,
                    longitude: location.longitude,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', profile.id);

            if (updateErr) throw updateErr;
            await refreshProfile();
            navigate('/', { replace: true });
        } catch (err) {
            setError(err instanceof Error ? err.message : t('profile.updateFailed'));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-background">
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card rounded-3xl p-8 max-w-md w-full space-y-6"
            >
                <div className="text-center space-y-2">
                    <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
                        <MapPin size={28} />
                    </div>
                    <h1 className="text-xl font-bold">{t('profile.locationRequiredTitle')}</h1>
                    <p className="text-sm text-muted-foreground">{t('profile.locationRequiredDesc')}</p>
                </div>

                {error && (
                    <p className="text-sm text-destructive bg-destructive/10 rounded-xl p-3">{error}</p>
                )}

                <form onSubmit={handleSave} className="space-y-4">
                    <LocationFields value={location} onChange={setLocation} />
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {isLoading && <Loader2 size={18} className="animate-spin" />}
                        {t('profile.saveLocation')}
                    </button>
                </form>
            </motion.div>
        </div>
    );
}
