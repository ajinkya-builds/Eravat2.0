import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { format } from 'date-fns';
import type { GeoDivision, AdminFilters } from '../../services/adminAnalyticsService';
import { useLanguage } from '../../contexts/LanguageContext';

export function AdminPageHeader({
    title,
    subtitle,
    badge,
}: {
    title: string;
    subtitle?: string;
    badge?: string;
}) {
    return (
        <motion.div
            initial={{ y: -12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="flex flex-col md:flex-row md:items-end justify-between gap-4"
        >
            <motion.div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
                {subtitle && <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p>}
            </motion.div>
            {badge && (
                <span className="px-3 py-1 bg-emerald-500/10 text-emerald-600 rounded-full text-xs font-semibold self-start">
                    {badge}
                </span>
            )}
        </motion.div>
    );
}

export function AdminFilterBar({
    divisions,
    filters,
    onChange,
    onApply,
    loading,
}: {
    divisions: GeoDivision[];
    filters: AdminFilters;
    onChange: (next: AdminFilters) => void;
    onApply: () => void;
    loading?: boolean;
}) {
    const { t } = useLanguage();

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="glass-card rounded-2xl p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end"
        >
            <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">{t('admin.filters.division')}</span>
                <select
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                    value={filters.divisionId ?? ''}
                    onChange={(e) => onChange({ ...filters, divisionId: e.target.value || null })}
                >
                    <option value="">{t('admin.filters.allDivisions')}</option>
                    {divisions.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                </select>
            </label>
            <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">{t('admin.filters.startDate')}</span>
                <input
                    type="date"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                    value={format(filters.startDate, 'yyyy-MM-dd')}
                    onChange={(e) => onChange({ ...filters, startDate: new Date(e.target.value) })}
                />
            </label>
            <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">{t('admin.filters.endDate')}</span>
                <input
                    type="date"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                    value={format(filters.endDate, 'yyyy-MM-dd')}
                    onChange={(e) => onChange({ ...filters, endDate: new Date(e.target.value) })}
                />
            </label>
            <button
                type="button"
                onClick={onApply}
                disabled={loading}
                className="rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
            >
                {loading ? t('admin.filters.applying') : t('admin.filters.apply')}
            </button>
        </motion.div>
    );
}

export function AdminKpiCard({
    title,
    value,
    delay = 0,
    tone = 'default',
}: {
    title: string;
    value: string | number;
    delay?: number;
    tone?: 'default' | 'danger' | 'warning' | 'success';
}) {
    const toneClass = {
        default: 'text-foreground',
        danger: 'text-destructive',
        warning: 'text-amber-600',
        success: 'text-emerald-600',
    }[tone];

    return (
        <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay }}
            className="glass-card rounded-2xl p-5"
        >
            <p className={`text-3xl font-bold mb-1 ${toneClass}`}>{value}</p>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
        </motion.div>
    );
}

export function AdminDeferredNotice({ title, reason }: { title: string; reason: string }) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-2xl border border-dashed border-amber-500/40 bg-amber-500/5 p-4 flex gap-3"
        >
            <Lock size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
                <p className="text-sm font-semibold text-foreground">{title}</p>
                <p className="text-xs text-muted-foreground mt-1">{reason}</p>
            </div>
        </motion.div>
    );
}

export function AdminDataTable({
    columns,
    rows,
    emptyMessage,
}: {
    columns: { key: string; label: string; className?: string }[];
    rows: Record<string, ReactNode>[];
    emptyMessage: string;
}) {
    if (!rows.length) {
        return (
            <div className="glass-card rounded-2xl p-8 text-center text-sm text-muted-foreground">
                {emptyMessage}
            </div>
        );
    }

    return (
        <div className="glass-card rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-border bg-muted/40">
                            {columns.map((col) => (
                                <th key={col.key} className={`text-left px-4 py-3 font-semibold text-muted-foreground ${col.className ?? ''}`}>
                                    {col.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, idx) => (
                            <tr key={idx} className="border-b border-border/50 hover:bg-muted/30">
                                {columns.map((col) => (
                                    <td key={col.key} className={`px-4 py-3 ${col.className ?? ''}`}>
                                        {row[col.key]}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
