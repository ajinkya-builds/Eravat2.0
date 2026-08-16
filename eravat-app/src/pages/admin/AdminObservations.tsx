import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, Download, Trash2, Pencil, ChevronLeft, ChevronRight, Loader2, X, AlertTriangle } from 'lucide-react';
import { supabase } from '../../supabase';
import { useLanguage } from '../../contexts/LanguageContext';

type ObsType = 'direct' | 'indirect' | 'loss';

interface ReportWithObs {
    id: string;
    user_id: string;
    beat_id: string;
    device_timestamp: string;
    status: string;
    notes?: string;
    server_created_at: string;
    geo_beats?: {
        name: string;
        geo_ranges?: {
            name: string;
            geo_divisions?: {
                name: string;
            }
        }
    };
    observations: {
        type: ObsType;
        male_count: number;
        female_count: number;
        calf_count: number;
        unknown_count: number;
        compass_bearing?: number;
        indirect_sign_details?: string[];
        conflict_loss_details?: string[];
    }[];
    conflict_damages: {
        category: string;
        description: string;
        estimated_value?: number;
    }[];
}

const PAGE_SIZE = 10;

// Map database enum values to UI labels/colors
const typeColors: Record<string, string> = {
    'direct': 'bg-emerald-500/15 text-emerald-600',
    'direct_sighting': 'bg-emerald-500/15 text-emerald-600',
    'indirect': 'bg-amber-500/15 text-amber-600',
    'indirect_sign': 'bg-amber-500/15 text-amber-600',
    'loss': 'bg-destructive/15 text-destructive',
    'conflict_loss': 'bg-destructive/15 text-destructive',
};

const typeLabels: Record<string, string> = {
    'direct': 'Direct',
    'direct_sighting': 'Direct',
    'indirect': 'Indirect',
    'indirect_sign': 'Indirect',
    'loss': 'Loss',
    'conflict_loss': 'Loss',
};

