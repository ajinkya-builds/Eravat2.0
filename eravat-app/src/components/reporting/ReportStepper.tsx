import { useState, useEffect, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, MapPin, FileText, Camera, CheckCircle2, X, AlertTriangle, ClipboardCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ActivityFormProvider, useActivityForm, type FormStep } from '../../contexts/ActivityFormContext';
import { DateTimeLocationStep } from './steps/DateTimeLocationStep';
import { ObservationTypeStep } from './steps/ObservationTypeStep';
import { DamageStep } from './steps/DamageStep';
import { PhotoStep } from './steps/PhotoStep';
import { ReviewStep } from './steps/ReviewStep';
import { UnsavedChangesModal } from './UnsavedChangesModal';
import { useCamera } from '../../hooks/useCamera';
import { db } from '../../db';
import { cn } from '../../lib/utils';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Network } from '@capacitor/network';
import { syncData } from '../../services/syncService';
import { stampPhotoWithMeta } from '../../lib/stampPhoto';
import { track } from '../../lib/analytics';
import { logger } from '../../lib/logger';
import { newUuid } from '../../lib/uuid';
import { PAGE_STICKY_TOP } from '../../lib/layout';

function StepperContent() {
    const { formData, currentStep, currentStepIndex, goToNextStep, goToPreviousStep, isStepValid, isLastStep, resetForm, activeSteps, updateFormData, elephantTotal } = useActivityForm();
    const { profile } = useAuth();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [submittedOnline, setSubmittedOnline] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [showExitWarning, setShowExitWarning] = useState(false);
    const [isOnline, setIsOnline] = useState(true);
    const navigate = useNavigate();
    const { t } = useLanguage();
    const { takePhoto, isCapturing: loadingCamera } = useCamera();

    useEffect(() => {
        let mounted = true;
        Network.getStatus().then(status => {
            if (mounted) {
                setIsOnline(status.connected);
                track('report.wizard_opened', { online: Boolean(status.connected) });
            }
        });
        const listener = Network.addListener('networkStatusChange', status => {
            if (mounted) setIsOnline(status.connected);
        });
        return () => {
            mounted = false;
            void listener.then(l => l.remove());
        };
    }, []);

    useEffect(() => {
        track('report.step_viewed', { step: currentStep });
    }, [currentStep]);

    const ALL_STEPS: Record<FormStep, { label: string; icon: ReactNode }> = {
        dateTimeLocation: { label: t('rs_date_location'), icon: <MapPin className="w-4 h-4" /> },
        observationType: { label: t('rs_observation'), icon: <FileText className="w-4 h-4" /> },
        damage: { label: t('rs_damage_label'), icon: <AlertTriangle className="w-4 h-4" /> },
        photo: { label: t('rs_photo'), icon: <Camera className="w-4 h-4" /> },
        review: { label: t('rs_review'), icon: <ClipboardCheck className="w-4 h-4" /> },
    };

    const isFormDirty = () => {
        return formData.observation_type !== null ||
               formData.activity_date !== '' ||
               formData.activity_time !== '' ||
               formData.damage_description !== '' ||
               formData.damage_value !== null ||
               formData.photo_url !== null ||
               Boolean(formData.description);
    };

    const handleExitClick = () => {
        if (isFormDirty()) {
            setShowExitWarning(true);
        } else {
            resetForm();
            navigate('/', { replace: true });
        }
    };

    const handleConfirmExit = () => {
        setShowExitWarning(false);
        resetForm();
        navigate('/', { replace: true });
    };

    const handleBottomBarCapture = async () => {
        const result = await takePhoto();
        if (!result) return;
        const stamped = await stampPhotoWithMeta(result.dataUrl, {
            latitude: formData.latitude,
            longitude: formData.longitude,
            activityDate: formData.activity_date,
            activityTime: formData.activity_time,
        });
        updateFormData({ photo_url: stamped });
    };

    const handleSubmit = async () => {
        if (isSubmitting) return;
        if (!profile?.id) {
            setSubmitError(t('report.profileNotLoaded'));
            return;
        }
        if (!isStepValid('review') || !formData.photo_url || !isStepValid('dateTimeLocation')) {
            setSubmitError(t('rv_incomplete'));
            return;
        }
        setIsSubmitting(true);
        setSubmitError(null);
        try {
            const reportId = newUuid();
            const notes = formData.description?.trim() || formData.notes || null;
            const hasMedia = Boolean(formData.photo_url);
            track('report.save_started', { has_media: hasMedia, online: isOnline, report_type: formData.observation_type ?? 'unknown' });

            await db.reports.add({
                id: reportId,
                user_id: profile.id,
                activity_date: formData.activity_date,
                activity_time: formData.activity_time,
                latitude: formData.latitude,
                longitude: formData.longitude,
                observation_type: formData.observation_type,
                compass_bearing: formData.compass_bearing,
                photo_url: formData.photo_url,
                damage_description: formData.damage_description,
                damage_value: formData.damage_value,
                report_damage_manually: formData.report_damage_manually,
                obs_id: newUuid(),
                male_count: formData.male_count || 0,
                female_count: formData.female_count || 0,
                calf_count: formData.calf_count || 0,
                unknown_count: formData.unknown_count || 0,
                total_elephants: elephantTotal,
                indirect_sign_details: formData.indirect_sign_details || [],
                conflict_loss_details: formData.conflict_loss_details || [],
                loss_type: formData.loss_type || [],
                affected_people: formData.affected_people || 1,
                division_id: formData.division_id || null,
                range_id: formData.range_id || null,
                beat_id: formData.beat_id || null,
                notes,
                device_timestamp: new Date().toISOString(),
                sync_status: 'pending',
                status: 'submitted',
            });

            if (formData.photo_url) {
                const match = formData.photo_url.match(/^data:([^;,]+)(?:;charset=[^;,]+)?;base64,([\s\S]+)$/);
                if (!match) {
                    throw new Error('Invalid photo data. Please retake the photo and try again.');
                }
                const mimeType = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
                const base64Data = match[2];
                try {
                    await db.report_media.add({
                        id: newUuid(),
                        report_id: reportId,
                        mime_type: mimeType,
                        file_data: base64Data,
                        sync_status: 'pending'
                    });
                } catch (dexieErr) {
                    logger.error('ReportStepper', 'Failed to add media to Dexie', dexieErr);
                    // Roll back the report row so we never claim success without the required photo
                    await db.reports.delete(reportId);
                    throw new Error('Could not save photo on this device. Free some storage and try again.');
                }
            }

            const net = await Network.getStatus();
            const online = Boolean(net.connected);
            const reportType = formData.observation_type ?? 'unknown';
            setSubmittedOnline(online);
            setSubmitted(true);
            resetForm();
            track('report.save_succeeded', {
                report_type: reportType,
                queued: !online,
                online,
                has_media: hasMedia,
            });
            // Wizard dashboard event name (keep in sync with PostHog Analytics basics)
            track('activity_report_submitted', {
                observation_type: reportType,
                photo_attached: hasMedia,
                submitted_online: online,
            });

            if (online) {
                setTimeout(() => syncData().catch((err) => logger.error('ReportStepper', 'Post-save sync failed', err)), 500);
            }

            setTimeout(() => navigate('/', { replace: true }), 2000);
        } catch (err) {
            logger.error('ReportStepper', 'Failed to save report', err, { online: isOnline });
            track('report.save_failed', { error_code: 'save_exception', online: isOnline });
            setSubmitError(err instanceof Error ? err.message : t('report.saveFailed'));
        } finally {
            setIsSubmitting(false);
        }
    };

    if (submitted) {
        return (
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="flex flex-col items-center justify-center py-16 gap-6">
                <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                </div>
                <div className="text-center">
                    <h2 className="text-xl font-bold text-foreground mb-2">{t('rs_report_saved')}</h2>
                    <p className="text-muted-foreground text-sm">
                        {submittedOnline ? t('rs_syncing_now') : t('rs_stored_locally')}
                    </p>
                </div>
            </motion.div>
        );
    }

    return (
        <div className="flex flex-col min-h-screen bg-background relative overflow-hidden">
            <UnsavedChangesModal
                isOpen={showExitWarning}
                onConfirm={handleConfirmExit}
                onCancel={() => setShowExitWarning(false)}
            />

            <header className={`sticky z-50 px-4 py-4 flex items-center justify-between bg-background/80 backdrop-blur-xl border-b border-border/50 ${PAGE_STICKY_TOP}`}>
                <button
                    onClick={handleExitClick}
                    className="p-2 rounded-full bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    aria-label="Close and go back"
                >
                    <X className="w-5 h-5" />
                </button>
                <h1 className="text-sm font-bold text-foreground">{t('dashboard.reportAction')}</h1>
                <div className="w-10" />
            </header>

            <div className="flex-1 space-y-6 pb-32 pt-6 max-w-2xl mx-auto w-full">
                <div className="space-y-6 px-4">
                    <div className="flex gap-2 max-w-md mx-auto">
                        {activeSteps.map((stepType, i) => (
                            <div key={stepType} className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                <motion.div
                                    initial={false}
                                    animate={{
                                        width: i < currentStepIndex ? '100%' : i === currentStepIndex ? '100%' : '0%'
                                    }}
                                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                                    className={cn(
                                        "h-full rounded-full",
                                        i === currentStepIndex ? "bg-primary" : "bg-primary/50"
                                    )}
                                />
                            </div>
                        ))}
                    </div>

                    <div className="flex justify-start md:justify-center">
                        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 px-4 mask-linear-fade">
                            {activeSteps.map((stepType, i) => {
                                const stepMeta = ALL_STEPS[stepType];
                                return (
                                    <div
                                        key={stepType}
                                        className={cn(
                                            'flex items-center gap-1.5 px-4 py-2 rounded-full text-[10px] md:text-xs font-semibold whitespace-nowrap transition-all duration-300',
                                            i === currentStepIndex
                                                ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20 scale-100'
                                                : i < currentStepIndex
                                                    ? 'bg-primary/10 text-primary border border-primary/20 scale-95 opacity-80'
                                                    : 'bg-muted text-muted-foreground border border-transparent scale-95 opacity-50'
                                        )}
                                    >
                                        {stepMeta.icon} {stepMeta.label}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {submitError && (
                    <div className="px-4">
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-destructive/10 border border-destructive/30 rounded-2xl p-4 flex items-center gap-3"
                        >
                            <div className="text-destructive font-semibold">⚠ {submitError}</div>
                            <button onClick={() => setSubmitError(null)} className="ml-auto text-destructive hover:text-destructive/80">✕</button>
                        </motion.div>
                    </div>
                )}

                <div className="px-4">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={currentStep}
                            initial={{ opacity: 0, y: 10, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -10, scale: 0.98 }}
                            transition={{ duration: 0.2 }}
                            className="bg-card/50 backdrop-blur-xl border border-border/50 rounded-3xl p-5 md:p-8 shadow-sm"
                        >
                            {currentStep === 'photo' && <PhotoStep />}
                            {currentStep === 'observationType' && <ObservationTypeStep />}
                            {currentStep === 'damage' && <DamageStep />}
                            {currentStep === 'dateTimeLocation' && <DateTimeLocationStep />}
                            {currentStep === 'review' && <ReviewStep />}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>

            <div className="fixed bottom-0 left-0 right-0 z-50 p-4 md:p-6 pb-safe border-t border-border/50 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
                <div className="max-w-2xl mx-auto flex justify-between gap-4">
                    {currentStep === 'photo' && !formData.photo_url ? (
                        <>
                            <button
                                type="button"
                                onClick={goToPreviousStep}
                                disabled={currentStepIndex === 0}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-4 rounded-2xl border-2 border-border/50 bg-muted/30 text-sm font-bold text-foreground hover:bg-muted/60 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-30 disabled:pointer-events-none"
                            >
                                <ChevronLeft className="w-5 h-5" /> {t('back')}
                            </button>
                            <button
                                type="button"
                                onClick={handleBottomBarCapture}
                                disabled={loadingCamera || isSubmitting}
                                className="flex-[2] flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-primary text-primary-foreground text-sm font-bold shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                            >
                                <Camera className="w-5 h-5" />
                                {loadingCamera ? t('ps_opening_camera') : t('ps_take_photo')}
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={goToPreviousStep}
                                disabled={currentStepIndex === 0}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-4 rounded-2xl border-2 border-border/50 bg-muted/30 text-sm font-bold text-foreground hover:bg-muted/60 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-30 disabled:pointer-events-none"
                            >
                                <ChevronLeft className="w-5 h-5" /> {t('back')}
                            </button>

                            {isLastStep() ? (
                                <button
                                    type="button"
                                    onClick={handleSubmit}
                                    disabled={isSubmitting || !isStepValid(currentStep)}
                                    className="flex-[2] flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-emerald-500 text-white text-sm font-bold shadow-xl shadow-emerald-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none"
                                >
                                    <CheckCircle2 className="w-5 h-5" />
                                    {isSubmitting
                                        ? t('rs_saving')
                                        : (isOnline ? t('rs_submit') : t('rs_submit_offline'))}
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={goToNextStep}
                                    disabled={!isStepValid(currentStep)}
                                    className="flex-[2] flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-primary text-primary-foreground text-sm font-bold shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none"
                                >
                                    {t('continue_btn')} <ChevronLeft className="w-5 h-5 rotate-180" />
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export function ReportStepper() {
    return (
        <ActivityFormProvider>
            <StepperContent />
        </ActivityFormProvider>
    );
}
