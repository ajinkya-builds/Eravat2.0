import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../supabase';
import { AdminPageHeader, AdminKpiCard, AdminDeferredNotice, AdminDataTable } from '../../components/admin/AdminShared';
import { fetchDivisions, type GeoDivision } from '../../services/adminAnalyticsService';

interface ProfileRow {
    id: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    role: string;
    is_active: boolean | null;
    user_region_assignments?: { geo_divisions?: { name: string } | null }[];
}

export default function AdminUserStats() {
    const { t } = useLanguage();
    const [profiles, setProfiles] = useState<ProfileRow[]>([]);
    const [divisions, setDivisions] = useState<GeoDivision[]>([]);
    const [divisionFilter, setDivisionFilter] = useState('');
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                const [{ data: profileData }, divs] = await Promise.all([
                    supabase
                        .from('profiles')
                        .select(`
                            id, first_name, last_name, phone, role, is_active,
                            user_region_assignments ( geo_divisions ( name ) )
                        `)
                        .order('created_at', { ascending: false }),
                    fetchDivisions(),
                ]);
                setProfiles((profileData as unknown as ProfileRow[]) ?? []);
                setDivisions(divs);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return profiles.filter((p) => {
            const name = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim().toLowerCase();
            const phone = p.phone ?? '';
            const division = p.user_region_assignments?.[0]?.geo_divisions?.name ?? '';
            if (divisionFilter && !division.toLowerCase().includes(divisionFilter.toLowerCase())) return false;
            if (!q) return true;
            return name.includes(q) || phone.includes(q);
        });
    }, [profiles, search, divisionFilter]);

    const activeCount = filtered.filter((p) => p.is_active !== false).length;
    const officialRoles = new Set(['admin', 'ccf', 'dfo', 'range_officer', 'beat_guard', 'rrt', 'biologist', 'veterinarian']);

    const rows = filtered.slice(0, 50).map((p) => ({
        name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || '—',
        mobile: p.phone ?? '—',
        role: p.role,
        division: p.user_region_assignments?.[0]?.geo_divisions?.name ?? '—',
        status: p.is_active === false ? t('admin.users.inactive') : t('admin.users.active'),
    }));

    return (
        <div className="space-y-6">
            <AdminPageHeader title={t('admin.nav.userStats')} subtitle={t('admin.userStats.subtitle')} />

            <div className="glass-card rounded-2xl p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                    className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                    placeholder={t('admin.userStats.search')}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <select
                    className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                    value={divisionFilter}
                    data-ph-filter="admin.user_stats.division"
                    data-ph-value-mode="presence"
                    data-ph-screen="admin.user_stats"
                    onChange={(e) => setDivisionFilter(e.target.value)}
                >
                    <option value="">{t('admin.filters.allDivisions')}</option>
                    {divisions.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
                </select>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <AdminKpiCard title={t('admin.userStats.totalPersonnel')} value={filtered.length} />
                <AdminKpiCard title={t('admin.userStats.active')} value={activeCount} tone="success" />
                <AdminKpiCard title={t('admin.userStats.officials')} value={filtered.filter((p) => officialRoles.has(p.role)).length} />
            </div>

            <AdminDeferredNotice title={t('admin.deferred.villagers')} reason={t('admin.deferred.villagersReason')} />

            <AdminDataTable
                columns={[
                    { key: 'name', label: t('admin.users.name') },
                    { key: 'mobile', label: t('admin.userStats.mobile') },
                    { key: 'role', label: t('admin.users.role') },
                    { key: 'division', label: t('admin.filters.division') },
                    { key: 'status', label: t('admin.users.status') },
                ]}
                rows={rows}
                emptyMessage={loading ? t('admin.users.loading') : t('admin.users.noPersonnel')}
            />
        </div>
    );
}
