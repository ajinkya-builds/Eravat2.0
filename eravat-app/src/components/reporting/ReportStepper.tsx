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
                male_count: formData.male_count || 0,
                female_count: formData.female_count || 0,
                calf_count: formData.calf_count || 0,
                unknown_count: formData.unknown_count || 0,
                indirect_sign_details: formData.indirect_sign_details || null,
                loss_type: formData.loss_type || null,
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
        <div className="flex flex-col min-h-[calc(100vh-4rem)] max-w-2xl mx-auto w-full relative">

            {/* Main Content Area */}
            <div className="flex-1 space-y-6 pb-28">
                {/* Progress Header */}
                <div className="space-y-4 px-2">
                    {/* Animated Progress Bar */}
                    <div className="flex gap-2">
                        {STEPS.map((step, i) => (
                            <div key={step.type} className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
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

                    {/* Step Tabs Horizontal Scroll */}
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 mask-linear-fade">
                        {STEPS.map((step, i) => (
                            <div
                                key={step.type}
                                className={cn(
                                    'flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-300',
                                    i === currentStepIndex
                                        ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20 scale-100'
                                        : i < currentStepIndex
                                            ? 'bg-primary/10 text-primary border border-primary/20 scale-95 opacity-80'
                                            : 'bg-muted text-muted-foreground border border-transparent scale-95 opacity-50'
                                )}
                            >
                                {step.icon} {step.label}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Current Step Content */}
                <div className="px-2">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={currentStep}
                            initial={{ opacity: 0, y: 10, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -10, scale: 0.98 }}
                            transition={{ duration: 0.2 }}
                            className="bg-card/50 backdrop-blur-xl border border-border/50 rounded-3xl p-5 md:p-8 shadow-sm"
                        >
                            {currentStep === 'dateTimeLocation' && <DateTimeLocationStep />}
                            {currentStep === 'observationType' && <ObservationTypeStep />}
                            {currentStep === 'compassBearing' && <CompassBearingStep />}
                            {currentStep === 'photo' && <PhotoStep />}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>

            {/* Sticky Bottom Navigation Bar */}
            <div className="fixed bottom-0 left-0 right-0 z-50 p-4 md:p-6 pb-safe border-t border-border/50 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
                <div className="max-w-2xl mx-auto flex justify-between gap-4">
                    <button
                        type="button"
                        onClick={goToPreviousStep}
                        disabled={currentStepIndex === 0}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-4 rounded-2xl border-2 border-border/50 bg-muted/30 text-sm font-bold text-foreground hover:bg-muted/60 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-30 disabled:pointer-events-none"
                    >
                        <ChevronLeft className="w-5 h-5" /> Back
                    </button>

                    {isLastStep() ? (
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={isSubmitting}
                            className="flex-[2] flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-emerald-500 text-white text-sm font-bold shadow-xl shadow-emerald-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none"
                        >
                            <CheckCircle2 className="w-5 h-5" />
                            {isSubmitting ? 'Saving...' : 'Submit Offline'}
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={goToNextStep}
                            disabled={!isStepValid(currentStep)}
                            className="flex-[2] flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-primary text-primary-foreground text-sm font-bold shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none"
                        >
                            Continue <ChevronLeft className="w-5 h-5 rotate-180" />
                        </button>
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
