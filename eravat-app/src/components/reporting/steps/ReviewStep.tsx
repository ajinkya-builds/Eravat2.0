import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useActivityForm } from '../../../contexts/ActivityFormContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { formatLatLngDms } from '../../../lib/geoFormat';
import { supabase } from '../../../supabase';

export function ReviewStep() {
    const { formData, elephantTotal } = useActivityForm();
    const { t } = useLanguage();
    const [names, setNames] = useState({ division: '—', range: '—', beat: '—' });

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            const [d, r, b] = await Promise.all([
                formData.division_id
                    ? supabase.from('geo_divisions').select('name').eq('id', formData.division_id).maybeSingle()
                    : Promise.resolve({ data: null }),
                formData.range_id
                    ? supabase.from('geo_ranges').select('name').eq('id', formData.range_id).maybeSingle()
                    : Promise.resolve({ data: null }),
                formData.beat_id
                    ? supabase.from('geo_beats').select('name').eq('id', formData.beat_id).maybeSingle()
                    : Promise.resolve({ data: null }),
            ]);
            if (cancelled) return;
            setNames({
                division: d.data?.name ?? '—',
                range: r.data?.name ?? '—',
                beat: b.data?.name ?? '—',
            });
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, [formData.division_id, formData.range_id, formData.beat_id]);

    const typeLabel =
        formData.observation_type === 'direct'
            ? t('ot_direct_sighting')
            : formData.observation_type === 'indirect'
              ? t('ot_indirect_sign')
              : '—';

    return (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-5">
            <div className="text-center space-y-1">
                <h3 className="font-semibold text-foreground">{t('rv_title')}</h3>
                <p className="text-xs text-muted-foreground">{t('rv_subtitle')}</p>
            </div>

            <div className="rounded-2xl border border-border bg-muted/20 divide-y divide-border text-sm">
                <Row label={t('dtl_date')} value={`${formData.activity_date} ${formData.activity_time}`} />
                <Row
                    label={t('dtl_dms_location')}
                    value={
                        formData.latitude != null && formData.longitude != null
                            ? formatLatLngDms(formData.latitude, formData.longitude)
                            : '—'
                    }
                />
                <Row
                    label={t('dtl_gps_location')}
                    value={
                        formData.latitude != null && formData.longitude != null
                            ? `${formData.latitude.toFixed(6)}, ${formData.longitude.toFixed(6)}`
                            : '—'
                    }
                />
                <Row
                    label={t('dtl_division')}
                    value={formData.division_id ? names.division : t('dtl_territory_on_sync_short')}
                />
                <Row
                    label={t('dtl_range')}
                    value={formData.range_id ? names.range : t('dtl_territory_on_sync_short')}
                />
                <Row
                    label={t('dtl_beat')}
                    value={formData.beat_id ? names.beat : t('dtl_territory_on_sync_short')}
                />
                <Row label={t('ot_type_of_observation')} value={typeLabel} />
                {formData.observation_type === 'indirect' && (
                    <Row label={t('ot_indirect_sign_type')} value={formData.indirect_sign_details.join(', ') || '—'} />
                )}
                <Row label={t('ot_total')} value={String(elephantTotal)} />
                {(formData.description || formData.notes) && (
                    <Row label={t('ot_description')} value={formData.description || formData.notes || ''} />
                )}
                {formData.report_damage_manually && (
                    <>
                        <Row label={t('ds_categories')} value={formData.loss_type.join(', ') || '—'} />
                        {formData.damage_description && (
                            <Row label={t('ds_desc_label')} value={formData.damage_description} />
                        )}
                    </>
                )}
                <Row
                    label={t('rs_compass')}
                    value={formData.compass_bearing != null ? `${Math.round(formData.compass_bearing)}°` : '—'}
                />
            </div>

            {formData.photo_url && (
                <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('rs_photo')}</p>
                    <img
                        src={formData.photo_url}
                        alt="Report evidence"
                        className="w-full max-h-48 object-cover rounded-2xl border border-border"
                    />
                </div>
            )}
        </motion.div>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between gap-4 px-4 py-3">
            <span className="text-muted-foreground shrink-0">{label}</span>
            <span className="text-foreground font-medium text-right break-words">{value}</span>
        </div>
    );
}
