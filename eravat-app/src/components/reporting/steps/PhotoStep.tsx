import { motion } from 'framer-motion';
import { X, RefreshCw, ImageIcon, Camera, Loader2, MapPin } from 'lucide-react';
import { useActivityForm } from '../../../contexts/ActivityFormContext';
import { useCamera } from '../../../hooks/useCamera';
import { useLanguage } from '../../../contexts/LanguageContext';
import { stampPhotoWithMeta } from '../../../lib/stampPhoto';

/** 8×8 PNG so Playwright can skip the device camera. */
const E2E_PHOTO =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFElEQVR42mP8z8BQz0AEYBxVSF+FAP5IDva59Tn2AAAAAElFTkSuQmCC';

export function PhotoStep() {
    const { formData, updateFormData, gpsLoading, gpsError } = useActivityForm();
    const { takePhoto, pickFromGallery, isCapturing: loading, error } = useCamera();
    const { t } = useLanguage();
    const isE2E =
        typeof navigator !== 'undefined' &&
        (Boolean(navigator.webdriver) || import.meta.env.VITE_APP_ENV === 'staging');

    const handleCapture = async (source: 'camera' | 'gallery') => {
        const result = await (source === 'camera' ? takePhoto() : pickFromGallery());
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
                            onClick={() => handleCapture('camera')}
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
                <div className="space-y-3">
                    {/* Primary: Take Photo with camera */}
                    <button
                        type="button"
                        onClick={() => handleCapture('camera')}
                        disabled={loading}
                        className="w-full glass-card rounded-3xl p-8 flex flex-col items-center gap-4 border-2 border-primary/40 bg-primary/8 hover:bg-primary/15 transition-all duration-300 active:scale-[0.98] cursor-pointer"
                    >
                        <div className="p-4 rounded-full bg-primary/10 shadow-sm border border-primary/20">
                            <Camera className="w-10 h-10 text-primary" />
                        </div>
                        <div className="text-center space-y-1 w-full">
                            <p className="text-lg font-bold text-foreground text-center">{t('ps_take_photo')}</p>
                            <p className="text-sm text-muted-foreground text-center">{t('ps_take_photo_hint')}</p>
                        </div>
                    </button>

                    {/* Secondary: Attach from gallery */}
                    <button
                        type="button"
                        onClick={() => handleCapture('gallery')}
                        disabled={loading}
                        className="w-full rounded-2xl p-4 flex items-center gap-4 border border-border bg-muted/30 hover:bg-muted/50 transition-all duration-200 active:scale-[0.98] cursor-pointer"
                    >
                        <div className="p-2.5 rounded-xl bg-background shadow-sm border border-border/50 shrink-0">
                            <ImageIcon className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div className="text-left">
                            <p className="text-sm font-semibold text-foreground">{t('ps_attach_photo')}</p>
                            <p className="text-xs text-muted-foreground">{t('ps_from_gallery')}</p>
                        </div>
                    </button>

                    {loading && (
                        <p className="text-sm text-primary font-semibold text-center w-full animate-pulse">
                            {t('ps_opening_gallery')}
                        </p>
                    )}
                    {error && <p className="text-sm font-medium text-destructive mt-2 bg-destructive/10 px-4 py-2 rounded-lg text-center w-full">⚠ {error}</p>}
                </div>
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
