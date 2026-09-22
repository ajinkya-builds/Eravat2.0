import { AnimatePresence, motion } from 'framer-motion';
import { MapPin, RefreshCw, Signal } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import type { AcquiredPosition } from '../../lib/deviceLocation';

interface CellLocationConfirmProps {
    position: AcquiredPosition | null;
    onAccept: () => void;
    onRetryGps: () => void;
}

export function CellLocationConfirm({ position, onAccept, onRetryGps }: CellLocationConfirmProps) {
    const { t } = useLanguage();
    const accuracyM = position?.coords.accuracy != null ? Math.round(position.coords.accuracy) : null;

    return (
        <AnimatePresence>
            {position && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/40 backdrop-blur-md">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0"
                    />

                    <motion.div
                        initial={{ scale: 0.9, y: 20, opacity: 0 }}
                        animate={{ scale: 1, y: 0, opacity: 1 }}
                        exit={{ scale: 0.9, y: 20, opacity: 0 }}
                        transition={{ type: 'spring', duration: 0.4 }}
                        className="relative w-full max-w-sm glass rounded-3xl p-6 shadow-2xl border border-border/80 flex flex-col items-center gap-4 bg-card"
                    >
                        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-700 flex items-center justify-center">
                            <Signal className="w-7 h-7" />
                        </div>

                        <div className="text-center space-y-1">
                            <h2 className="text-xl font-bold text-foreground">{t('cell_fix_title')}</h2>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                {t('cell_fix_body')}
                            </p>
                            {accuracyM != null && accuracyM > 0 && (
                                <p className="text-xs text-muted-foreground pt-1">
                                    {t('cell_fix_accuracy', { meters: accuracyM })}
                                </p>
                            )}
                        </div>

                        <div className="w-full flex flex-col gap-2 mt-2">
                            <button
                                type="button"
                                onClick={onRetryGps}
                                className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold text-sm shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                            >
                                <RefreshCw className="w-4 h-4" />
                                {t('cell_fix_retry')}
                            </button>
                            <button
                                type="button"
                                onClick={onAccept}
                                className="w-full py-3.5 rounded-2xl border-2 border-border/60 bg-muted/20 text-foreground font-bold text-sm hover:bg-muted/40 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                            >
                                <MapPin className="w-4 h-4" />
                                {t('cell_fix_use')}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
