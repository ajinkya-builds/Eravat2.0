import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { AdminKpiCard, AdminPageHeader } from '../../components/admin/AdminShared';
import {
  fetchSupportIssues,
  setSupportIssueStatus,
  type SupportIssue,
} from '../../lib/supportIssues';

export default function AdminSupport() {
  const { t } = useLanguage();
  const [rows, setRows] = useState<SupportIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'resolved'>('open');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchSupportIssues());
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.support.loadFailed'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(
    () => (statusFilter === 'all' ? rows : rows.filter((r) => r.status === statusFilter)),
    [rows, statusFilter],
  );

  const openCount = rows.filter((r) => r.status === 'open').length;

  const mark = async (id: string, status: 'open' | 'resolved') => {
    setBusyId(id);
    try {
      await setSupportIssueStatus(id, status);
      setRows((prev) =>
        prev.map((row) =>
          row.id === id
            ? { ...row, status, resolved_at: status === 'resolved' ? new Date().toISOString() : null }
            : row,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.support.updateFailed'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t('admin.support.title')} subtitle={t('admin.support.subtitle')} />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <AdminKpiCard title={t('admin.support.kpiOpen')} value={String(openCount)} />
        <AdminKpiCard title={t('admin.support.kpiTotal')} value={String(rows.length)} />
      </div>

      <div className="flex flex-wrap gap-2">
        {(['open', 'resolved', 'all'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setStatusFilter(value)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
              statusFilter === value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground'
            }`}
          >
            {value === 'open' ? t('admin.support.open') : value === 'resolved' ? t('admin.support.resolved') : t('admin.support.all')}
          </button>
        ))}
      </div>

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl p-3">{error}</p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
          <Loader2 size={16} className="animate-spin" /> {t('loading')}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center">{t('admin.support.empty')}</p>
      ) : (
        <div className="space-y-3" data-testid="admin-support-list">
          {filtered.map((row) => (
            <article key={row.id} className="rounded-2xl border border-border bg-card p-4 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-sm">
                    {row.display_name?.trim() || t('admin.support.anonymous')}
                    {row.role ? <span className="text-muted-foreground font-normal"> · {row.role}</span> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {row.phone || '—'} · {row.page_path || '—'} · {format(new Date(row.created_at), 'MMM d, yyyy HH:mm')}
                  </p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                  row.status === 'open' ? 'bg-amber-500/15 text-amber-700' : 'bg-emerald-500/15 text-emerald-700'
                }`}>
                  {row.status === 'open' ? t('admin.support.open') : t('admin.support.resolved')}
                </span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{row.notes}</p>
              <div className="flex justify-end">
                {row.status === 'open' ? (
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => void mark(row.id, 'resolved')}
                    className="text-xs font-semibold text-primary hover:underline disabled:opacity-50"
                  >
                    {t('admin.support.markResolved')}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => void mark(row.id, 'open')}
                    className="text-xs font-semibold text-muted-foreground hover:underline disabled:opacity-50"
                  >
                    {t('admin.support.reopen')}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
