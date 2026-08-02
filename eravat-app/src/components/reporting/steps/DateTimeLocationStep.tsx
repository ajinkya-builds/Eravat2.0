import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, MapPin, RefreshCw, Loader2 } from 'lucide-react';
import { useActivityForm } from '../../../contexts/ActivityFormContext';
import { useGeolocation } from '../../../hooks/useGeolocation';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../supabase';
import { formatLatLngDms } from '../../../lib/geoFormat';

type GeoOption = { id: string; name: string };

export function DateTimeLocationStep() {
    const { formData, updateFormData } = useActivityForm();
    const { fetchLocation, loading: gpsLoading, error: gpsError } = useGeolocation();
    const { t } = useLanguage();
    const { profile } = useAuth();

    const [divisions, setDivisions] = useState<GeoOption[]>([]);
    const [ranges, setRanges] = useState<GeoOption[]>([]);
    const [beats, setBeats] = useState<GeoOption[]>([]);
    const [geoLoading, setGeoLoading] = useState(false);

    const applyNow = () => {
        const now = new Date();
        const date = now.toISOString().split('T')[0];
        const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        updateFormData({ activity_date: date, activity_time: time });
        return { date, time };
    };

    const handleAutofill = async () => {
        applyNow();
        const pos = await fetchLocation();
        if (pos) {
            updateFormData({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        }
    };

    // Seed territory from profile once
    useEffect(() => {
        if (!profile) return;
        updateFormData({
            division_id: formData.division_id ?? profile.division_id ?? null,
            range_id: formData.range_id ?? profile.range_id ?? null,
            beat_id: formData.beat_id ?? profile.beat_id ?? null,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profile?.id]);

    // Auto-capture date/time + GPS on mount
    useEffect(() => {
        void handleAutofill();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Load divisions
    useEffect(() => {
        let cancelled = false;
        setGeoLoading(true);
        void (async () => {
            const { data } = await supabase.from('geo_divisions').select('id, name').order('name');
            if (!cancelled) setDivisions((data as GeoOption[]) || []);
            if (!cancelled) setGeoLoading(false);
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    // Load ranges for selected division
    useEffect(() => {
        if (!formData.division_id) {
            setRanges([]);
            return;
        }
        let cancelled = false;
        supabase
            .from('geo_ranges')
            .select('id, name')
            .eq('division_id', formData.division_id)
            .order('name')
            .then(({ data }) => {
                if (!cancelled) setRanges((data as GeoOption[]) || []);
            });
        return () => {
            cancelled = true;
        };
    }, [formData.division_id]);

    // Load beats for selected range
    useEffect(() => {
        if (!formData.range_id) {
            setBeats([]);
            return;
        }
        let cancelled = false;
        supabase
            .from('geo_beats')
            .select('id, name')
            .eq('range_id', formData.range_id)
            .order('name')
            .then(({ data }) => {
                if (!cancelled) setBeats((data as GeoOption[]) || []);
            });
        return () => {
            cancelled = true;
        };
    }, [formData.range_id]);

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

            {/* DMS (read-only) */}
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

            {/* Decimal (editable) */}
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
                        ✓ {t('dtl_location_acquired')} {formData.latitude.toFixed(6)}, {formData.longitude.toFixed(6)}
                    </p>
                )}
            </div>

            {/* Territory confirm / edit */}
            <div className="space-y-3 rounded-2xl border border-border bg-muted/10 p-4">
                <h4 className="text-sm font-semibold text-foreground">{t('dtl_confirm_territory')} <span className="text-destructive">*</span></h4>
                <p className="text-xs text-muted-foreground">{t('dtl_confirm_territory_hint')}</p>

                <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">{t('dtl_division')}</label>
                    <select
                        value={formData.division_id ?? ''}
                        disabled={geoLoading}
                        onChange={(e) =>
                            updateFormData({
                                division_id: e.target.value || null,
                                range_id: null,
                                beat_id: null,
                            })
                        }
                        className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm"
                    >
                        <option value="">{t('dtl_select')}</option>
                        {divisions.map((d) => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                    </select>
                </div>

                <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">{t('dtl_range')}</label>
                    <select
                        value={formData.range_id ?? ''}
                        disabled={!formData.division_id}
                        onChange={(e) =>
                            updateFormData({
                                range_id: e.target.value || null,
                                beat_id: null,
                            })
                        }
                        className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm"
                    >
                        <option value="">{t('dtl_select')}</option>
                        {ranges.map((r) => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                    </select>
                </div>

                <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">{t('dtl_beat')}</label>
                    <select
                        value={formData.beat_id ?? ''}
                        disabled={!formData.range_id}
                        onChange={(e) => updateFormData({ beat_id: e.target.value || null })}
                        className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm"
                    >
                        <option value="">{t('dtl_select')}</option>
                        {beats.map((b) => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                    </select>
                </div>
            </div>
        </motion.div>
    );
}