export default function AdminObservations() {
    const [observations, setObservations] = useState<ReportWithObs[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [selected, setSelected] = useState<string[]>([]);
    const [editTarget, setEditTarget] = useState<ReportWithObs | null>(null);
    const [confirmState, setConfirmState] = useState<{ ids: string[]; label: string } | null>(null);
    const { t } = useLanguage();

    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

    const fetchObservations = async (page = 1) => {
        setLoading(true);
        setError(null);
        try {
            const from = (page - 1) * PAGE_SIZE;
            const to = from + PAGE_SIZE - 1;
            const { data, error, count } = await supabase
                .from('reports')
                .select('id, user_id, beat_id, device_timestamp, status, notes, server_created_at, geo_beats(name, geo_ranges(name, geo_divisions(name))), observations(*), conflict_damages(*)', { count: 'estimated' })
                .order('server_created_at', { ascending: false })
                .range(from, to);
            if (error) throw error;
            setObservations((data as unknown as ReportWithObs[]) || []);
            setTotalCount(count ?? 0);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch observations');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchObservations(currentPage); }, [currentPage]);

    const handleDelete = async (id: string) => {
        setConfirmState({ ids: [id], label: t('admin.obs.deletePermanently') });
    };

    const handleBulkDelete = async () => {
        if (!selected.length) return;
        setConfirmState({ ids: selected, label: `Delete ${selected.length} selected report${selected.length !== 1 ? 's' : ''} permanently?` });
    };

    const handleConfirmDelete = async () => {
        if (!confirmState) return;
        try {
            const { error } = await supabase.from('reports').delete().in('id', confirmState.ids);
            if (error) throw error;
            setSelected(prev => prev.filter(id => !confirmState.ids.includes(id)));
            setConfirmState(null);
            fetchObservations(currentPage);
        } catch (err) { setError(err instanceof Error ? err.message : 'Delete failed'); setConfirmState(null); }
    };

    const handleMarkReviewed = async (id: string) => {
        try {
            const { error } = await supabase.from('reports').update({ status: 'reviewed' }).eq('id', id);
            if (error) throw error;
            fetchObservations(currentPage);
        } catch (err) { setError(err instanceof Error ? err.message : 'Update failed'); }
    };

    const handleExportCSV = async () => {
        const { data } = await supabase.from('reports').select('*, geo_beats(name, geo_ranges(name, geo_divisions(name))), observations(*), conflict_damages(*)').order('server_created_at', { ascending: false });
        if (!data) return;
        const headers = ['ID', 'Timestamp', 'Division', 'Range', 'Beat', 'Type', 'Elephants', 'Details', 'Status'];
        const rows = (data as ReportWithObs[]).map(r => {
            const obs = r.observations?.[0];
            const b_name = r.geo_beats?.name ?? '';
            const r_name = r.geo_beats?.geo_ranges?.name ?? '';
            const d_name = r.geo_beats?.geo_ranges?.geo_divisions?.name ?? '';
            const total = obs ? (obs.male_count + obs.female_count + obs.calf_count + obs.unknown_count) : 0;
            const type = obs?.type ?? (r.conflict_damages?.length ? 'loss' : '');
            let details = Array.isArray(obs?.indirect_sign_details) ? obs.indirect_sign_details.join(', ') : (obs?.indirect_sign_details || '');
            if (Array.isArray(obs?.conflict_loss_details) && obs.conflict_loss_details.length > 0) {
                details = obs.conflict_loss_details.join(', ');
            }
            if (r.conflict_damages?.length) {
                details = r.conflict_damages.map(d => d.description).join(', ');
            }
            return [r.id, r.device_timestamp, d_name, r_name, b_name, type, total, `"${details.replace(/"/g, '""')}"`, r.status].join(',');
        });
        const csv = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `reports_${new Date().toISOString().split('T')[0]}.csv`; a.click();
        URL.revokeObjectURL(url);
    };

    const handleSaveEdit = async (
        reportData: ReportWithObs,
        countsData: { male: number; female: number; calf: number; unknown: number } | null
    ) => {
        try {
            const { error } = await supabase.from('reports').update({
                notes: reportData.notes,
                status: reportData.status,
            }).eq('id', reportData.id);
            if (error) throw error;

            const obs = reportData.observations?.[0];
            if (obs && countsData && ['direct', 'direct_sighting'].includes(obs.type)) {
                const { error: obsErr } = await supabase
                    .from('observations')
                    .update({
                        male_count: countsData.male,
                        female_count: countsData.female,
                        calf_count: countsData.calf,
                        unknown_count: countsData.unknown,
                    })
                    .eq('report_id', reportData.id);
                if (obsErr) throw obsErr;
            }

            setEditTarget(null);
            fetchObservations(currentPage);
        } catch (err) { setError(err instanceof Error ? err.message : 'Save failed'); }
    };

    const toggleSelect = (id: string) => setSelected(prev =>
        prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{t('admin.obs.title')}</h1>
                    <p className="text-sm text-muted-foreground mt-1">{totalCount} {t('admin.obs.totalReports')}</p>
                </div>
                <div className="flex items-center gap-2">
                    {selected.length > 0 && (
                        <button onClick={handleBulkDelete} className="px-4 py-2 rounded-xl bg-destructive text-destructive-foreground text-sm font-medium">
                            {t('admin.obs.deleteReport')} ({selected.length})
                        </button>
                    )}
                    <button onClick={handleExportCSV} className="flex items-center gap-2 px-4 py-2 rounded-xl glass-card border border-border text-sm font-medium hover:bg-muted transition-colors">
                        <Download size={16} /> {t('admin.obs.exportCSV')}
                    </button>
                    <button onClick={() => fetchObservations(currentPage)} disabled={loading} className="p-2.5 rounded-xl glass-card border border-border hover:bg-muted transition-colors">
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {error && (<div className="p-4 rounded-xl bg-destructive/10 text-destructive text-sm">{error}</div>)}

            <div className="glass-card rounded-2xl overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-muted-foreground" /></div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm border-collapse">
                            <thead>
                                <tr className="border-b border-border bg-muted/30">
                                    <th className="p-4 w-10">
                                        <input type="checkbox"
                                            onChange={e => setSelected(e.target.checked ? observations.map(o => o.id) : [])}
                                            checked={selected.length === observations.length && observations.length > 0} />
                                    </th>
                                    {[t('admin.obs.timestamp'), t('admin.users.territory'), t('admin.obs.type'), t('admin.obs.count'), t('admin.obs.details'), t('admin.users.status'), t('admin.users.actions')].map(h => (
                                        <th key={h} className="p-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {observations.length === 0 ? (
                                    <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">{t('admin.obs.noObs')}</td></tr>
                                ) : observations.map((obs, i) => {
                                    const o = obs.observations?.[0];
                                    const d = obs.conflict_damages?.[0];
                                    const total = o ? (o.male_count + o.female_count + o.calf_count + o.unknown_count) : 0;
                                    const obsType = o?.type ?? (d ? 'loss' : null);
                                    const territory = [
                                        obs.geo_beats?.name,
                                        obs.geo_beats?.geo_ranges?.name
                                    ].filter(Boolean).join(' • ');

                                    return (
                                        <motion.tr key={obs.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                            transition={{ delay: i * 0.03 }}
                                            className="border-b border-border/50 hover:bg-muted/10 group transition-colors">
                                            <td className="p-4"><input type="checkbox" checked={selected.includes(obs.id)} onChange={() => toggleSelect(obs.id)} /></td>
                                            <td className="p-4 font-medium text-xs whitespace-nowrap">{new Date(obs.device_timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                                            <td className="p-4 text-xs text-muted-foreground whitespace-nowrap">{territory || '—'}</td>
                                            <td className="p-4 whitespace-nowrap">
                                                {obsType ? (
                                                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${typeColors[obsType] || 'bg-muted text-muted-foreground'}`}>{typeLabels[obsType] || obsType}</span>
                                                ) : <span className="text-muted-foreground text-xs">—</span>}
                                            </td>
                                            <td className="p-4 text-muted-foreground">{total || '—'}</td>
                                            <td className="p-4 text-muted-foreground text-xs max-w-[200px] truncate" title={
                                                Array.isArray(o?.indirect_sign_details) && o.indirect_sign_details.length > 0
                                                    ? o.indirect_sign_details.join(', ')
                                                    : Array.isArray(o?.conflict_loss_details) && o.conflict_loss_details.length > 0
                                                        ? o.conflict_loss_details.join(', ')
                                                        : (obs.conflict_damages.map(cd => cd.description).join(', ') || '')
                                            }>
                                                {Array.isArray(o?.indirect_sign_details) && o.indirect_sign_details.length > 0
                                                    ? o.indirect_sign_details.join(', ')
                                                    : Array.isArray(o?.conflict_loss_details) && o.conflict_loss_details.length > 0
                                                        ? o.conflict_loss_details.join(', ')
                                                        : (obs.conflict_damages.map(cd => cd.description).join(', ') || '—')}
                                            </td>
                                            <td className="p-4">
                                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${obs.status === 'reviewed' ? 'bg-emerald-500/15 text-emerald-600' : obs.status === 'synced' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
                                                    {obs.status || 'pending'}
                                                </span>
                                            </td>
                                            <td className="p-4">
                                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => setEditTarget(obs)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><Pencil size={14} /></button>
                                                    <button
                                                        onClick={() => handleMarkReviewed(obs.id)}
                                                        title={t('admin.obs.reviewed')}
                                                        className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
                                                    >
                                                        <RefreshCw size={14} />
                                                    </button>
                                                    <button onClick={() => handleDelete(obs.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive"><Trash2 size={14} /></button>
                                                </div>
                                            </td>
                                        </motion.tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {totalPages > 1 && (
                <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                        {t('admin.obs.showing')} {Math.min((currentPage - 1) * PAGE_SIZE + 1, totalCount)}–{Math.min(currentPage * PAGE_SIZE, totalCount)} {t('admin.obs.of')} {totalCount}
                    </span>
                    <div className="flex gap-2">
                        <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                            className="p-2 rounded-xl glass-card border border-border disabled:opacity-40 hover:bg-muted transition-colors"><ChevronLeft size={16} /></button>
                        <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                            className="p-2 rounded-xl glass-card border border-border disabled:opacity-40 hover:bg-muted transition-colors"><ChevronRight size={16} /></button>
                    </div>
                </div>
            )}

            <EditReportModal
                report={editTarget}
                onClose={() => setEditTarget(null)}
                onSave={handleSaveEdit}
                t={t}
            />

            {confirmState && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                        className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-destructive/10">
                                <AlertTriangle className="text-destructive" size={20} />
                            </div>
                            <h2 className="text-base font-bold">{t('admin.obs.confirmDelete')}</h2>
                        </div>
                        <p className="text-sm text-muted-foreground">{confirmState.label}</p>
                        <div className="flex gap-3 pt-1">
                            <button onClick={() => setConfirmState(null)}
                                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors">
                                {t('cancel')}
                            </button>
                            <button onClick={handleConfirmDelete}
                                className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold hover:opacity-90 transition-opacity">
                                {t('delete')}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

interface EditReportModalProps {
    report: ReportWithObs | null;
    onClose: () => void;
    onSave: (
        reportData: ReportWithObs,
        countsData: { male: number; female: number; calf: number; unknown: number } | null
    ) => Promise<void>;
    t: (key: string) => string;
}

function EditReportModal({
    report,
    onClose,
    onSave,
    t
}: EditReportModalProps) {
    const [localReport, setLocalReport] = useState<ReportWithObs | null>(null);
    const [localCounts, setLocalCounts] = useState<{ male: number; female: number; calf: number; unknown: number } | null>(null);

    useEffect(() => {
        if (report) {
            setLocalReport({ ...report });
            setLocalCounts(
                report.observations?.[0]
                    ? {
                          male: report.observations[0].male_count,
                          female: report.observations[0].female_count,
                          calf: report.observations[0].calf_count,
                          unknown: report.observations[0].unknown_count,
                      }
                    : null
            );
        } else {
            setLocalReport(null);
            setLocalCounts(null);
        }
    }, [report]);

    if (!report || !localReport) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        void onSave(localReport, localCounts);
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
                <div className="flex justify-between items-center">
                    <h2 className="text-lg font-bold">{t('admin.obs.editReport')}</h2>
                    <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-muted"><X size={18} /></button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {localReport.observations?.[0] && ['direct', 'direct_sighting'].includes(localReport.observations[0].type) && localCounts && (
                        <div className="space-y-2 p-3 bg-primary/5 rounded-xl border border-primary/10">
                            <p className="text-xs font-semibold text-primary">{t('admin.obs.elephantCounts')}</p>
                            <div className="grid grid-cols-2 gap-2">
                                {(['male', 'female', 'calf', 'unknown'] as const).map(key => (
                                    <div key={key}>
                                        <label className="text-xs text-muted-foreground capitalize">{key}</label>
                                        <input
                                            type="number" min={0}
                                            value={localCounts[key]}
                                            onChange={e => setLocalCounts(prev => prev ? {
                                                ...prev,
                                                [key]: parseInt(e.target.value) || 0,
                                            } : null)}
                                            className="w-full mt-0.5 px-2 py-1.5 rounded-lg bg-muted/50 border border-border text-sm"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('report.notes')}</label>
                        <textarea rows={3} value={localReport.notes ?? ''}
                            onChange={e => setLocalReport({ ...localReport, notes: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
                    </div>
                    <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('admin.users.status')}</label>
                        <select value={localReport.status}
                            onChange={e => setLocalReport({ ...localReport, status: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                            <option value="pending">{t('admin.obs.pending')}</option>
                            <option value="synced">{t('admin.obs.synced')}</option>
                            <option value="reviewed">{t('admin.obs.reviewed')}</option>
                        </select>
                    </div>
                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors">{t('profile.cancel')}</button>
                        <button type="submit" className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">{t('admin.settings.saveChanges')}</button>
                    </div>
                </form>
            </motion.div>
        </div>
    );
}
