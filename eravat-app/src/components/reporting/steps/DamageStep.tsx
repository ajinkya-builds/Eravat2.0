import { motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { useActivityForm } from '../../../contexts/ActivityFormContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import type { LossType } from '../../../types/activity-report';

const LOSS_CATEGORIES: { value: LossType; label: string }[] = [
    { value: 'crop', label: 'lt_crop' },
    { value: 'livestock', label: 'lt_livestock' },
    { value: 'property', label: 'lt_property' },
    { value: 'fencing', label: 'lt_fencing' },
    { value: 'solar panels', label: 'lt_solar' },
    { value: 'FD establishment', label: 'lt_fd' },
    { value: 'Other', label: 'lt_other' },
];

export function DamageStep() {
    const { formData, updateFormData } = useActivityForm();
    const { t, language } = useLanguage();

    const handleToggleCategory = (category: LossType) => {
        const current = [...formData.loss_type];
        const next = current.includes(category)
            ? current.filter(c => c !== category)
            : [...current, category];
        updateFormData({ loss_type: next, conflict_loss_details: next });
    };

    const getLocalizedText = () => {
        const text: Record<string, {
            title: string;
            subtitle: string;
            descLabel: string;
            descPlaceholder: string;
            valLabel: string;
            valPlaceholder: string;
            catLabel: string;
        }> = {
            en: {
                title: 'Conflict Damage Details',
                subtitle: 'Provide info on losses or damage caused by elephants.',
                descLabel: 'Damage Description',
                descPlaceholder: 'Describe the damage (e.g. 2 acres of sugarcane, broken wall)...',
                valLabel: 'Estimated Value (₹)',
                valPlaceholder: 'Enter estimated value in Rupees',
                catLabel: 'Select Affected Categories',
            },
            hi: {
                title: 'संघर्ष नुकसान विवरण',
                subtitle: 'हाथियों द्वारा किए गए नुकसान या क्षति की जानकारी दें।',
                descLabel: 'नुकसान का विवरण',
                descPlaceholder: 'नुकसान का वर्णन करें (जैसे 2 एकड़ गन्ना, टूटी हुई दीवार)...',
                valLabel: 'अनुमानित मूल्य (₹)',
                valPlaceholder: 'रुपये में अनुमानित मूल्य दर्ज करें',
                catLabel: 'प्रभावित श्रेणियां चुनें',
            },
            mr: {
                title: 'नुकसानीचा तपशील',
                subtitle: 'हत्तींमुळे झालेल्या नुकसानीची माहिती द्या.',
                descLabel: 'नुकसानीचे वर्णन',
                descPlaceholder: 'नुकसानीचे वर्णन करा (उदा. २ एकर ऊस, तुटलेली भिंत)...',
                valLabel: 'अंदाजे मूल्य (₹)',
                valPlaceholder: 'रुपयात अंदाजे मूल्य प्रविष्ट करा',
                catLabel: 'बाधित श्रेणी निवडा',
            }
        };
        const lang = (language || 'en').split('-')[0];
        return text[lang] || text.en;
    };

    const strings = getLocalizedText();

    return (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
            <div className="text-center space-y-2">
                <h3 className="font-semibold text-foreground flex items-center justify-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-destructive" />
                    {strings.title}
                </h3>
                <p className="text-xs text-muted-foreground">{strings.subtitle}</p>
            </div>

            {/* Categories Selector */}
            <div className="space-y-3">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {strings.catLabel} <span className="text-destructive">*</span>
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

            {/* Damage Description */}
            <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {strings.descLabel}
                </label>
                <textarea
                    value={formData.damage_description}
                    onChange={(e) => updateFormData({ damage_description: e.target.value })}
                    rows={3}
                    placeholder={strings.descPlaceholder}
                    className="w-full px-4 py-3 rounded-2xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm transition-all"
                />
            </div>

            {/* Estimated Value */}
            <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {strings.valLabel}
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
                        placeholder={strings.valPlaceholder}
                        className="w-full pl-8 pr-4 py-3 rounded-2xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm transition-all font-medium"
                    />
                </div>
            </div>
        </motion.div>
    );
}
