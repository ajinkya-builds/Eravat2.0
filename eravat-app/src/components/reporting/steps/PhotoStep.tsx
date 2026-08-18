import { motion } from 'framer-motion';
import { X, RefreshCw, ImageIcon, Loader2, MapPin } from 'lucide-react';
import { useActivityForm } from '../../../contexts/ActivityFormContext';
import { useCamera } from '../../../hooks/useCamera';
import { useLanguage } from '../../../contexts/LanguageContext';
import { stampPhotoWithMeta } from '../../../lib/stampPhoto';

/** 8×8 PNG so Playwright can skip the device camera. */
const E2E_PHOTO =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFElEQVR42mP8z8BQz0AEYBxVSF+FAP5IDva59Tn2AAAAAElFTkSuQmCC';

export function PhotoStep() {
    const { formData, updateFormData, gpsLoading, gpsError } = useActivityForm();
    const { pickFromGallery, isCapturing: loading, error } = useCamera();
    const { t } = useLanguage();
    const isE2E = typeof navigator !== 'undefined' && Boolean(navigator.webdriver);

    const handleCapture = async () => {
        const result = await pickFromGallery();
        if (!result) return;
        const stamped = await stampPhotoWithMeta(result.dataUrl, {
            latitude: formData.latitude,
            longitude: formData.longitude,
            activityDate: formData.activity_date,
            activityTime: formData.activity_time,
        });
        updateFormData({ photo_url: stamped });
    };

    const handleClear = () => updateFormData({ photo_url: null });

    const gpsReady = formData.latitude != null && formData.longitude != null && Boolean(formData.activity_date);

    return (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
            <div className="text-center space-y-2">
                <h3 className="font-semibold text-foreground">{t('ps_photo_evidence')} <span className="text-destructive">*</span></h3>
                <p className="text-xs text-muted-foreground">{t('ps_required_photo')}</p>
            </div>

            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                {gpsLoading ? (
                    <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                        {t('ps_location_prefetching')}
                    </>
                ) : gpsReady ? (
                    <>
                        <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700">{t('ps_location_ready')}</span>
                    </>
                ) : (
                    <>
                        <MapPin className="w-3.5 h-3.5" />
                        {gpsError ? t('ps_location_failed') : t('ps_location_prefetching')}
                    </>
                )}
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
                            disabled={loading}
                            className="p-2 rounded-xl bg-black/50 text-white hover:bg-destructive transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <p className="text-xs text-emerald-600 mt-2 text-center font-semibold">{t('ps_photo_captured')}</p>
                    <p className="text-xs text-muted-foreground mt-1 text-center">{t('ps_stamp_note')}</p>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={handleCapture}
                    disabled={loading}
                    className="w-full glass-card rounded-3xl p-10 flex flex-col items-center gap-6 border-2 border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 transition-all duration-300 active:scale-[0.98] cursor-pointer text-left"
                >
                    <div className="p-5 rounded-full bg-background shadow-sm border border-border/50">
                        <ImageIcon className="w-12 h-12 text-primary" />
                    </div>
                    <div className="text-center space-y-1 w-full">
                        <p className="text-lg font-bold text-foreground text-center">{t('ps_attach_photo')}</p>
                        <p className="text-sm text-muted-foreground max-w-[250px] mx-auto text-center">
                            {t('ps_from_gallery')}
                        </p>
                    </div>
                    {loading && (
                        <p className="text-sm text-primary font-semibold text-center w-full animate-pulse">
                            {t('ps_opening_gallery')}
                        </p>
                    )}
                    {error && <p className="text-sm font-medium text-destructive mt-2 bg-destructive/10 px-4 py-2 rounded-lg text-center w-full">⚠ {error}</p>}
                </button>
            )}

            {isE2E && !formData.photo_url && (
                <button
                    type="button"
                    data-testid="e2e-inject-photo"
                    onClick={() => updateFormData({ photo_url: E2E_PHOTO })}
                    className="w-full text-xs text-muted-foreground underline"
                >
                    Use test photo
                </button>
            )}
        </motion.div>
    );
}
