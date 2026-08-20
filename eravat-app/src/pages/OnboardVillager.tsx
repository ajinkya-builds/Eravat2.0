import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, List } from 'lucide-react';
import { supabase } from '../supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { VillagerForm } from '../components/villagers/VillagerForm';
import { canOnboardVillagers } from '../lib/rbac';
import {
  emptyVillagerForm,
  ensureVillageId,
  isUniqueMobileError,
  validateVillagerForm,
  type VillagerFormValues,
} from '../lib/villagerRegistry';

export default function OnboardVillager() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { t } = useLanguage();

  const [values, setValues] = useState<VillagerFormValues>(() => emptyVillagerForm(profile));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setValues((prev) => ({
      ...prev,
      territory: {
        division_id: prev.territory.division_id ?? profile.division_id ?? null,
        range_id: prev.territory.range_id ?? profile.range_id ?? null,
        beat_id: prev.territory.beat_id ?? profile.beat_id ?? null,
      },
    }));
  }, [profile?.id]);

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

    const parsed = validateVillagerForm(values);
    if (!parsed.ok) {
      setError(t(parsed.errorKey));
      return;
    }

    setIsSubmitting(true);
    try {
      const divisionId =
        values.territory.division_id ?? values.selectedVillage?.division_id ?? profile?.division_id ?? null;
      const rangeId = values.territory.range_id ?? profile?.range_id ?? null;
      const villageId = await ensureVillageId(values.villageName, values.selectedVillage, divisionId);

      const { error: insertErr } = await supabase.from('villagers').insert({
        name: values.name.trim(),
        mobile: parsed.mobile,
        latitude: values.location.latitude,
        longitude: values.location.longitude,
        village_id: villageId,
        division_id: divisionId,
        range_id: rangeId,
        created_by: profile?.id ?? null,
        alert_opt_in: true,
        is_active: true,
      });
      if (insertErr) {
        if (isUniqueMobileError(insertErr)) {
          throw new Error(t('hathiMitra.duplicateMobile'));
        }
        throw insertErr;
      }

      setSuccess(values.name.trim());
      setValues(emptyVillagerForm(profile));
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
          aria-label={t('hathiMitra.myListTitle')}
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

        <VillagerForm
          values={values}
          onChange={setValues}
          onSubmit={handleSubmit}
          submitting={isSubmitting}
          submitLabel={t('hathiMitra.onboardSubmit')}
          submittingLabel={t('hathiMitra.onboardSubmitting')}
        />
      </div>
    </div>
  );
}
