import { useEffect, useMemo, useState } from 'react';
import { format, subDays } from 'date-fns';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../supabase';
import {
    AdminPageHeader,
    AdminKpiCard,
    AdminDeferredNotice,
    AdminDataTable,
} from '../../components/admin/AdminShared';

interface NotificationRow {
    id: string;
    title: string;
    message: string;
    notification_type: string;
    created_at: string;
    user_id: string;
    profiles?: { first_name: string | null; last_name: string | null; phone: string | null } | null;
}

export default function AdminNotifications() {
    const { t } = useLanguage();
    const [rows, setRows] = useState<NotificationRow[]>([]);
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [loading, setLoading] = useState(true);

    const load = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('notifications')
                .select(`
                    id, title, message, notification_type, created_at, user_id,
                    profiles ( first_name, last_name, phone )
                `)
                .gte('created_at', `${startDate}T00:00:00`)
                .lte('created_at', `${endDate}T23:59:59`)
                .order('created_at', { ascending: false })
                .limit(200);
            if (error) throw error;
            setRows((data as unknown as NotificationRow[]) ?? []);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void load(); }, [startDate, endDate]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return rows.filter((row) => {
            if (typeFilter && row.notification_type !== typeFilter) return false;
            if (!q) return true;
            const name = `${row.profiles?.first_name ?? ''} ${row.profiles?.last_name ?? ''}`.toLowerCase();
            const phone = row.profiles?.phone ?? '';
            return name.includes(q) || phone.includes(q) || row.message.toLowerCase().includes(q);
        });
    }, [rows, search, typeFilter]);

    const summary = useMemo(() => ({
        total: filtered.length,
        proximity: filtered.filter((r) => r.notification_type === 'proximity').length,
        chain: filtered.filter((r) => r.notification_type === 'chain_of_command').length,
    }), [filtered]);

    const tableRows = filtered.slice(0, 100).map((row) => ({
        id: row.id.slice(0, 8),
        user: (
            <div>
                <p className="font-medium">{`${row.profiles?.first_name ?? ''} ${row.profiles?.last_name ?? ''}`.trim() || '—'}</p>
                <p className="text-xs text-muted-foreground">{row.profiles?.phone ?? '—'}</p>
            </div>
        ),
        type: row.notification_type,
        message: row.message,
        sentAt: format(new Date(row.created_at), 'MMM d, yyyy HH:mm'),
    }));

    return (
        <div className="space-y-6">
            <AdminPageHeader title={t('admin.nav.notifications')} subtitle={t('admin.notifications.subtitle')} />

            <div className="glass-card rounded-2xl p-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                <input
                    className="rounded-xl border border-border bg-background px-3 py-2 text-sm md:col-span-2"
                    placeholder={t('admin.notifications.search')}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <select
                    className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                    value={typeFilter}
                    data-ph-filter="admin.notification_type"
                    data-ph-screen="admin.notifications"
                    onChange={(e) => setTypeFilter(e.target.value)}
                >
                    <option value="">{t('admin.notifications.allTypes')}</option>
                    <option value="general">{t('admin.notifications.typeGeneral')}</option>
                    <option value="proximity">{t('admin.notifications.typeProximity')}</option>
                    <option value="chain_of_command">{t('admin.notifications.typeChain')}</option>
                </select>
                <input type="date" className="rounded-xl border border-border bg-background px-3 py-2 text-sm" value={startDate} data-ph-filter="admin.notification_start_date" data-ph-screen="admin.notifications" onChange={(e) => setStartDate(e.target.value)} />
                <input type="date" className="rounded-xl border border-border bg-background px-3 py-2 text-sm" value={endDate} data-ph-filter="admin.notification_end_date" data-ph-screen="admin.notifications" onChange={(e) => setEndDate(e.target.value)} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <AdminKpiCard title={t('admin.notifications.total')} value={summary.total} />
                <AdminKpiCard title={t('admin.notifications.typeProximity')} value={summary.proximity} />
                <AdminKpiCard title={t('admin.notifications.typeChain')} value={summary.chain} />
            </div>

            <AdminDeferredNotice title={t('admin.deferred.voiceCalls')} reason={t('admin.deferred.voiceCallsReason')} />
            <AdminDeferredNotice title={t('admin.deferred.credits')} reason={t('admin.deferred.creditsReason')} />

            <AdminDataTable
                columns={[
                    { key: 'id', label: 'ID' },
                    { key: 'user', label: t('admin.notifications.recipient') },
                    { key: 'type', label: t('admin.notifications.type') },
                    { key: 'message', label: t('admin.notifications.message') },
                    { key: 'sentAt', label: t('admin.notifications.sentAt') },
                ]}
                rows={tableRows}
                emptyMessage={loading ? t('admin.filters.applying') : t('admin.notifications.empty')}
            />
        </div>
    );
}
