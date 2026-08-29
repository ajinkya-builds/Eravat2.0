import { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef, type ReactNode } from 'react';
import type { ObservationType } from '../types/activity-report';
import { useGeolocation, GEOLOCATION_TIMEOUT_MS } from '../hooks/useGeolocation';
import { captureDeviceDateTime } from '../lib/captureDeviceDateTime';
import { track } from '../lib/analytics';
import { logger } from '../lib/logger';

export type FormStep =
    | 'photo'
    | 'observationType'
    | 'damage'
    | 'dateTimeLocation'
    | 'review';

export type LocationPrefetchSource = 'prefetch' | 'retry';

export interface ActivityFormData {
    activity_date: string;
    activity_time: string;
    latitude: number | null;
    longitude: number | null;
    division_id: string | null;
    range_id: string | null;
    beat_id: string | null;

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

    /** Kept for Dexie/Supabase; no longer captured in the wizard. */
    compass_bearing: number | null;

    photo_url: string | null;
    notes: string | null;

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
    gpsLoading: boolean;
    gpsError: string | null;
    refreshLocation: (source?: LocationPrefetchSource) => Promise<void>;
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

export function getActiveSteps(data: Pick<ActivityFormData, 'observation_type' | 'report_damage_manually'>): FormStep[] {
    const steps: FormStep[] = ['photo', 'observationType'];
    if (data.observation_type === 'loss' || data.report_damage_manually) {
        steps.push('damage');
    }
    steps.push('dateTimeLocation', 'review');
    return steps;
}

const ActivityFormContext = createContext<ActivityFormContextValue | null>(null);

export function ActivityFormProvider({ children }: { children: ReactNode }) {
    const [formData, setFormData] = useState<ActivityFormData>(DEFAULT_FORM);
    const [stepIndex, setStepIndex] = useState(0);
    const {
        fetchLocation,
        loading: gpsLoading,
        error: gpsError,
        lastErrorCode,
        getLastKnownLocation,
    } = useGeolocation();
    const prefetchStartedRef = useRef(false);
    const locationRequestIdRef = useRef(0);

    const updateFormData = useCallback((updates: Partial<ActivityFormData>) => {
        setFormData(prev => ({ ...prev, ...updates }));
    }, []);

    const elephantTotal = useMemo(() => countTotal(formData), [formData]);

    const activeSteps = useMemo(
        () => getActiveSteps(formData),
        [formData.observation_type, formData.report_damage_manually],
    );

    const refreshLocation = useCallback(async (source: LocationPrefetchSource = 'retry') => {
        const requestId = ++locationRequestIdRef.current;
        const datetimeStarted = performance.now();
        const { date, time } = captureDeviceDateTime();
        const datetimeMs = Math.round(performance.now() - datetimeStarted);
        if (requestId !== locationRequestIdRef.current) return;
        updateFormData({ activity_date: date, activity_time: time });
        track('report.datetime_captured', { duration_ms: datetimeMs, source });
        logger.info('ReportLocation', 'datetime captured', { duration_ms: datetimeMs, source });

        const gpsStarted = performance.now();
        track('report.gps_prefetch_started', { source, timeout_ms: GEOLOCATION_TIMEOUT_MS });
        logger.info('ReportLocation', 'gps prefetch started', { source, timeout_ms: GEOLOCATION_TIMEOUT_MS });
        const pos = await fetchLocation();
        if (requestId !== locationRequestIdRef.current) return;
        const gpsMs = Math.round(performance.now() - gpsStarted);
        if (pos) {
            const accuracyM = pos.coords.accuracy != null ? Math.round(pos.coords.accuracy) : undefined;
            updateFormData({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
            track('report.gps_acquired', {
                duration_ms: gpsMs,
                accuracy_m: accuracyM,
                source,
            });
            logger.info('ReportLocation', 'gps acquired', { duration_ms: gpsMs, accuracy_m: accuracyM, source });
        } else {
            const fallback = getLastKnownLocation();
            if (fallback) {
                updateFormData({
                    latitude: fallback.coords.latitude,
                    longitude: fallback.coords.longitude,
                });
                const errorCode = lastErrorCode() ?? 'LOCATION_FAILED';
                track('report.gps_fallback_used', {
                    duration_ms: gpsMs,
                    error_code: errorCode,
                    source,
                    cache_age_ms: Date.now() - fallback.timestamp,
                });
                logger.warn('ReportLocation', 'gps fallback to last known fix', {
                    duration_ms: gpsMs,
                    error_code: errorCode,
                    source,
                });
            } else {
                const errorCode = lastErrorCode() ?? 'LOCATION_FAILED';
                track('report.gps_failed', { duration_ms: gpsMs, error_code: errorCode, source });
                logger.warn('ReportLocation', 'gps failed', { duration_ms: gpsMs, error_code: errorCode, source });
            }
        }
    }, [fetchLocation, getLastKnownLocation, lastErrorCode, updateFormData]);

    useEffect(() => {
        if (prefetchStartedRef.current) return;
        prefetchStartedRef.current = true;
        void refreshLocation('prefetch');
    }, [refreshLocation]);

    const normalizedStepIndex = Math.min(stepIndex, activeSteps.length - 1);

    const isStepValid = useCallback((step: FormStep): boolean => {
        switch (step) {
            case 'photo':
                return Boolean(formData.photo_url);
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
        locationRequestIdRef.current += 1;
        setFormData(DEFAULT_FORM);
        setStepIndex(0);
        prefetchStartedRef.current = false;
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
            gpsLoading,
            gpsError,
            refreshLocation,
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
