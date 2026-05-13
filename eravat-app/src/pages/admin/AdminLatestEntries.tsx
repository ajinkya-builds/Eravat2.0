import { useMemo } from 'react';
import { format, differenceInHours } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAdminFilters } from '../../hooks/useAdminFilters';
import { AdminPageHeader, AdminDataTable } from '../../components/admin/AdminShared';
import { latestEntryPerDivision } from '../../services/adminAnalyticsService';

function freshnessClass(iso: string): string {
    const hours = differenceInHours(new Date(), new Date(iso));
    if (hours <= 24) return 'bg-emerald-500/15 text-emerald-700';
    if (hours <= 72) return 'bg-amber-500/15 text-amber-700';
    return 'bg-destructive/15 text-destructive';
}

export default function AdminLatestEntries() {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const { reports, loading } = useAdminFilters(90);

    const entries = useMemo(() => latestEntryPerDivision(reports), [reports]);

    const rows = entries.map((entry) => ({
        division: entry.divisionName,
        reportedAt: (
            <span className={`inline-flex px-2 py-1 rounded-lg text-xs font-semibold ${freshnessClass(entry.deviceTimestamp)}`}>
                {format(new Date(entry.deviceTimestamp), 'MMM d, yyyy HH:mm')}
            </span>
        ),
        location: (
            <button
                type="button"
                className="text-primary text-xs font-semibold hover:underline"
                onClick={() => navigate('/map')}
            >
                {t('admin.latest.viewMap')}
            </button>
        ),
        elephants: String(entry.elephantCount || '—'),
        beat: entry.beatName,
    }));

    return (
        <div className="space-y-6">
            <AdminPageHeader
                title={t('admin.nav.latest')}
                subtitle={t('admin.latest.subtitle')}
                badge={loading ? t('admin.filters.applying') : undefined}
            />

            <AdminDataTable
                columns={[
                    { key: 'division', label: t('admin.filters.division') },
                    { key: 'reportedAt', label: t('admin.latest.reportedAt') },
                    { key: 'beat', label: t('admin.live.beat') },
                    { key: 'location', label: t('admin.latest.location') },
                    { key: 'elephants', label: t('admin.live.elephants') },
                ]}
                rows={rows}
                emptyMessage={t('admin.latest.noEntries')}
            />
        </div>
    );
}
