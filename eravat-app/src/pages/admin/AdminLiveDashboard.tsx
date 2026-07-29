import { useMemo, useState } from 'react';
import { format, subDays } from 'date-fns';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAdminFilters } from '../../hooks/useAdminFilters';
import {
    AdminPageHeader,
    AdminFilterBar,
    AdminKpiCard,
    AdminDeferredNotice,
    AdminDataTable,
} from '../../components/admin/AdminShared';
import { MapComponent } from '../../components/shared/MapComponent';
import { countDamages, normalizeObsType, elephantTotal } from '../../services/adminAnalyticsService';

const WINDOWS = [1, 3, 7, 30, 60, 90, 180] as const;

export default function AdminLiveDashboard() {
    const { t } = useLanguage();
    const [windowDays, setWindowDays] = useState<number>(30);
    const { divisions, filters, setFilters, reports, loading, error, reload } = useAdminFilters(windowDays);

    const scopedReports = useMemo(() => {
        const since = subDays(new Date(), windowDays);
        return reports.filter((r) => new Date(r.device_timestamp) >= since);
    }, [reports, windowDays]);

    const damages = useMemo(() => countDamages(scopedReports), [scopedReports]);
    const warnings = scopedReports.length;
    const recipients = useMemo(() => new Set(scopedReports.map((r) => r.user_id).filter(Boolean)).size, [scopedReports]);

    const tableRows = scopedReports.slice(0, 12).map((r) => {
        const obs = r.observations?.[0];
        const type = normalizeObsType(obs?.type, Boolean(r.conflict_damages?.length));
        return {
            time: format(new Date(r.device_timestamp), 'MMM d, HH:mm'),
            division: r.geo_beats?.geo_ranges?.geo_divisions?.name ?? '—',
            beat: r.geo_beats?.name ?? '—',
            type: type === 'loss' ? t('admin.live.conflict') : type === 'indirect' ? t('admin.live.indirect') : t('admin.live.direct'),
            elephants: type === 'direct' ? String(elephantTotal(obs)) : '—',
        };
    });

    return (
        <div className="space-y-6">
            <AdminPageHeader title={t('admin.nav.live')} subtitle={t('admin.live.subtitle')} />

            <div className="flex flex-wrap gap-2">
                {WINDOWS.map((days) => (
                    <button
                        key={days}
                        type="button"
                        onClick={() => {
                            setWindowDays(days);
                            setFilters({ ...filters, startDate: subDays(new Date(), days), endDate: new Date() });
                        }}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                            windowDays === days
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-muted text-muted-foreground border-border'
                        }`}
                    >
                        {days === 1 ? t('admin.live.today') : `${days} ${t('admin.live.dayWindow')}`}
                    </button>
                ))}
            </div>

            <AdminFilterBar divisions={divisions} filters={filters} onChange={setFilters} onApply={reload} loading={loading} />
            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <AdminKpiCard title={t('admin.live.warnings')} value={warnings} />
                <AdminKpiCard title={t('admin.live.recipients')} value={recipients} />
                <AdminKpiCard title={t('admin.conflict.cropDamage')} value={damages.crop} />
                <AdminKpiCard title={t('admin.conflict.houseDamage')} value={damages.property} />
                <AdminKpiCard title={t('admin.conflict.humanInjury')} value={damages.human_injury} tone="warning" />
                <AdminKpiCard title={t('admin.conflict.humanDeath')} value={damages.human_death} tone="danger" />
            </div>

            <div className="glass-card rounded-2xl p-4">
                <MapComponent showObservationPins />
            </div>

            <AdminDataTable
                columns={[
                    { key: 'time', label: t('admin.live.reportedAt') },
                    { key: 'division', label: t('admin.filters.division') },
                    { key: 'beat', label: t('admin.live.beat') },
                    { key: 'type', label: t('admin.live.type') },
                    { key: 'elephants', label: t('admin.live.elephants') },
                ]}
                rows={tableRows}
                emptyMessage={t('admin.live.noSightings')}
            />

            <AdminDeferredNotice title={t('admin.deferred.affectedVillagers')} reason={t('admin.deferred.affectedVillagersReason')} />
        </div>
    );
}
