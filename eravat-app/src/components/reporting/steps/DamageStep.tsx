import { motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { useActivityForm } from '../../../contexts/ActivityFormContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import type { LossType } from '../../../types/activity-report';

const LOSS_CATEGORIES: { value: LossType; label: string }[] = [
    { value: 'crop', label: 'lt_crop' },
    { value: 'grain', label: 'lt_grain' },
    { value: 'property', label: 'lt_property' },
    { value: 'livestock', label: 'lt_livestock' },
    { value: 'fencing', label: 'lt_fencing' },
    { value: 'naka_chaouki', label: 'lt_naka' },
    { value: 'Other', label: 'lt_other' },
];

export function DamageStep() {
    const { formData, updateFormData } = useActivityForm();
    const { t } = useLanguage();

    const handleToggleCategory = (category: LossType) => {
        const current = [...formData.loss_type];
        const next = current.includes(category)
            ? current.filter((c) => c !== category)
            : [...current, category];
        updateFormData({ loss_type: next, conflict_loss_details: next });
    };

    const otherSelected = formData.loss_type.includes('Other');

    return (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
            <div className="text-center space-y-2">
                <h3 className="font-semibold text-foreground flex items-center justify-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-destructive" />
                    {t('ds_title')}
                </h3>
                <p className="text-xs text-muted-foreground">{t('ds_subtitle')}</p>
            </div>

            <div className="space-y-3">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('ds_categories')} <span className="text-destructive">*</span>
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {LOSS_CATEGORIES.map(({ value, label }) => {
                        const isSelected = formData.loss_type.includes(value);
                        return (
                            <button
                                key={value}
                                type="button"
                                onClick={() => handleToggleCategory(value)}
                                className={`px-3 py-2 rounded-xl text-sm font-medium border text-left transition-all ${
                                    isSelected
                                        ? 'bg-destructive/10 border-destructive text-destructive shadow-sm shadow-destructive/20 scale-100'
                                        : 'border-border bg-background hover:bg-muted scale-[0.98]'
                                }`}
                            >
                                {t(label)}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {otherSelected ? t('ds_other_desc') : t('ds_desc_label')}
                    {otherSelected && <span className="text-destructive"> *</span>}
                </label>
                <textarea
                    value={formData.damage_description}
                    onChange={(e) => updateFormData({ damage_description: e.target.value })}
                    rows={3}
                    placeholder={otherSelected ? t('ds_other_placeholder') : t('ds_desc_placeholder')}
                    className="w-full px-4 py-3 rounded-2xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm transition-all"
                />
            </div>

            <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('ds_val_label')}
                </label>
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-muted-foreground text-sm font-medium">
                        ₹
                    </div>
                    <input
                        type="number"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={formData.damage_value || ''}
                        onChange={(e) => {
                            const val = e.target.value ? parseInt(e.target.value) : null;
                            updateFormData({ damage_value: val });
                        }}
                        placeholder={t('ds_val_placeholder')}
                        className="w-full pl-8 pr-4 py-3 rounded-2xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm transition-all font-medium"
                    />
                </div>
            </div>
        </motion.div>
    );
}
