import { useMemo } from 'react';
import { format } from 'date-fns';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAdminFilters } from '../../hooks/useAdminFilters';
import {
    AdminPageHeader,
    AdminFilterBar,
    AdminKpiCard,
    AdminDeferredNotice,
} from '../../components/admin/AdminShared';
import { countDamages } from '../../services/adminAnalyticsService';

const DAMAGE_COLORS: Record<string, string> = {
    human_death: 'hsl(280, 55%, 55%)',
    human_injury: 'hsl(152, 55%, 45%)',
    crop: 'hsl(45, 90%, 50%)',
    grain: 'hsl(30, 80%, 50%)',
    property: 'hsl(25, 85%, 55%)',
};

export default function AdminConflictDashboard() {
    const { t } = useLanguage();
    const { divisions, filters, setFilters, reports, loading, error, reload } = useAdminFilters(30);

    const damages = useMemo(() => countDamages(reports), [reports]);

    const pieData = [
        { name: t('admin.conflict.humanDeath'), value: damages.human_death, key: 'human_death' },
        { name: t('admin.conflict.humanInjury'), value: damages.human_injury, key: 'human_injury' },
        { name: t('admin.conflict.cropDamage'), value: damages.crop, key: 'crop' },
        { name: t('admin.conflict.grainDamage'), value: damages.grain, key: 'grain' },
        { name: t('admin.conflict.houseDamage'), value: damages.property, key: 'property' },
    ].filter((d) => d.value > 0);

    const monthlyTrend = useMemo(() => {
        const map = new Map<string, Record<string, number>>();
        for (const report of reports) {
            const month = format(new Date(report.device_timestamp), 'MMM yyyy');
            if (!map.has(month)) {
                map.set(month, { human_death: 0, human_injury: 0, crop: 0, grain: 0, property: 0 });
            }
            const bucket = map.get(month)!;
            for (const d of report.conflict_damages ?? []) {
                const cat = d.category ?? '';
                if (cat === 'human_death') bucket.human_death++;
                else if (cat === 'human_injury') bucket.human_injury++;
                else if (cat === 'crop') bucket.crop++;
                else if (cat === 'property') bucket.property++;
            }
        }
        return [...map.entries()].map(([month, vals]) => ({ month, ...vals }));
    }, [reports]);

    return (
        <div className="space-y-6">
            <AdminPageHeader
                title={t('admin.nav.conflict')}
                subtitle={t('admin.conflict.subtitle')}
                badge={loading ? t('admin.filters.applying') : undefined}
            />

            <AdminFilterBar divisions={divisions} filters={filters} onChange={setFilters} onApply={reload} loading={loading} />
            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <AdminKpiCard title={t('admin.conflict.humanDeath')} value={damages.human_death} tone="danger" />
                <AdminKpiCard title={t('admin.conflict.humanInjury')} value={damages.human_injury} tone="warning" />
                <AdminKpiCard title={t('admin.conflict.cropDamage')} value={damages.crop} />
                <AdminKpiCard title={t('admin.conflict.grainDamage')} value={damages.grain} />
                <AdminKpiCard title={t('admin.conflict.houseDamage')} value={damages.property} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="glass-card rounded-2xl p-6">
                    <h3 className="text-lg font-bold mb-4">{t('admin.conflict.distribution')}</h3>
                    {pieData.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{t('admin.conflict.noData')}</p>
                    ) : (
                        <ResponsiveContainer width="100%" height={280}>
                            <PieChart>
                                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={3} label>
                                    {pieData.map((entry) => (
                                        <Cell key={entry.key} fill={DAMAGE_COLORS[entry.key] ?? 'hsl(215, 16%, 57%)'} />
                                    ))}
                                </Pie>
                                <Tooltip />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    )}
                </div>

                <div className="glass-card rounded-2xl p-6">
                    <h3 className="text-lg font-bold mb-4">{t('admin.conflict.monthlyTrend')}</h3>
                    <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={monthlyTrend}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.4} />
                            <XAxis dataKey="month" fontSize={11} />
                            <YAxis fontSize={11} />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="human_death" name={t('admin.conflict.humanDeath')} stackId="a" fill={DAMAGE_COLORS.human_death} />
                            <Bar dataKey="human_injury" name={t('admin.conflict.humanInjury')} stackId="a" fill={DAMAGE_COLORS.human_injury} />
                            <Bar dataKey="crop" name={t('admin.conflict.cropDamage')} stackId="a" fill={DAMAGE_COLORS.crop} />
                            <Bar dataKey="grain" name={t('admin.conflict.grainDamage')} stackId="a" fill={DAMAGE_COLORS.grain} />
                            <Bar dataKey="property" name={t('admin.conflict.houseDamage')} stackId="a" fill={DAMAGE_COLORS.property} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <AdminDeferredNotice title={t('admin.deferred.kml')} reason={t('admin.deferred.kmlReason')} />
        </div>
    );
}
