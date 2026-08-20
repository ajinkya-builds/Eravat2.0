import { Loader2, Save, UserPlus } from 'lucide-react';
import { LocationFields } from '../profile/LocationFields';
import { TerritorySelect } from '../shared/TerritorySelect';
import { VillageAutocomplete } from './VillageAutocomplete';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import type { VillagerFormValues } from '../../lib/villagerRegistry';

interface VillagerFormProps {
  values: VillagerFormValues;
  onChange: (next: VillagerFormValues) => void;
  onSubmit: (e: React.FormEvent) => void;
  submitting: boolean;
  submitLabel: string;
  submittingLabel: string;
  submitIcon?: 'add' | 'save';
  showNotes?: boolean;
  showStatusFields?: boolean;
}

export function VillagerForm({
  values,
  onChange,
  onSubmit,
  submitting,
  submitLabel,
  submittingLabel,
  submitIcon = 'add',
  showNotes = false,
  showStatusFields = false,
}: VillagerFormProps) {
  const { t } = useLanguage();
  const { profile } = useAuth();

  const patch = (partial: Partial<VillagerFormValues>) => onChange({ ...values, ...partial });

  return (
    <form onSubmit={onSubmit} className="space-y-5" data-testid="villager-form">
      <div className="space-y-2">
        <label className="text-sm font-medium ml-1">{t('hathiMitra.onboardName')}</label>
        <input
          required
          value={values.name}
          onChange={(e) => patch({ name: e.target.value })}
          placeholder={t('hathiMitra.onboardNamePlaceholder')}
          className="w-full p-3 rounded-xl bg-muted/50 border border-border text-sm"
          autoComplete="name"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium ml-1">{t('profile.phoneNumber')}</label>
        <input
          required
          type="tel"
          value={values.phone}
          onChange={(e) => patch({ phone: e.target.value })}
          placeholder="9876543210"
          className="w-full p-3 rounded-xl bg-muted/50 border border-border text-sm"
        />
      </div>

      <VillageAutocomplete
        value={values.villageName}
        divisionId={values.territory.division_id ?? profile?.division_id}
        onChange={(name, selected) => patch({ villageName: name, selectedVillage: selected })}
      />

      <LocationFields value={values.location} onChange={(location) => patch({ location })} required />

      <TerritorySelect
        value={values.territory}
        onChange={(territory) => patch({ territory })}
        latitude={values.location.latitude}
        longitude={values.location.longitude}
        includeBeat={false}
        required
      />

      {showNotes && (
        <div className="space-y-2">
          <label className="text-sm font-medium ml-1">{t('hathiMitra.notes')}</label>
          <textarea
            value={values.notes}
            onChange={(e) => patch({ notes: e.target.value })}
            placeholder={t('hathiMitra.notesPlaceholder')}
            rows={3}
            className="w-full p-3 rounded-xl bg-muted/50 border border-border text-sm resize-y"
          />
        </div>
      )}

      {showStatusFields && (
        <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/30 p-4">
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={values.isActive}
              onChange={(e) => patch({ isActive: e.target.checked })}
              className="mt-0.5 rounded border-border"
            />
            <span>{t('hathiMitra.activeLabel')}</span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={values.alertOptIn}
              onChange={(e) => patch({ alertOptIn: e.target.checked })}
              className="mt-0.5 rounded border-border"
            />
            <span>{t('hathiMitra.alertOptIn')}</span>
          </label>
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full h-12 bg-primary text-primary-foreground rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {submitting ? (
          <Loader2 size={18} className="animate-spin" />
        ) : submitIcon === 'save' ? (
          <Save size={18} />
        ) : (
          <UserPlus size={18} />
        )}
        {submitting ? submittingLabel : submitLabel}
      </button>
    </form>
  );
}
