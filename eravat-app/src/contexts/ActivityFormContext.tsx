import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { ObservationType, IndirectSightingType, LossType } from '../types/activity-report';

export type FormStep = 'dateTimeLocation' | 'observationType' | 'compassBearing' | 'photo';

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
    indirect_sign_details: IndirectSightingType | null;
    loss_type: LossType | null;

    // Step 3: Compass Bearing
    compass_bearing: number | null;

    // Step 4: Photo
    photo_url: string | null;
    notes: string | null;
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
}

const STEPS: FormStep[] = ['dateTimeLocation', 'observationType', 'compassBearing', 'photo'];

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
    indirect_sign_details: null,
    loss_type: null,
    compass_bearing: null,
    photo_url: null,
    notes: null,
};

const ActivityFormContext = createContext<ActivityFormContextValue | null>(null);

export function ActivityFormProvider({ children }: { children: ReactNode }) {
    const [formData, setFormData] = useState<ActivityFormData>(DEFAULT_FORM);
    const [stepIndex, setStepIndex] = useState(0);

    const updateFormData = useCallback((updates: Partial<ActivityFormData>) => {
        setFormData(prev => ({ ...prev, ...updates }));
    }, []);

    const isStepValid = useCallback((step: FormStep): boolean => {
        switch (step) {
            case 'dateTimeLocation':
                return !!(formData.activity_date && formData.activity_time && formData.latitude && formData.longitude);
            case 'observationType':
                if (!formData.observation_type) return false;
                if (formData.observation_type === 'indirect') return !!formData.indirect_sign_details;
                if (formData.observation_type === 'loss') return !!formData.loss_type;
                return true; // direct sighting - just type is enough
            case 'compassBearing':
                return true; // Optional step - always valid
            case 'photo':
                return true; // Optional step - always valid
            default:
                return false;
        }
    }, [formData]);

    const goToNextStep = useCallback(() => {
        if (stepIndex < STEPS.length - 1) setStepIndex(i => i + 1);
    }, [stepIndex]);

    const goToPreviousStep = useCallback(() => {
        if (stepIndex > 0) setStepIndex(i => i - 1);
    }, [stepIndex]);

    const isLastStep = useCallback(() => stepIndex === STEPS.length - 1, [stepIndex]);

    const resetForm = useCallback(() => {
        setFormData(DEFAULT_FORM);
        setStepIndex(0);
    }, []);

    return (
        <ActivityFormContext.Provider value={{
            formData,
            updateFormData,
            currentStep: STEPS[stepIndex],
            currentStepIndex: stepIndex,
            goToNextStep,
            goToPreviousStep,
            isStepValid,
            isLastStep,
            resetForm,
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
