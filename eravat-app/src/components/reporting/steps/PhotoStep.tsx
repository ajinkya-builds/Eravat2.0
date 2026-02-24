import { motion } from 'framer-motion';
import { Camera, X, RefreshCw, ImageIcon } from 'lucide-react';
import { useActivityForm } from '../../../contexts/ActivityFormContext';
import { useCamera } from '../../../hooks/useCamera';
import { useLanguage } from '../../../contexts/LanguageContext';

export function PhotoStep() {
    const { formData, updateFormData } = useActivityForm();
    const { takePhoto, isCapturing: loading, error } = useCamera();
    const { t } = useLanguage();

    const handleCapture = async () => {
        const result = await takePhoto();
        if (result) {
            updateFormData({ photo_url: result.dataUrl });
        }
    };

    const handleClear = () => updateFormData({ photo_url: null });

    return (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
            <div className="text-center space-y-2">
                <h3 className="font-semibold text-foreground">{t('ps_photo_evidence')}</h3>
                <p className="text-xs text-muted-foreground">{t('ps_optional_photo')}</p>
            </div>

            {formData.photo_url ? (
                <div className="relative">
                    <img
                        src={formData.photo_url}
                        alt="Captured evidence"
                        className="w-full rounded-2xl object-cover max-h-80 border border-border"
                    />
                    <div className="absolute top-2 right-2 flex gap-2">
                        <button
                            type="button"
                            onClick={handleCapture}
                            disabled={loading}
                            className="p-2 rounded-xl bg-black/50 text-white hover:bg-black/70 transition-colors"
                        >
                            <RefreshCw className="w-4 h-4" />
                        </button>
                        <button
                            type="button"
                            onClick={handleClear}
                            className="p-2 rounded-xl bg-black/50 text-white hover:bg-destructive transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <p className="text-xs text-emerald-600 mt-2 text-center">{t('ps_photo_captured')}</p>
                </div>
            ) : (
                <div className="glass-card rounded-3xl p-10 flex flex-col items-center gap-6 border-2 border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors">
                    <div className="p-5 rounded-full bg-background shadow-sm border border-border/50">
                        <ImageIcon className="w-12 h-12 text-primary" />
                    </div>
                    <div className="text-center space-y-1">
                        <p className="text-lg font-bold text-foreground">{t('ps_attach_photo')}</p>
                        <p className="text-sm text-muted-foreground max-w-[250px]">
                            {t('ps_photo_desc')}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={handleCapture}
                        disabled={loading}
                        className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-primary text-primary-foreground font-semibold text-base hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg shadow-primary/20"
                    >
                        <Camera className="w-5 h-5" />
                        {loading ? t('ps_opening_camera') : t('ps_take_photo')}
                    </button>
                    {error && <p className="text-sm font-medium text-destructive mt-2 bg-destructive/10 px-4 py-2 rounded-lg">⚠ {error}</p>}
                </div>
            )}
        </motion.div>
    );
}
