import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '../supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { VillagerForm } from '../components/villagers/VillagerForm';
import { canEditVillagerRecord, canReadVillagers } from '../lib/rbac';
import { fromE164India } from '../lib/phone';
import {
  emptyVillagerForm,
  ensureVillageId,
  isUniqueMobileError,
  isUuid,
  validateVillagerForm,
  villageNameOf,
  VILLAGER_DETAIL_SELECT,
  type VillagerFormValues,
  type VillagerRecord,
} from '../lib/villagerRegistry';

import { PAGE_STICKY_HEADER } from '../lib/layout';

export default function VillagerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { t } = useLanguage();

  const [row, setRow] = useState<VillagerRecord | null>(null);
  const [values, setValues] = useState<VillagerFormValues>(emptyVillagerForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canRead = canReadVillagers(profile?.role);
  const canEdit = canEditVillagerRecord(profile?.role, profile?.id, row?.created_by);

  useEffect(() => {
    if (!canRead) return;
    if (!isUuid(id)) {
      setRow(null);
      setLoading(false);
      return;
    }
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: fetchErr } = await supabase
          .from('villagers')
          .select(VILLAGER_DETAIL_SELECT)
          .eq('id', id)
          .maybeSingle();
        if (fetchErr) throw fetchErr;
        if (!data) {
          if (!cancelled) setRow(null);
          return;
        }
        const record = data as unknown as VillagerRecord;
        if (!cancelled) {
          setRow(record);
          setValues({
            name: record.name,
            phone: fromE164India(record.mobile),
            villageName: villageNameOf(record) ?? '',
            selectedVillage: {
              id: record.village_id,
              name: villageNameOf(record) ?? '',
              division_id: record.division_id,
            },
            location: { latitude: record.latitude, longitude: record.longitude },
            territory: {
              division_id: record.division_id,
              range_id: record.range_id,
              beat_id: null,
            },
            notes: record.notes ?? '',
            alertOptIn: record.alert_opt_in,
            isActive: record.is_active,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t('hathiMitra.listFailed'));
          setRow(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, canRead, t]);

  if (!canRead) {
    return (
      <div className="min-h-screen p-6 max-w-lg mx-auto">
        <p className="text-destructive text-sm">{t('hathiMitra.onboardForbidden')}</p>
        <button onClick={() => navigate('/')} className="mt-4 text-primary text-sm font-semibold">
          {t('profile.cancel')}
        </button>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !canEdit) return;
    setError(null);
    setSuccess(null);

    const parsed = validateVillagerForm(values);
    if (!parsed.ok) {
      setError(t(parsed.errorKey));
      return;
    }

    setSaving(true);
    try {
      const divisionId =
        values.territory.division_id ?? values.selectedVillage?.division_id ?? profile?.division_id ?? null;
      const rangeId = values.territory.range_id ?? null;
      const villageId = await ensureVillageId(values.villageName, values.selectedVillage, divisionId);

      const { data, error: updateErr } = await supabase
        .from('villagers')
        .update({
          name: values.name.trim(),
          mobile: parsed.mobile,
          latitude: values.location.latitude,
          longitude: values.location.longitude,
          village_id: villageId,
          division_id: divisionId,
          range_id: rangeId,
          notes: values.notes.trim() || null,
          alert_opt_in: values.alertOptIn,
          is_active: values.isActive,
        })
        .eq('id', id)
        .select('id');
      if (updateErr) {
        if (isUniqueMobileError(updateErr)) throw new Error(t('hathiMitra.duplicateMobile'));
        throw updateErr;
      }
      if (!data?.length) throw new Error(t('hathiMitra.saveFailed'));
      setSuccess(t('hathiMitra.saveSuccess'));
      setRow((prev) =>
        prev
          ? {
              ...prev,
              name: values.name.trim(),
              mobile: parsed.mobile,
              is_active: values.isActive,
              alert_opt_in: values.alertOptIn,
              notes: values.notes.trim() || null,
            }
          : prev,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t('hathiMitra.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-background pb-24">
      <div className={PAGE_STICKY_HEADER}>
        <button
          type="button"
          onClick={() => navigate('/villagers', { replace: true })}
          className="p-2 rounded-xl hover:bg-muted/50 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold flex-1">{t('hathiMitra.editTitle')}</h1>
      </div>

      <div className="p-6 max-w-lg mx-auto space-y-6">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground text-sm">
            <Loader2 size={16} className="animate-spin" /> {t('loading')}
          </div>
        ) : !row ? (
          <p className="text-sm text-muted-foreground">{t('hathiMitra.notFound')}</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground bg-muted/40 rounded-xl px-3 py-2">
              {t('hathiMitra.noLoginNote')}
            </p>

            {!canEdit && (
              <p className="text-sm text-amber-700 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                {t('hathiMitra.readOnly')}
              </p>
            )}

            {success && (
              <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10">
                <CheckCircle2 size={18} />
                {success}
              </div>
            )}

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl p-3">
                {error}
              </p>
            )}

            {canEdit ? (
              <VillagerForm
                values={values}
                onChange={setValues}
                onSubmit={handleSubmit}
                submitting={saving}
                submitLabel={t('hathiMitra.saveChanges')}
                submittingLabel={t('hathiMitra.saving')}
                submitIcon="save"
                showNotes
                showStatusFields
              />
            ) : (
              <div className="rounded-2xl border border-border/50 bg-card p-4 space-y-3 text-sm">
                <p className="font-semibold text-foreground">{row.name}</p>
                <p className="text-muted-foreground">{row.mobile}</p>
                {villageNameOf(row) && <p className="text-muted-foreground">{villageNameOf(row)}</p>}
                {row.notes && <p className="text-muted-foreground">{row.notes}</p>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
