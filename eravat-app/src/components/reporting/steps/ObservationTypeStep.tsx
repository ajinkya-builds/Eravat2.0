import { motion, AnimatePresence } from 'framer-motion';
import { Eye, TreePine, AlertTriangle } from 'lucide-react';
import { useActivityForm } from '../../../contexts/ActivityFormContext';
import type { ObservationType, IndirectSightingType, LossType } from '../../../types/activity-report';

const OBSERVATION_TYPES = [
    { value: 'direct' as ObservationType, label: 'Direct Sighting', description: 'You directly saw elephants', icon: Eye, color: 'emerald' },
    { value: 'indirect' as ObservationType, label: 'Indirect Sign', description: 'Evidence of elephant presence', icon: TreePine, color: 'amber' },
    { value: 'loss' as ObservationType, label: 'Loss / Damage', description: 'Reported damage or loss', icon: AlertTriangle, color: 'destructive' },
];

const INDIRECT_TYPES: IndirectSightingType[] = ['Pugmark', 'Dung', 'Broken Branches', 'Sound', 'Eyewitness'];
const LOSS_TYPES: { value: LossType; label: string }[] = [
    { value: 'No loss', label: 'No Loss' },
    { value: 'crop', label: 'Crop Damage' },
    { value: 'livestock', label: 'Livestock Loss' },
    { value: 'property', label: 'Property Damage' },
    { value: 'fencing', label: 'Fencing Damage' },
    { value: 'solar panels', label: 'Solar Panel Damage' },
    { value: 'FD establishment', label: 'FD Establishment' },
    { value: 'Other', label: 'Other' },
];

import { Plus, Minus } from 'lucide-react';

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

export function ObservationTypeStep() {
    const { formData, updateFormData } = useActivityForm();

    const handleNumberChange = (field: string, value: number) => {
        updateFormData({ [field]: value } as never);
    };

    return (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
            {/* Type Selection */}
            <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Type of Observation <span className="text-destructive">*</span></label>
                <div className="grid grid-cols-1 gap-3">
                    {OBSERVATION_TYPES.map(({ value, label, description, icon: Icon, color }) => {
                        const isSelected = formData.observation_type === value;
                        const colorMap: Record<string, string> = {
                            emerald: 'border-emerald-500 bg-emerald-500/10',
                            amber: 'border-amber-500 bg-amber-500/10',
                            destructive: 'border-destructive bg-destructive/10',
                        };
                        const iconColorMap: Record<string, string> = {
                            emerald: 'text-emerald-500',
                            amber: 'text-amber-500',
                            destructive: 'text-destructive',
                        };
                        return (
                            <button
                                key={value}
                                type="button"
                                onClick={() => updateFormData({ observation_type: value, indirect_sign_details: [], loss_type: [] })}
                                className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all ${isSelected ? colorMap[color] : 'border-border bg-muted/20 hover:bg-muted/50'}`}
                            >
                                <div className={`p-2 rounded-xl ${isSelected ? `bg-white/20` : 'bg-muted'}`}>
                                    <Icon className={`w-5 h-5 ${isSelected ? iconColorMap[color] : 'text-muted-foreground'}`} />
                                </div>
                                <div>
                                    <p className="font-semibold text-sm">{label}</p>
                                    <p className="text-xs text-muted-foreground">{description}</p>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Conditional fields */}
            <AnimatePresence mode="wait">
                {formData.observation_type === 'direct' && (
                    <motion.div key="direct" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                        className="glass-card rounded-2xl p-4 space-y-4">
                        <h4 className="font-semibold text-sm">Elephant Count Details</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <CounterInput label="Total" field="total_elephants" value={formData.total_elephants} onChange={handleNumberChange} />
                            <CounterInput label="Adult Male" field="male_count" value={formData.male_count} onChange={handleNumberChange} />
                            <CounterInput label="Adult Female" field="female_count" value={formData.female_count} onChange={handleNumberChange} />
                            <CounterInput label="Calves" field="calf_count" value={formData.calf_count} onChange={handleNumberChange} />
                            <div className="md:col-span-2">
                                <CounterInput label="Unknown / Unidentified" field="unknown_count" value={formData.unknown_count} onChange={handleNumberChange} />
                            </div>
                        </div>
                    </motion.div>
                )}

                {formData.observation_type === 'indirect' && (
                    <motion.div key="indirect" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                        className="glass-card rounded-2xl p-4 space-y-3">
                        <h4 className="font-semibold text-sm">Type of Indirect Sign <span className="text-destructive">*</span></h4>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {INDIRECT_TYPES.map(type => {
                                const isSelected = formData.indirect_sign_details.includes(type);
                                return (
                                    <button
                                        key={type}
                                        type="button"
                                        onClick={() => {
                                            const current = [...formData.indirect_sign_details];
                                            const next = current.includes(type)
                                                ? current.filter(t => t !== type)
                                                : [...current, type];
                                            updateFormData({ indirect_sign_details: next });
                                        }}
                                        className={`px-3 py-2 rounded-xl text-sm font-medium border transition-all ${isSelected ? 'bg-amber-500/20 border-amber-500 text-amber-600 shadow-sm shadow-amber-500/20 scale-100' : 'border-border bg-background hover:bg-muted scale-[0.98]'}`}
                                    >
                                        {type}
                                    </button>
                                )
                            })}
                        </div>
                    </motion.div>
                )}

                {formData.observation_type === 'loss' && (
                    <motion.div key="loss" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                        className="glass-card rounded-2xl p-4 space-y-3">
                        <h4 className="font-semibold text-sm">Type of Loss <span className="text-destructive">*</span></h4>
                        <div className="grid grid-cols-2 gap-2">
                            {LOSS_TYPES.map(({ value, label }) => {
                                const isSelected = formData.loss_type.includes(value);
                                return (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => {
                                            const current = [...formData.loss_type];
                                            const next = current.includes(value)
                                                ? current.filter(t => t !== value)
                                                : [...current, value];
                                            updateFormData({ loss_type: next });
                                        }}
                                        className={`px-3 py-2 rounded-xl text-sm font-medium border text-left transition-all ${isSelected ? 'bg-destructive/10 border-destructive text-destructive shadow-sm shadow-destructive/20 scale-100' : 'border-border bg-background hover:bg-muted scale-[0.98]'}`}
                                    >
                                        {label}
                                    </button>
                                );
                            })}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
