import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, MapPin, FileText, Compass, Camera, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ActivityFormProvider, useActivityForm, type FormStep } from '../../contexts/ActivityFormContext';
import { DateTimeLocationStep } from './steps/DateTimeLocationStep';
import { ObservationTypeStep } from './steps/ObservationTypeStep';
import { CompassBearingStep } from './steps/CompassBearingStep';
import { PhotoStep } from './steps/PhotoStep';
import { db } from '../../db';
import { cn } from '../../lib/utils';
import { useAuth } from '../../contexts/AuthContext';

const STEPS: { type: FormStep; label: string; icon: ReactNode }[] = [
    { type: 'dateTimeLocation', label: 'Date & Location', icon: <MapPin className="w-4 h-4" /> },
    { type: 'observationType', label: 'Observation', icon: <FileText className="w-4 h-4" /> },
    { type: 'compassBearing', label: 'Compass', icon: <Compass className="w-4 h-4" /> },
    { type: 'photo', label: 'Photo', icon: <Camera className="w-4 h-4" /> },
];

function StepperContent() {
    const { formData, currentStep, currentStepIndex, goToNextStep, goToPreviousStep, isStepValid, isLastStep, resetForm } = useActivityForm();
    const { profile } = useAuth();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async () => {
        if (isSubmitting) return;
        setIsSubmitting(true);
        try {
            const reportId = crypto.randomUUID();

            // 1. Save flat report to Dexie
            await db.reports.add({
                id: reportId,
                user_id: profile?.id || null,
                ...formData,
                division_id: profile?.division_id || null,
                range_id: profile?.range_id || null,
                beat_id: profile?.beat_id || null,
                device_timestamp: new Date().toISOString(),
                sync_status: 'pending',
                status: 'submitted',
            });

            // 2. Save media if exists
            if (formData.photo_url) {
                const match = formData.photo_url.match(/^data:(image\/[a-zA-Z]*);base64,(.*)$/);
                if (match) {
                    await db.report_media.add({
                        id: crypto.randomUUID(),
                        report_id: reportId,
                        mime_type: match[1],
                        file_data: match[2],
                        sync_status: 'pending'
                    });
                }
            }

            setSubmitted(true);
            resetForm();
            setTimeout(() => navigate('/'), 2000);
        } catch (err) {
            console.error('Failed to save report:', err);
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
                    <h2 className="text-xl font-bold text-foreground mb-2">Report Saved!</h2>
                    <p className="text-muted-foreground text-sm">Stored locally. Will sync when online.</p>
                </div>
            </motion.div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Progress bar */}
            <div className="space-y-3">
                <div className="flex gap-2">
                    {STEPS.map((step, i) => (
                        <div
                            key={step.type}
                            className={cn(
                                'flex-1 h-1.5 rounded-full transition-colors',
                                i <= currentStepIndex ? 'bg-primary' : 'bg-muted'
                            )}
                        />
                    ))}
                </div>
                {/* Step tabs */}
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                    {STEPS.map((step, i) => (
                        <div
                            key={step.type}
                            className={cn(
                                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-all',
                                i === currentStepIndex
                                    ? 'bg-primary text-primary-foreground border-primary'
                                    : i < currentStepIndex
                                        ? 'bg-primary/10 text-primary border-primary/20'
                                        : 'bg-muted text-muted-foreground border-transparent'
                            )}
                        >
                            {step.icon} {step.label}
                        </div>
                    ))}
                </div>
                <p className="text-xs text-muted-foreground">Step {currentStepIndex + 1} of {STEPS.length}</p>
            </div>

            {/* Current Step */}
            <AnimatePresence mode="wait">
                <motion.div key={currentStep}>
                    {currentStep === 'dateTimeLocation' && <DateTimeLocationStep />}
                    {currentStep === 'observationType' && <ObservationTypeStep />}
                    {currentStep === 'compassBearing' && <CompassBearingStep />}
                    {currentStep === 'photo' && <PhotoStep />}
                </motion.div>
            </AnimatePresence>

            {/* Navigation */}
            <div className="flex justify-between pt-4 border-t border-border">
                <button
                    type="button"
                    onClick={goToPreviousStep}
                    disabled={currentStepIndex === 0}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-40"
                >
                    <ChevronLeft className="w-4 h-4" /> Back
                </button>

                {isLastStep() ? (
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                        <CheckCircle2 className="w-4 h-4" />
                        {isSubmitting ? 'Saving...' : 'Submit Offline'}
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={goToNextStep}
                        disabled={!isStepValid(currentStep)}
                        className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                        Continue →
                    </button>
                )}
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
