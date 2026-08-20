import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Clock, MapPin, RefreshCw, Loader2 } from 'lucide-react';
import { useActivityForm } from '../../../contexts/ActivityFormContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useAuth } from '../../../contexts/AuthContext';
import { formatLatLngDms } from '../../../lib/geoFormat';
import { TerritorySelect } from '../../shared/TerritorySelect';

export function DateTimeLocationStep() {
    const { formData, updateFormData, gpsLoading, gpsError, refreshLocation } = useActivityForm();
    const { t } = useLanguage();
    const { profile } = useAuth();

    const handleAutofill = async () => {
        await refreshLocation('retry');
    };

    // GPS lookup fills Division/Range/Beat. Only fall back to the user's assigned
    // territory when there is still no GPS match.
    useEffect(() => {
        if (!profile) return;
        if (formData.latitude != null && formData.longitude != null) return;
        if (formData.division_id || formData.range_id || formData.beat_id) return;
        updateFormData({
            division_id: profile.division_id ?? null,
            range_id: profile.range_id ?? null,
            beat_id: profile.beat_id ?? null,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profile?.id, formData.latitude, formData.longitude]);

    const locationBlocked = Boolean(gpsError) && formData.latitude == null;

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

            {locationBlocked && (
                <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                    {t('dtl_location_required')}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        {t('dtl_date')} <span className="text-destructive">*</span>
                    </label>
                    <div className="w-full px-4 py-3.5 rounded-2xl bg-muted/50 border-2 border-border/50 text-base font-medium text-foreground">
                        {formData.activity_date || '—'}
                    </div>
                    <p className="text-xs text-muted-foreground">{t('dtl_auto_locked')}</p>
                </div>

                <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        {t('dtl_time')} <span className="text-destructive">*</span>
                    </label>
                    <div className="w-full px-4 py-3.5 rounded-2xl bg-muted/50 border-2 border-border/50 text-base font-medium text-foreground">
                        {formData.activity_time || '—'}
                    </div>
                    <p className="text-xs text-muted-foreground">{t('dtl_auto_locked')}</p>
                </div>
            </div>

            <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    {t('dtl_dms_location')}
                </label>
                <div className="w-full px-4 py-3 rounded-2xl bg-muted/40 border border-border text-sm font-mono">
                    {formData.latitude != null && formData.longitude != null
                        ? formatLatLngDms(formData.latitude, formData.longitude)
                        : '—'}
                </div>
            </div>

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
                        ⚠ {gpsError === 'LOCATION_PERMISSION_DENIED'
                            ? t('geo_err_denied')
                            : gpsError === 'LOCATION_UNAVAILABLE'
                              ? t('geo_err_unavailable')
                              : gpsError === 'LOCATION_TIMEOUT'
                                ? t('geo_err_timeout')
                                : gpsError === 'LOCATION_UNSUPPORTED'
                                  ? t('geo_err_unsupported')
                                  : t('geo_err_failed')}
                    </p>
                )}
                {formData.latitude != null && formData.longitude != null && (
                    <p className="text-xs text-emerald-600 mt-1">
                        ✓ {t('dtl_location_acquired')} {formData.latitude.toFixed(6)}, {formData.longitude.toFixed(6)}
                    </p>
                )}
            </div>

            <TerritorySelect
                value={{
                    division_id: formData.division_id,
                    range_id: formData.range_id,
                    beat_id: formData.beat_id,
                }}
                latitude={formData.latitude}
                longitude={formData.longitude}
                includeBeat
                required={false}
                onChange={(next) => updateFormData(next)}
            />
        </motion.div>
    );
}
