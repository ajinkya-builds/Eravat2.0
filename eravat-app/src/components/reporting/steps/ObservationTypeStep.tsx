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

function NumberInput({ label, field, value, onChange }: { label: string; field: string; value: number; onChange: (f: string, v: number) => void }) {
    return (
        <div className="space-y-1">
            <label className="text-xs text-muted-foreground font-medium">{label}</label>
            <input
                type="number"
                min={0}
                value={value || ''}
                onChange={e => onChange(field, parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded-xl bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
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
                                onClick={() => updateFormData({ observation_type: value, indirect_sighting_type: null, loss_type: null })}
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
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            <NumberInput label="Total" field="total_elephants" value={formData.total_elephants} onChange={handleNumberChange} />
                            <NumberInput label="Adult Male" field="male_elephants" value={formData.male_elephants} onChange={handleNumberChange} />
                            <NumberInput label="Adult Female" field="female_elephants" value={formData.female_elephants} onChange={handleNumberChange} />
                            <NumberInput label="Unknown" field="unknown_elephants" value={formData.unknown_elephants} onChange={handleNumberChange} />
                            <NumberInput label="Calves" field="calves" value={formData.calves} onChange={handleNumberChange} />
                        </div>
                    </motion.div>
                )}

                {formData.observation_type === 'indirect' && (
                    <motion.div key="indirect" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                        className="glass-card rounded-2xl p-4 space-y-3">
                        <h4 className="font-semibold text-sm">Type of Indirect Sign <span className="text-destructive">*</span></h4>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {INDIRECT_TYPES.map(type => (
                                <button
                                    key={type}
                                    type="button"
                                    onClick={() => updateFormData({ indirect_sighting_type: type })}
                                    className={`px-3 py-2 rounded-xl text-sm font-medium border transition-all ${formData.indirect_sighting_type === type ? 'bg-amber-500/20 border-amber-500 text-amber-600' : 'border-border hover:bg-muted'}`}
                                >
                                    {type}
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}

                {formData.observation_type === 'loss' && (
                    <motion.div key="loss" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                        className="glass-card rounded-2xl p-4 space-y-3">
                        <h4 className="font-semibold text-sm">Type of Loss <span className="text-destructive">*</span></h4>
                        <div className="grid grid-cols-2 gap-2">
                            {LOSS_TYPES.map(({ value, label }) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => updateFormData({ loss_type: value })}
                                    className={`px-3 py-2 rounded-xl text-sm font-medium border text-left transition-all ${formData.loss_type === value ? 'bg-destructive/10 border-destructive text-destructive' : 'border-border hover:bg-muted'}`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
