import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import type { ObservationType } from '../types/activity-report';

export type FormStep =
    | 'dateTimeLocation'
    | 'observationType'
    | 'damage'
    | 'compassBearing'
    | 'photo'
    | 'review';

export interface ActivityFormData {
    // Step 1: Date, Time, Location + territory confirm
    activity_date: string;
    activity_time: string;
    latitude: number | null;
    longitude: number | null;
    division_id: string | null;
    range_id: string | null;
    beat_id: string | null;

    // Step 2: Observation Type
    observation_type: ObservationType | null;
    total_elephants: number;
    male_count: number;
    female_count: number;
    unknown_count: number;
    calf_count: number;
    indirect_sign_details: string[];
    conflict_loss_details: string[];
    loss_type: string[];
    /** Free-text description for Direct / Indirect observation */
    description: string;

    // Step 3: Compass Bearing
    compass_bearing: number | null;

    // Step 4: Photo
    photo_url: string | null;
    notes: string | null;

    // Custom Damage fields
    damage_description: string;
    damage_value: number | null;
    report_damage_manually: boolean;
    affected_people: number;
}

interface ActivityFormContextValue {
    formData: ActivityFormData;
    updateFormData: (updates: Partial<ActivityFormData>) => void;
    currentStep: FormStep;
    currentStepIndex: number;
    goToNextStep: () => void;
    goToPreviousStep: () => void;
    isStepValid: (step: FormStep) => boolean;
    isLastStep: () => boolean;
    resetForm: () => void;
    activeSteps: FormStep[];
    elephantTotal: number;
}

const DEFAULT_FORM: ActivityFormData = {
    activity_date: '',
    activity_time: '',
    latitude: null,
    longitude: null,
    division_id: null,
    range_id: null,
    beat_id: null,
    observation_type: null,
    total_elephants: 0,
    male_count: 0,
    female_count: 0,
    unknown_count: 0,
    calf_count: 0,
    indirect_sign_details: [],
    conflict_loss_details: [],
    loss_type: [],
    description: '',
    compass_bearing: null,
    photo_url: null,
    notes: null,
    damage_description: '',
    damage_value: null,
    report_damage_manually: false,
    affected_people: 1,
};

function countTotal(data: ActivityFormData): number {
    return (data.male_count || 0) + (data.female_count || 0) + (data.calf_count || 0) + (data.unknown_count || 0);
}

/** GPS + timestamp are enough to continue. Beat/range/division are optional on-device; filled from GPS on sync. */
export function isDateTimeLocationComplete(data: Pick<ActivityFormData, 'activity_date' | 'activity_time' | 'latitude' | 'longitude'>): boolean {
    if (!data.activity_date || !data.activity_time || data.latitude == null || data.longitude == null) {
        return false;
    }
    if (data.latitude < -90 || data.latitude > 90) return false;
    if (data.longitude < -180 || data.longitude > 180) return false;
    const activityDateTime = new Date(`${data.activity_date}T${data.activity_time}`);
    if (activityDateTime > new Date()) return false;
    return true;
}

const ActivityFormContext = createContext<ActivityFormContextValue | null>(null);

export function ActivityFormProvider({ children }: { children: ReactNode }) {
    const [formData, setFormData] = useState<ActivityFormData>(DEFAULT_FORM);
    const [stepIndex, setStepIndex] = useState(0);

    const updateFormData = useCallback((updates: Partial<ActivityFormData>) => {
        setFormData(prev => ({ ...prev, ...updates }));
    }, []);

    const elephantTotal = useMemo(() => countTotal(formData), [formData]);

    const activeSteps = useMemo(() => {
        const steps: FormStep[] = ['dateTimeLocation', 'observationType'];
        if (formData.observation_type === 'loss' || formData.report_damage_manually) {
            steps.push('damage');
        }
        steps.push('compassBearing', 'photo', 'review');
        return steps;
    }, [formData.observation_type, formData.report_damage_manually]);

    const normalizedStepIndex = Math.min(stepIndex, activeSteps.length - 1);

    const isStepValid = useCallback((step: FormStep): boolean => {
        switch (step) {
            case 'dateTimeLocation':
                return isDateTimeLocationComplete(formData);
            case 'observationType': {
                if (!formData.observation_type) return false;
                if (formData.observation_type === 'indirect') {
                    if (formData.indirect_sign_details.length === 0) return false;
                }
                if (formData.observation_type === 'direct' || formData.observation_type === 'indirect') {
                    // Counts optional for indirect (may be unknown), but if any counters used total is fine.
                    // Direct still requires at least 1 elephant.
                    if (formData.observation_type === 'direct' && countTotal(formData) <= 0) return false;
                }
                if (formData.observation_type === 'loss') return formData.loss_type.length > 0;
                return true;
            }
            case 'damage': {
                if (formData.loss_type.length === 0) return false;
                if (formData.loss_type.includes('Other') && !formData.damage_description.trim()) return false;
                const peopleLoss = formData.loss_type.some(
                    (c) => c === 'human_injury' || c === 'human_death',
                );
                if (peopleLoss && (!formData.affected_people || formData.affected_people < 1)) return false;
                return true;
            }
            case 'compassBearing':
                return formData.compass_bearing != null && Number.isFinite(formData.compass_bearing);
            case 'photo':
                return Boolean(formData.photo_url);
            case 'review':
                return true;
            default:
                return false;
        }
    }, [formData]);

    const goToNextStep = useCallback(() => {
        setStepIndex(i => Math.min(i + 1, activeSteps.length - 1));
    }, [activeSteps.length]);

    const goToPreviousStep = useCallback(() => {
        setStepIndex(i => Math.max(i - 1, 0));
    }, []);

    const isLastStep = useCallback(
        () => normalizedStepIndex === activeSteps.length - 1,
        [normalizedStepIndex, activeSteps.length]
    );

    const resetForm = useCallback(() => {
        setFormData(DEFAULT_FORM);
        setStepIndex(0);
    }, []);

    return (
        <ActivityFormContext.Provider value={{
            formData,
            updateFormData,
            currentStep: activeSteps[normalizedStepIndex],
            currentStepIndex: normalizedStepIndex,
            goToNextStep,
            goToPreviousStep,
            isStepValid,
            isLastStep,
            resetForm,
            activeSteps,
            elephantTotal,
        }}>
            {children}
        </ActivityFormContext.Provider>
    );
}

export function useActivityForm() {
    const ctx = useContext(ActivityFormContext);
    if (!ctx) throw new Error('useActivityForm must be used inside ActivityFormProvider');
    return ctx;
}
