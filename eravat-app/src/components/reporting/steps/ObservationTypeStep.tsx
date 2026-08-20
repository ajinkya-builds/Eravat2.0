import { motion, AnimatePresence } from 'framer-motion';
import { Eye, TreePine, Plus, Minus } from 'lucide-react';
import { useActivityForm } from '../../../contexts/ActivityFormContext';
import type { ObservationType, IndirectSightingType } from '../../../types/activity-report';
import { useLanguage } from '../../../contexts/LanguageContext';

const OBSERVATION_TYPES = [
    { value: 'direct' as ObservationType, label: 'ot_direct_sighting', description: 'ot_direct_desc', icon: Eye, color: 'emerald' },
    { value: 'indirect' as ObservationType, label: 'ot_indirect_sign', description: 'ot_indirect_desc', icon: TreePine, color: 'amber' },
];

const INDIRECT_TYPES: IndirectSightingType[] = [
    'Footprint/Pug Mark',
    'Dung',
    'Sound',
    'Broken Branches',
    'Eyewitness',
];
const INDIRECT_TYPE_KEYS: Record<string, string> = {
    'Footprint/Pug Mark': 'it_pugmark',
    Pugmark: 'it_pugmark',
    Dung: 'it_dung',
    'Broken Branches': 'it_broken_branches',
    Sound: 'it_sound',
    Eyewitness: 'it_eyewitness',
};

