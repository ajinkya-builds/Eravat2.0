import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import type { ObservationType } from '../types/activity-report';

export type FormStep = 'dateTimeLocation' | 'observationType' | 'damage' | 'compassBearing' | 'photo';

export interface ActivityFormData {
    // Step 1: Date, Time, Location
    activity_date: string;
    activity_time: string;
    latitude: number | null;
    longitude: number | null;

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

    // Step 3: Compass Bearing
    compass_bearing: number | null;

    // Step 4: Photo
    photo_url: string | null;
    notes: string | null;

    // Custom Damage fields
    damage_description: string;
    damage_value: number | null;
    report_damage_manually: boolean;
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
}

const DEFAULT_FORM: ActivityFormData = {
    activity_date: '',
    activity_time: '',
    latitude: null,
    longitude: null,
    observation_type: null,
    total_elephants: 0,
    male_count: 0,
    female_count: 0,
    unknown_count: 0,
    calf_count: 0,
    indirect_sign_details: [],
    conflict_loss_details: [],
    loss_type: [],
    compass_bearing: null,
    photo_url: null,
    notes: null,
    damage_description: '',
    damage_value: null,
    report_damage_manually: false,
};

const ActivityFormContext = createContext<ActivityFormContextValue | null>(null);

export function ActivityFormProvider({ children }: { children: ReactNode }) {
    const [formData, setFormData] = useState<ActivityFormData>(DEFAULT_FORM);
    const [stepIndex, setStepIndex] = useState(0);

    const updateFormData = useCallback((updates: Partial<ActivityFormData>) => {
        setFormData(prev => ({ ...prev, ...updates }));
    }, []);

    // Dynamically calculate which steps are active based on the bypass logic
    const activeSteps = useMemo(() => {
        const steps: FormStep[] = ['dateTimeLocation', 'observationType'];
        if (formData.observation_type === 'loss' || formData.report_damage_manually) {
            steps.push('damage');
        }
        steps.push('compassBearing', 'photo');
        return steps;
    }, [formData.observation_type, formData.report_damage_manually]);

    // Ensure stepIndex is always inside bounds of current activeSteps length
    const normalizedStepIndex = Math.min(stepIndex, activeSteps.length - 1);

    const isStepValid = useCallback((step: FormStep): boolean => {
        switch (step) {
            case 'dateTimeLocation':
                // Check required fields exist
                if (!formData.activity_date || !formData.activity_time || formData.latitude == null || formData.longitude == null) {
                    return false;
                }
                // Validate lat/lng ranges
                if (formData.latitude < -90 || formData.latitude > 90) return false;
                if (formData.longitude < -180 || formData.longitude > 180) return false;
                // Validate date is not in the future
                const activityDateTime = new Date(`${formData.activity_date}T${formData.activity_time}`);
                if (activityDateTime > new Date()) return false;
                return true;
            case 'observationType':
                if (!formData.observation_type) return false;
                if (formData.observation_type === 'indirect') return formData.indirect_sign_details.length > 0;
                if (formData.observation_type === 'loss') return formData.loss_type.length > 0;
                // direct sighting - require at least 1 elephant
                if (formData.observation_type === 'direct') {
                    const total = formData.male_count + formData.female_count + formData.calf_count + formData.unknown_count;
                    return total > 0;
                }
                return true;
            case 'damage':
                // If it is active, requires at least one loss category selected (in loss_type)
                // and a brief description.
                if (formData.observation_type === 'loss') {
                    return formData.loss_type.length > 0;
                }
                return true;
            case 'compassBearing':
                return true; // Optional step - always valid
            case 'photo':
                return true; // Optional step - always valid
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

    const isLastStep = useCallback(() => normalizedStepIndex === activeSteps.length - 1, [normalizedStepIndex, activeSteps.length]);

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
