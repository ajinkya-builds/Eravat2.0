import { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef, type ReactNode } from 'react';
import type { ObservationType } from '../types/activity-report';
import { useGeolocation, GEOLOCATION_TIMEOUT_MS } from '../hooks/useGeolocation';
import { captureDeviceDateTime } from '../lib/captureDeviceDateTime';
import { LOCATION_ENABLED_EVENT, type AcquiredPosition } from '../lib/deviceLocation';
import { track } from '../lib/analytics';
import { accuracyBucket, geoBaseProps, roundCoord, trackGeo } from '../lib/geoTelemetry';
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
    pendingCellFix: AcquiredPosition | null;
    refreshLocation: (source?: LocationPrefetchSource) => Promise<void>;
    acceptCellLocation: () => void;
    retryGpsAfterCell: () => Promise<void>;
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
        latitude: liveLatitude,
        longitude: liveLongitude,
        accuracy: liveAccuracy,
        locationSource,
    } = useGeolocation();
    const prefetchStartedRef = useRef(false);
    const locationRequestIdRef = useRef(0);
    const autoFixRef = useRef<{ lat: number; lng: number; acc: number } | null>(null);
    const sawGpsLoadingRef = useRef(false);
    const [pendingCellFix, setPendingCellFix] = useState<AcquiredPosition | null>(null);

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
        autoFixRef.current = null;
        const datetimeStarted = performance.now();
        const { date, time } = captureDeviceDateTime();
        const datetimeMs = Math.round(performance.now() - datetimeStarted);
        if (requestId !== locationRequestIdRef.current) return;
        setPendingCellFix(null);
        updateFormData({
            activity_date: date,
            activity_time: time,
            latitude: null,
            longitude: null,
        });
        track('report.datetime_captured', geoBaseProps({ duration_ms: datetimeMs, source }));
        logger.info('ReportLocation', 'datetime captured', { duration_ms: datetimeMs, source });

        const gpsStarted = performance.now();
        track('report.gps_prefetch_started', geoBaseProps({
            source,
            timeout_ms: GEOLOCATION_TIMEOUT_MS,
            caller: `report.${source}`,
        }));
        logger.info('ReportLocation', 'gps prefetch started', { source, timeout_ms: GEOLOCATION_TIMEOUT_MS });
        const pos = await fetchLocation({ promptIfDisabled: true, caller: `report.${source}` });
        if (requestId !== locationRequestIdRef.current) return;
        const gpsMs = Math.round(performance.now() - gpsStarted);
        if (pos) {
            const accuracyM = pos.coords.accuracy != null ? Math.round(pos.coords.accuracy) : undefined;
            if (pos.source === 'cell') {
                setPendingCellFix(pos);
                track('report.cell_fix_offered', geoBaseProps({
                    duration_ms: gpsMs,
                    accuracy_m: accuracyM,
                    accuracy_bucket: accuracyBucket(pos.coords.accuracy),
                    source,
                    location_source: 'cell',
                    lat_r4: roundCoord(pos.coords.latitude),
                    lng_r4: roundCoord(pos.coords.longitude),
                }));
                logger.info('ReportLocation', 'cell fix offered', { duration_ms: gpsMs, accuracy_m: accuracyM, source });
                return;
            }
            const acc = pos.coords.accuracy != null && Number.isFinite(pos.coords.accuracy)
                ? pos.coords.accuracy
                : Number.POSITIVE_INFINITY;
            autoFixRef.current = {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                acc,
            };
            updateFormData({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
            track('report.gps_acquired', geoBaseProps({
                duration_ms: gpsMs,
                accuracy_m: accuracyM,
                accuracy_bucket: accuracyBucket(pos.coords.accuracy),
                source,
                location_source: pos.source,
                lat_r4: roundCoord(pos.coords.latitude),
                lng_r4: roundCoord(pos.coords.longitude),
            }));
            logger.info('ReportLocation', 'gps acquired', { duration_ms: gpsMs, accuracy_m: accuracyM, source });
        } else {
            const errorCode = lastErrorCode() ?? 'LOCATION_FAILED';
            track('report.gps_failed', geoBaseProps({
                duration_ms: gpsMs,
                error_code: errorCode,
                source,
                caller: `report.${source}`,
            }));
            logger.warn('ReportLocation', 'gps failed', { duration_ms: gpsMs, error_code: errorCode, source });
        }
    }, [fetchLocation, lastErrorCode, updateFormData]);

    // A doorway GPS lock can arrive after the indoor fix is already on the form.
    useEffect(() => {
        if (gpsLoading) {
            sawGpsLoadingRef.current = true;
            return;
        }
        if (!sawGpsLoadingRef.current) return;
        if (locationSource === 'cell') return;
        if (liveLatitude == null || liveLongitude == null) return;
        const acc = typeof liveAccuracy === 'number' && Number.isFinite(liveAccuracy)
            ? liveAccuracy
            : Number.POSITIVE_INFINITY;
        const stamp = autoFixRef.current;
        const formLat = formData.latitude;
        const formLng = formData.longitude;
        const userEdited = formLat != null && formLng != null && (
            !stamp || stamp.lat !== formLat || stamp.lng !== formLng
        );
        if (userEdited) return;
        if (stamp && acc >= stamp.acc) return;
        autoFixRef.current = { lat: liveLatitude, lng: liveLongitude, acc };
        track('geo.report_upgrade_applied', geoBaseProps({
            accuracy_m: Number.isFinite(acc) ? Math.round(acc) : undefined,
            accuracy_bucket: accuracyBucket(Number.isFinite(acc) ? acc : null),
            previous_accuracy_m: stamp && Number.isFinite(stamp.acc) ? Math.round(stamp.acc) : undefined,
            lat_r4: roundCoord(liveLatitude),
            lng_r4: roundCoord(liveLongitude),
            location_source: locationSource ?? undefined,
        }));
        updateFormData({ latitude: liveLatitude, longitude: liveLongitude });
    }, [
        gpsLoading,
        locationSource,
        liveLatitude,
        liveLongitude,
        liveAccuracy,
        formData.latitude,
        formData.longitude,
        updateFormData,
    ]);

    const acceptCellLocation = useCallback(() => {
        if (!pendingCellFix) return;
        const pos = pendingCellFix;
        const accuracyM = pos.coords.accuracy != null ? Math.round(pos.coords.accuracy) : undefined;
        setPendingCellFix(null);
        const acc = pos.coords.accuracy != null && Number.isFinite(pos.coords.accuracy)
            ? pos.coords.accuracy
            : Number.POSITIVE_INFINITY;
        autoFixRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc };
        updateFormData({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        track('report.cell_fix_accepted', geoBaseProps({
            accuracy_m: accuracyM,
            accuracy_bucket: accuracyBucket(pos.coords.accuracy),
            lat_r4: roundCoord(pos.coords.latitude),
            lng_r4: roundCoord(pos.coords.longitude),
            location_source: 'cell',
        }));
        logger.info('ReportLocation', 'cell fix accepted', { accuracy_m: accuracyM });
    }, [pendingCellFix, updateFormData]);

    const retryGpsAfterCell = useCallback(async () => {
        track('report.cell_fix_retry', geoBaseProps({ location_source: 'cell' }));
        setPendingCellFix(null);
        await refreshLocation('retry');
    }, [refreshLocation]);

    useEffect(() => {
        if (prefetchStartedRef.current) return;
        prefetchStartedRef.current = true;
        void refreshLocation('prefetch');
    }, [refreshLocation]);

    useEffect(() => {
        return () => {
            // Leaving /report (X / back) — ignore late GPS writes and mark for PostHog.
            locationRequestIdRef.current += 1;
            trackGeo('geo.acquire_superseded', {
                reason: 'report_unmount',
                had_coords: formData.latitude != null && formData.longitude != null,
            });
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount only
    }, []);

    useEffect(() => {
        const onLocationState = (event: Event) => {
            const enabled = Boolean((event as CustomEvent<{ enabled?: boolean }>).detail?.enabled);
            if (!enabled) return;
            if (formData.latitude != null && formData.longitude != null) return;
            void refreshLocation('retry');
        };
        window.addEventListener(LOCATION_ENABLED_EVENT, onLocationState);
        return () => window.removeEventListener(LOCATION_ENABLED_EVENT, onLocationState);
    }, [formData.latitude, formData.longitude, refreshLocation]);

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
        trackGeo('geo.acquire_superseded', {
            reason: 'report_reset',
            had_coords: false,
        });
        autoFixRef.current = null;
        sawGpsLoadingRef.current = false;
        setPendingCellFix(null);
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
            pendingCellFix,
            refreshLocation,
            acceptCellLocation,
            retryGpsAfterCell,
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
