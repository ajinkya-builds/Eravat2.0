import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, UserPlus, Loader2, CheckCircle2, List } from 'lucide-react';
import { supabase } from '../supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { LocationFields } from '../components/profile/LocationFields';
import { VillageAutocomplete, type VillageOption } from '../components/villagers/VillageAutocomplete';
import { canOnboardVillagers } from '../lib/rbac';
import { toE164India } from '../lib/phone';

export default function OnboardVillager() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { t } = useLanguage();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [villageName, setVillageName] = useState('');
  const [selectedVillage, setSelectedVillage] = useState<VillageOption | null>(null);
  const [location, setLocation] = useState<{ latitude: number | null; longitude: number | null }>({
    latitude: null,
    longitude: null,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!canOnboardVillagers(profile?.role)) {
    return (
      <div className="min-h-screen p-6 max-w-lg mx-auto">
        <p className="text-destructive text-sm">{t('hathiMitra.onboardForbidden')}</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-primary text-sm font-semibold">
          {t('profile.cancel')}
        </button>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!fullName.trim() || !phone.trim() || !villageName.trim()) {
      setError(t('hathiMitra.onboardRequired'));
      return;
    }

    const mobile = toE164India(phone);
    if (!mobile) {
      setError(t('hathiMitra.invalidPhone'));
      return;
    }

    if (location.latitude == null || location.longitude == null) {
      setError(t('hathiMitra.onboardGpsRequired'));
      return;
    }

    setIsSubmitting(true);
    try {
      const divisionId = selectedVillage?.division_id ?? profile?.division_id ?? null;

      let villageId: string | null = selectedVillage?.id ?? null;
      if (!villageId) {
        const { data, error: villageErr } = await supabase.rpc('ensure_village', {
          p_name: villageName.trim(),
          p_division_id: divisionId,
        });
        if (villageErr) throw villageErr;
        villageId = data as string | null;
      }
      if (!villageId) throw new Error(t('hathiMitra.onboardFailed'));

      const { error: insertErr } = await supabase.from('villagers').insert({
        name: fullName.trim(),
        mobile,
        latitude: location.latitude,
        longitude: location.longitude,
        village_id: villageId,
        division_id: divisionId,
        created_by: profile?.id ?? null,
        alert_opt_in: true,
      });
      if (insertErr) {
        if (insertErr.code === '23505') {
          throw new Error(t('hathiMitra.duplicateMobile'));
        }
        throw insertErr;
      }

      setSuccess(fullName.trim());
      setFullName('');
      setPhone('');
      setVillageName('');
      setSelectedVillage(null);
      setLocation({ latitude: null, longitude: null });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('hathiMitra.onboardFailed'));
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
        <h1 className="text-lg font-bold flex-1">{t('hathiMitra.onboardTitle')}</h1>
        <button
          type="button"
          onClick={() => navigate('/villagers')}
          className="p-2 rounded-xl hover:bg-muted/50 transition-colors text-muted-foreground"
          aria-label={t('hathiMitra.listTitle')}
        >
          <List size={20} />
        </button>
      </div>

      <div className="p-6 max-w-lg mx-auto space-y-6">
        <p className="text-sm text-muted-foreground">{t('hathiMitra.onboardDesc')}</p>
        <p className="text-xs text-muted-foreground bg-muted/40 rounded-xl px-3 py-2">
          {t('hathiMitra.noLoginNote')}
        </p>

        {success && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 space-y-2"
          >
            <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm">
              <CheckCircle2 size={18} />
              {`${success} ${t('hathiMitra.onboardSuccess')}`}
            </div>
          </motion.div>
        )}

        {error && (
          <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl p-3">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium ml-1">{t('hathiMitra.onboardName')}</label>
            <input
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={t('hathiMitra.onboardNamePlaceholder')}
              className="w-full p-3 rounded-xl bg-muted/50 border border-border text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium ml-1">{t('profile.phoneNumber')}</label>
            <input
              required
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="9876543210"
              className="w-full p-3 rounded-xl bg-muted/50 border border-border text-sm"
            />
          </div>

          <VillageAutocomplete
            value={villageName}
            divisionId={profile?.division_id}
            onChange={(name, selected) => {
              setVillageName(name);
              setSelectedVillage(selected);
            }}
          />

          <LocationFields value={location} onChange={setLocation} required />

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-12 bg-primary text-primary-foreground rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <UserPlus size={18} />}
            {isSubmitting ? t('hathiMitra.onboardSubmitting') : t('hathiMitra.onboardSubmit')}
          </button>
        </form>
      </div>
    </div>
  );
}