function CounterInput({ label, field, value, onChange }: { label: string; field: string; value: number; onChange: (f: string, v: number) => void }) {
    return (
        <div className="flex flex-col gap-2 p-3 rounded-2xl bg-muted/30 border border-border/50">
            <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{label}</span>
            <div className="flex items-center justify-between gap-3">
                <button
                    type="button"
                    onClick={() => onChange(field, Math.max(0, (value || 0) - 1))}
                    className="p-3 rounded-xl bg-background border-2 border-border/50 text-foreground hover:bg-muted active:scale-95 transition-all w-12 h-12 flex items-center justify-center flex-shrink-0"
                >
                    <Minus className="w-5 h-5" />
                </button>
                <div className="flex-1 text-center">
                    <span className="text-2xl font-bold tabular-nums text-foreground">{value || 0}</span>
                </div>
                <button
                    type="button"
                    onClick={() => onChange(field, (value || 0) + 1)}
                    className="p-3 rounded-xl bg-primary text-primary-foreground hover:opacity-90 active:scale-95 transition-all w-12 h-12 flex items-center justify-center flex-shrink-0 shadow-sm shadow-primary/20"
                >
                    <Plus className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
}

function ElephantCountBlock() {
    const { formData, updateFormData, elephantTotal } = useActivityForm();
    const { t } = useLanguage();

    const handleNumberChange = (field: string, value: number) => {
        updateFormData({ [field]: value } as never);
    };

    return (
        <div className="glass-card rounded-2xl p-4 space-y-4">
            <h4 className="font-semibold text-sm">{t('ot_elephant_count')}</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2 p-3 rounded-2xl bg-muted/50 border border-border/50 md:col-span-2">
                    <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{t('ot_total')}</span>
                    <span className="text-2xl font-bold tabular-nums text-foreground">{elephantTotal}</span>
                    <p className="text-xs text-muted-foreground">{t('ot_total_auto')}</p>
                </div>
                <CounterInput label={t('ot_adult_male')} field="male_count" value={formData.male_count} onChange={handleNumberChange} />
                <CounterInput label={t('ot_adult_female')} field="female_count" value={formData.female_count} onChange={handleNumberChange} />
                <CounterInput label={t('ot_calves')} field="calf_count" value={formData.calf_count} onChange={handleNumberChange} />
                <CounterInput label={t('ot_unknown')} field="unknown_count" value={formData.unknown_count} onChange={handleNumberChange} />
            </div>
        </div>
    );
}

export function ObservationTypeStep() {
    const { formData, updateFormData } = useActivityForm();
    const { t } = useLanguage();

    return (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
            <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">{t('ot_type_of_observation')} <span className="text-destructive">*</span></label>
                <div className="grid grid-cols-1 gap-3">
                    {OBSERVATION_TYPES.map(({ value, label, description, icon: Icon, color }) => {
                        const isSelected = formData.observation_type === value;
                        const colorMap: Record<string, string> = {
                            emerald: 'border-emerald-500 bg-emerald-500/10',
                            amber: 'border-amber-500 bg-amber-500/10',
                        };
                        const iconColorMap: Record<string, string> = {
                            emerald: 'text-emerald-500',
                            amber: 'text-amber-500',
                        };
                        return (
                            <button
                                key={value}
                                type="button"
                                onClick={() =>
                                    updateFormData({
                                        observation_type: value,
                                        indirect_sign_details: [],
                                        conflict_loss_details: [],
                                        loss_type: [],
                                        report_damage_manually: false,
                                    })
                                }
                                className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all ${isSelected ? colorMap[color] : 'border-border bg-muted/20 hover:bg-muted/50'}`}
                            >
                                <div className={`p-2 rounded-xl ${isSelected ? `bg-white/20` : 'bg-muted'}`}>
                                    <Icon className={`w-5 h-5 ${isSelected ? iconColorMap[color] : 'text-muted-foreground'}`} />
                                </div>
                                <div>
                                    <p className="font-semibold text-sm">{t(label)}</p>
                                    <p className="text-xs text-muted-foreground">{t(description)}</p>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {formData.observation_type && (
                <div className="p-4 rounded-2xl border border-border bg-muted/10 flex items-center justify-between">
                    <div className="space-y-0.5 pr-4">
                        <span className="text-sm font-semibold text-foreground">{t('ot_report_damage')}</span>
                        <p className="text-xs text-muted-foreground">{t('ot_report_damage_hint')}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                        <input
                            type="checkbox"
                            checked={formData.report_damage_manually}
                            onChange={(e) => updateFormData({ report_damage_manually: e.target.checked })}
                            className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-muted dark:bg-muted/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                </div>
            )}

            <AnimatePresence mode="wait">
                {formData.observation_type === 'direct' && (
                    <motion.div
                        key="direct"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-4"
                    >
                        <ElephantCountBlock />
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">{t('ot_description')}</label>
                            <textarea
                                value={formData.description}
                                onChange={(e) => updateFormData({ description: e.target.value, notes: e.target.value || null })}
                                rows={3}
                                placeholder={t('ot_description_placeholder')}
                                className="w-full px-4 py-3 rounded-2xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
                            />
                        </div>
                    </motion.div>
                )}

                {formData.observation_type === 'indirect' && (
                    <motion.div
                        key="indirect"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-4"
                    >
                        <div className="glass-card rounded-2xl p-4 space-y-3">
                            <h4 className="font-semibold text-sm">{t('ot_indirect_sign_type')} <span className="text-destructive">*</span></h4>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                {INDIRECT_TYPES.map((type) => {
                                    const isSelected = formData.indirect_sign_details.includes(type);
                                    return (
                                        <button
                                            key={type}
                                            type="button"
                                            onClick={() => {
                                                const current = [...formData.indirect_sign_details];
                                                const next = current.includes(type)
                                                    ? current.filter((x) => x !== type)
                                                    : [...current, type];
                                                updateFormData({ indirect_sign_details: next });
                                            }}
                                            className={`px-3 py-2 rounded-xl text-sm font-medium border transition-all ${isSelected ? 'bg-amber-500/20 border-amber-500 text-amber-600 shadow-sm shadow-amber-500/20 scale-100' : 'border-border bg-background hover:bg-muted scale-[0.98]'}`}
                                        >
                                            {t(INDIRECT_TYPE_KEYS[type] || type)}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        <ElephantCountBlock />
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">{t('ot_description')}</label>
                            <textarea
                                value={formData.description}
                                onChange={(e) => updateFormData({ description: e.target.value, notes: e.target.value || null })}
                                rows={3}
                                placeholder={t('ot_description_placeholder')}
                                className="w-full px-4 py-3 rounded-2xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
                            />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
