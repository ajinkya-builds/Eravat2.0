import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Clock, MapPin, RefreshCw, Loader2 } from 'lucide-react';
import { useActivityForm } from '../../../contexts/ActivityFormContext';
import { useGeolocation } from '../../../hooks/useGeolocation';
import { useLanguage } from '../../../contexts/LanguageContext';

export function DateTimeLocationStep() {
    const { formData, updateFormData } = useActivityForm();
    const { fetchLocation, loading: gpsLoading, error: gpsError } = useGeolocation();
    const { t } = useLanguage();

    const handleAutofill = async () => {
        // Set current date and time
        const now = new Date();
        const date = now.toISOString().split('T')[0];
        const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

        // Only override if they are empty
        if (!formData.activity_date) updateFormData({ activity_date: date });
        if (!formData.activity_time) updateFormData({ activity_time: time });

        // Get GPS only if not already filled
        if (formData.latitude == null || formData.longitude == null) {
            const pos = await fetchLocation();
            if (pos) {
                updateFormData({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
            }
        }
    };

    // Auto-trigger on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (formData.latitude == null || !formData.activity_date) {
            handleAutofill();
        }
    }, []);

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
        >
            <div className="flex justify-end">
                <button
                    type="button"
                    onClick={handleAutofill}
                    disabled={gpsLoading}
                    className="w-full flex items-center justify-center gap-2 px-6 py-4 text-sm font-semibold glass-card border-primary/20 bg-primary/5 rounded-2xl hover:bg-primary/10 text-primary disabled:opacity-50 transition-colors shadow-sm"
                >
                    {gpsLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                    {t('dtl_get_location')}
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Date */}
                <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        {t('dtl_date')} <span className="text-destructive">*</span>
                    </label>
                    <input
                        type="date"
                        value={formData.activity_date}
                        onChange={e => updateFormData({ activity_date: e.target.value })}
                        className="w-full px-4 py-3.5 rounded-2xl bg-muted/30 border-2 border-border/50 text-base font-medium focus:outline-none focus:ring-4 focus:ring-primary/20 focus:border-primary transition-all"
                        required
                    />
                </div>

                {/* Time */}
                <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        {t('dtl_time')} <span className="text-destructive">*</span>
                    </label>
                    <input
                        type="time"
                        value={formData.activity_time}
                        onChange={e => updateFormData({ activity_time: e.target.value })}
                        className="w-full px-4 py-3.5 rounded-2xl bg-muted/30 border-2 border-border/50 text-base font-medium focus:outline-none focus:ring-4 focus:ring-primary/20 focus:border-primary transition-all"
                        required
                    />
                </div>
            </div>

            {/* Location */}
            <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    {t('dtl_gps_location')} <span className="text-destructive">*</span>
                </label>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs text-muted-foreground mb-1 block">{t('dtl_latitude')}</label>
                        <input
                            type="number"
                            step="any"
                            min={-90}
                            max={90}
                            placeholder={`${t('report.eg')} 11.4589`}
                            value={formData.latitude ?? ''}
                            onChange={e => updateFormData({ latitude: e.target.value === '' ? null : parseFloat(e.target.value) })}
                            className="w-full px-3 py-2 rounded-xl bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-muted-foreground mb-1 block">{t('dtl_longitude')}</label>
                        <input
                            type="number"
                            step="any"
                            min={-180}
                            max={180}
                            placeholder={`${t('report.eg')} 76.5491`}
                            value={formData.longitude ?? ''}
                            onChange={e => updateFormData({ longitude: e.target.value === '' ? null : parseFloat(e.target.value) })}
                            className="w-full px-3 py-2 rounded-xl bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                    </div>
                </div>
                {gpsError && (
                    <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                        ⚠ {gpsError}
                    </p>
                )}
                {formData.latitude != null && formData.longitude != null && (
                    <p className="text-xs text-emerald-600 mt-1">
                        ✓ {t('dtl_location_acquired')}: {formData.latitude.toFixed(6)}, {formData.longitude.toFixed(6)}
                    </p>
                )}
            </div>
        </motion.div>
    );
}
