import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, LogOut } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

interface UnsavedChangesModalProps {
    isOpen: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

export function UnsavedChangesModal({ isOpen, onConfirm, onCancel }: UnsavedChangesModalProps) {
    const { language } = useLanguage();

    const getLocalizedText = () => {
        const text: Record<string, {
            title: string;
            description: string;
            confirmLabel: string;
            cancelLabel: string;
        }> = {
            en: {
                title: 'Unsaved Changes',
                description: 'You have filled in details in this report. Exiting now will discard all changes permanently. Are you sure you want to exit?',
                confirmLabel: 'Discard & Exit',
                cancelLabel: 'Keep Editing',
            },
            hi: {
                title: 'असुरक्षित परिवर्तन',
                description: 'आपने इस रिपोर्ट में कुछ जानकारी भरी है। अभी बाहर निकलने से आपके सभी परिवर्तन स्थायी रूप से मिट जाएंगे। क्या आप सचमुच बाहर निकलना चाहते हैं?',
                confirmLabel: 'मिटाएं और बाहर निकलें',
                cancelLabel: 'संपादन जारी रखें',
            },
            mr: {
                title: 'असुरक्षित बदल',
                description: 'तुम्ही या अहवालात माहिती भरली आहे. आता बाहेर पडल्यास सर्व बदल कायमचे नष्ट होतील. तुम्हाला खात्री आहे की तुम्हाला बाहेर पडायचे आहे?',
                confirmLabel: 'बदल नाकारा आणि बाहेर पडा',
                cancelLabel: 'संपादन सुरू ठेवा',
            }
        };
        const lang = (language || 'en').split('-')[0];
        return text[lang] || text.en;
    };

    const strings = getLocalizedText();

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/40 backdrop-blur-md">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onCancel}
                        className="absolute inset-0"
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ scale: 0.9, y: 20, opacity: 0 }}
                        animate={{ scale: 1, y: 0, opacity: 1 }}
                        exit={{ scale: 0.9, y: 20, opacity: 0 }}
                        transition={{ type: "spring", duration: 0.4 }}
                        className="relative w-full max-w-sm glass rounded-3xl p-6 shadow-2xl border border-border/80 flex flex-col items-center gap-4 bg-card"
                    >
                        <div className="w-14 h-14 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center">
                            <AlertTriangle className="w-7 h-7" />
                        </div>

                        <div className="text-center space-y-1">
                            <h2 className="text-xl font-bold text-foreground">{strings.title}</h2>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                {strings.description}
                            </p>
                        </div>

                        <div className="w-full flex flex-col gap-2 mt-2">
                            <button
                                type="button"
                                onClick={onConfirm}
                                className="w-full py-3.5 rounded-2xl bg-destructive text-destructive-foreground font-bold text-sm shadow-lg shadow-destructive/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                            >
                                <LogOut className="w-4 h-4" />
                                {strings.confirmLabel}
                            </button>
                            <button
                                type="button"
                                onClick={onCancel}
                                className="w-full py-3.5 rounded-2xl border-2 border-border/60 bg-muted/20 text-foreground font-bold text-sm hover:bg-muted/40 hover:scale-[1.02] active:scale-[0.98] transition-all"
                            >
                                {strings.cancelLabel}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
