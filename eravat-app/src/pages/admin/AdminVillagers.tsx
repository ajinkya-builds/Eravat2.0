import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { supabase } from '../../supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { VillagerForm } from '../../components/villagers/VillagerForm';
import { AdminKpiCard, AdminPageHeader } from '../../components/admin/AdminShared';
import { fromE164India } from '../../lib/phone';
import {
  emptyVillagerForm,
  ensureVillageId,
  isUniqueMobileError,
  nestedName,
  onboarderLabel,
  validateVillagerForm,
  villageNameOf,
  villagerToCsvRow,
  VILLAGER_ADMIN_SELECT,
  VILLAGER_CSV_HEADER,
  type VillagerFormValues,
  type VillagerRecord,
} from '../../lib/villagerRegistry';

const PAGE_SIZE = 25;

type StatusFilter = 'all' | 'active' | 'inactive';
type AlertFilter = 'all' | 'on' | 'off';
type GeoEntity = { id: string; name: string };
type GeoRange = GeoEntity & { division_id: string };

type FilterQuery<Q> = {
  or: (filter: string) => Q;
  eq: (column: string, value: string | boolean) => Q;
};

function applyFilters<Q extends FilterQuery<Q>>(
  query: Q,
  opts: {
    search: string;
    divisionId: string;
    rangeId: string;
    status: StatusFilter;
    alerts: AlertFilter;
  },
): Q {
  let q = query;
  const trimmed = opts.search.trim();
  if (trimmed) q = q.or(`name.ilike.%${trimmed}%,mobile.ilike.%${trimmed}%`);
  if (opts.divisionId) q = q.eq('division_id', opts.divisionId);
  if (opts.rangeId) q = q.eq('range_id', opts.rangeId);
  if (opts.status === 'active') q = q.eq('is_active', true);
  if (opts.status === 'inactive') q = q.eq('is_active', false);
  if (opts.alerts === 'on') q = q.eq('alert_opt_in', true);
  if (opts.alerts === 'off') q = q.eq('alert_opt_in', false);
  return q;
}

export default function AdminVillagers() {
  const { profile } = useAuth();
  const { t } = useLanguage();
  const [rows, setRows] = useState<VillagerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [divisionId, setDivisionId] = useState('');
  const [rangeId, setRangeId] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [alerts, setAlerts] = useState<AlertFilter>('all');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [kpis, setKpis] = useState({ total: 0, active: 0, alerts: 0, inactive: 0 });
  const [divisions, setDivisions] = useState<GeoEntity[]>([]);
  const [ranges, setRanges] = useState<GeoRange[]>([]);
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<VillagerRecord | null>(null);
  const [form, setForm] = useState<VillagerFormValues>(emptyVillagerForm());
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<VillagerRecord | null>(null);

  const filterOpts = useMemo(
    () => ({ search: debouncedSearch, divisionId, rangeId, status, alerts }),
    [debouncedSearch, divisionId, rangeId, status, alerts],
  );

  const filteredRanges = useMemo(
    () => (divisionId ? ranges.filter((r) => r.division_id === divisionId) : ranges),
    [ranges, divisionId],
  );

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, divisionId, rangeId, status, alerts]);

  const attachOnboarders = async (list: VillagerRecord[]): Promise<VillagerRecord[]> => {
    const ids = [...new Set(list.map((r) => r.created_by).filter((id): id is string => Boolean(id)))];
    if (!ids.length) return list;
    const { data } = await supabase.from('profiles').select('id, first_name, last_name').in('id', ids);
    const byId = new Map((data ?? []).map((p) => [p.id, p]));
    return list.map((r) => {
      const p = r.created_by ? byId.get(r.created_by) : undefined;
      return {
        ...r,
        onboarder: p ? { first_name: p.first_name, last_name: p.last_name } : null,
      };
    });
  };

  const fetchKpis = async () => {
    const [all, active, opted, inactive] = await Promise.all([
      supabase.from('villagers').select('id', { count: 'exact', head: true }),
      supabase.from('villagers').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('villagers').select('id', { count: 'exact', head: true }).eq('is_active', true).eq('alert_opt_in', true),
      supabase.from('villagers').select('id', { count: 'exact', head: true }).eq('is_active', false),
    ]);
    setKpis({
      total: all.count ?? 0,
      active: active.count ?? 0,
      alerts: opted.count ?? 0,
      inactive: inactive.count ?? 0,
    });
  };

  const fetchRows = async (pageNum = page) => {
    setLoading(true);
    setError(null);
    try {
      const from = (pageNum - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let q = supabase
        .from('villagers')
        .select(VILLAGER_ADMIN_SELECT, { count: 'exact' })
        .order('name')
        .range(from, to);
      q = applyFilters(q, filterOpts);
      const { data, error: fetchErr, count } = await q;
      if (fetchErr) throw fetchErr;
      const withNames = await attachOnboarders((data as unknown as VillagerRecord[]) ?? []);
      setRows(withNames);
      setTotalCount(count ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('hathiMitra.listFailed'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.all([
      supabase.from('geo_divisions').select('id, name').order('name').then(({ data }) => setDivisions(data ?? [])),
      supabase.from('geo_ranges').select('id, name, division_id').order('name').then(({ data }) => setRanges((data as GeoRange[]) ?? [])),
      fetchKpis(),
    ]);
  }, []);

  useEffect(() => {
    void fetchRows(page);
    // refetch when page or filters change; fetchRows reads the latest closure
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filterOpts]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyVillagerForm(profile));
    setModalMode('create');
    setError(null);
  };

  const openEdit = (row: VillagerRecord) => {
    setEditing(row);
    setForm({
      name: row.name,
      phone: fromE164India(row.mobile),
      villageName: villageNameOf(row) ?? '',
      selectedVillage: {
        id: row.village_id,
        name: villageNameOf(row) ?? '',
        division_id: row.division_id,
      },
      location: { latitude: row.latitude, longitude: row.longitude },
      territory: {
        division_id: row.division_id,
        range_id: row.range_id,
        beat_id: null,
      },
      notes: row.notes ?? '',
      alertOptIn: row.alert_opt_in,
      isActive: row.is_active,
    });
    setModalMode('edit');
    setError(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = validateVillagerForm(form);
    if (!parsed.ok) {
      setError(t(parsed.errorKey));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const division = form.territory.division_id ?? form.selectedVillage?.division_id ?? null;
      const villageId = await ensureVillageId(form.villageName, form.selectedVillage, division);
      const payload = {
        name: form.name.trim(),
        mobile: parsed.mobile,
        latitude: form.location.latitude,
        longitude: form.location.longitude,
        village_id: villageId,
        division_id: division,
        range_id: form.territory.range_id,
        notes: form.notes.trim() || null,
        alert_opt_in: form.alertOptIn,
        is_active: form.isActive,
      };
      if (modalMode === 'create') {
        const { error: insertErr } = await supabase.from('villagers').insert({
          ...payload,
          created_by: profile?.id ?? null,
        });
        if (insertErr) {
          if (isUniqueMobileError(insertErr)) throw new Error(t('hathiMitra.duplicateMobile'));
          throw insertErr;
        }
        setToast(t('admin.villagers.created'));
      } else if (editing) {
        const { data, error: updateErr } = await supabase
          .from('villagers')
          .update(payload)
          .eq('id', editing.id)
          .select('id');
        if (updateErr) {
          if (isUniqueMobileError(updateErr)) throw new Error(t('hathiMitra.duplicateMobile'));
          throw updateErr;
        }
        if (!data?.length) throw new Error(t('admin.villagers.saveFailed'));
        setToast(t('admin.villagers.saved'));
      }
      setModalMode(null);
      await Promise.all([fetchRows(page), fetchKpis()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.villagers.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setSaving(true);
    try {
      const { data, error: delErr } = await supabase
        .from('villagers')
        .delete()
        .eq('id', confirmDelete.id)
        .select('id');
      if (delErr) throw delErr;
      if (!data?.length) throw new Error(t('admin.villagers.deleteFailed'));
      setConfirmDelete(null);
      await Promise.all([fetchRows(page), fetchKpis()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.villagers.deleteFailed'));
      setConfirmDelete(null);
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    let q = supabase.from('villagers').select(VILLAGER_ADMIN_SELECT).order('name').limit(10000);
    q = applyFilters(q, filterOpts);
    const { data, error: exportErr } = await q;
    if (exportErr || !data) {
      setError(exportErr?.message ?? t('hathiMitra.listFailed'));
      return;
    }
    const withNames = await attachOnboarders(data as unknown as VillagerRecord[]);
    const csv = [VILLAGER_CSV_HEADER, ...withNames.map(villagerToCsvRow)].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `villagers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (!toast) return;
    const handle = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(handle);
  }, [toast]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <AdminPageHeader title={t('admin.villagers.title')} subtitle={t('admin.villagers.subtitle')} />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleExport()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl glass-card border border-border text-sm font-medium hover:bg-muted transition-colors"
          >
            <Download size={16} /> {t('admin.villagers.exportCSV')}
          </button>
          <button
            type="button"
            onClick={() => void Promise.all([fetchRows(page), fetchKpis()])}
            disabled={loading}
            className="p-2.5 rounded-xl glass-card border border-border hover:bg-muted transition-colors"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            data-testid="admin-villagers-register"
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
          >
            <UserPlus size={16} /> {t('admin.villagers.register')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <AdminKpiCard title={t('admin.villagers.kpiTotal')} value={kpis.total} />
        <AdminKpiCard title={t('admin.villagers.kpiActive')} value={kpis.active} tone="success" delay={0.05} />
        <AdminKpiCard title={t('admin.villagers.kpiAlerts')} value={kpis.alerts} delay={0.1} />
        <AdminKpiCard title={t('admin.villagers.kpiInactive')} value={kpis.inactive} tone="warning" delay={0.15} />
      </div>

      <div className="glass-card rounded-2xl p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        <div className="relative md:col-span-2">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('admin.villagers.searchPlaceholder')}
            className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-background border border-border text-sm"
          />
        </div>
        <select
          value={divisionId}
          onChange={(e) => {
            setDivisionId(e.target.value);
            setRangeId('');
          }}
          className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
        >
          <option value="">{t('admin.filters.allDivisions')}</option>
          {divisions.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <select
          value={rangeId}
          onChange={(e) => setRangeId(e.target.value)}
          className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
        >
          <option value="">{t('admin.villagers.allRanges')}</option>
          {filteredRanges.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
          >
            <option value="all">{t('admin.villagers.statusAll')}</option>
            <option value="active">{t('admin.users.active')}</option>
            <option value="inactive">{t('admin.users.inactive')}</option>
          </select>
          <select
            value={alerts}
            onChange={(e) => setAlerts(e.target.value as AlertFilter)}
            className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
          >
            <option value="all">{t('admin.villagers.alertsAll')}</option>
            <option value="on">{t('admin.villagers.alertsOn')}</option>
            <option value="off">{t('admin.villagers.alertsOff')}</option>
          </select>
        </div>
      </div>

      {toast && (
        <p className="text-sm text-emerald-700 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">{toast}</p>
      )}
      {error && !modalMode && (
        <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl p-3">{error}</p>
      )}

      <div className="glass-card rounded-2xl overflow-hidden" data-testid="admin-villagers-table">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
            <Loader2 size={18} className="animate-spin" /> {t('loading')}
          </div>
        ) : (
          <>
            <div className="md:hidden divide-y divide-border/50">
              {rows.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">{t('admin.villagers.empty')}</p>
              ) : (
                rows.map((row) => (
                  <div key={row.id} className="p-4 space-y-2">
                    <p className="font-semibold">{row.name}</p>
                    <p className="text-xs text-muted-foreground">{row.mobile} · {villageNameOf(row) ?? '—'}</p>
                    <p className="text-xs text-muted-foreground">
                      {nestedName(row.geo_divisions) ?? '—'} / {nestedName(row.geo_ranges) ?? '—'}
                    </p>
                    <div className="flex items-center justify-between pt-1">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${row.is_active ? 'bg-emerald-500/15 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>
                        {row.is_active ? t('admin.users.active') : t('admin.users.inactive')}
                      </span>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => openEdit(row)} className="p-2 rounded-lg bg-muted/30 hover:bg-primary/10 text-muted-foreground hover:text-primary">
                          <Pencil size={16} />
                        </button>
                        <button type="button" onClick={() => setConfirmDelete(row)} className="p-2 rounded-lg bg-muted/30 hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    {[
                      t('admin.users.name'),
                      t('admin.users.contact'),
                      t('admin.villagers.village'),
                      t('admin.users.territory'),
                      t('admin.villagers.onboarder'),
                      t('admin.users.status'),
                      t('admin.villagers.alerts'),
                      t('admin.users.actions'),
                    ].map((h) => (
                      <th key={h} className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-muted-foreground">{t('admin.villagers.empty')}</td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={row.id} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="px-4 py-3 font-semibold">{row.name}</td>
                        <td className="px-4 py-3">{row.mobile}</td>
                        <td className="px-4 py-3">{villageNameOf(row) ?? '—'}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {[nestedName(row.geo_divisions), nestedName(row.geo_ranges)].filter(Boolean).join(' · ') || '—'}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {onboarderLabel(row.onboarder) ?? t('admin.villagers.unknownOnboarder')}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${row.is_active ? 'bg-emerald-500/15 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>
                            {row.is_active ? t('admin.users.active') : t('admin.users.inactive')}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${row.alert_opt_in ? 'bg-emerald-500/15 text-emerald-700' : 'bg-amber-500/15 text-amber-700'}`}>
                            {row.alert_opt_in ? t('admin.villagers.alertsOn') : t('admin.villagers.alertsOff')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button type="button" onClick={() => openEdit(row)} className="p-2 text-muted-foreground hover:text-primary bg-muted/30 hover:bg-primary/10 rounded-lg" title={t('admin.villagers.edit')}>
                              <Pencil size={16} />
                            </button>
                            <button type="button" onClick={() => setConfirmDelete(row)} className="p-2 text-muted-foreground hover:text-destructive bg-muted/30 hover:bg-destructive/10 rounded-lg" title={t('admin.villagers.deleteBtn')}>
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {t('admin.villagers.showing')} {totalCount === 0 ? 0 : Math.min((page - 1) * PAGE_SIZE + 1, totalCount)}–{Math.min(page * PAGE_SIZE, totalCount)} {t('admin.villagers.of')} {totalCount}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="p-2 rounded-xl glass-card border border-border disabled:opacity-40 hover:bg-muted"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="p-2 rounded-xl glass-card border border-border disabled:opacity-40 hover:bg-muted"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {modalMode && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto relative"
          >
            <button
              type="button"
              onClick={() => setModalMode(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
            >
              <X size={16} />
            </button>
            <h2 className="text-xl font-bold mb-1">
              {modalMode === 'create' ? t('admin.villagers.createTitle') : t('admin.villagers.edit')}
            </h2>
            <p className="text-sm text-muted-foreground mb-4">{t('hathiMitra.noLoginNote')}</p>
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl p-3 mb-4">{error}</p>
            )}
            <VillagerForm
              values={form}
              onChange={setForm}
              onSubmit={handleSave}
              submitting={saving}
              submitLabel={modalMode === 'create' ? t('hathiMitra.onboardSubmit') : t('hathiMitra.saveChanges')}
              submittingLabel={modalMode === 'create' ? t('hathiMitra.onboardSubmitting') : t('hathiMitra.saving')}
              submitIcon={modalMode === 'create' ? 'add' : 'save'}
              showNotes
              showStatusFields
            />
          </motion.div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl"
          >
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <Trash2 className="text-destructive" size={24} />
              </div>
            </div>
            <h2 className="text-xl font-bold text-center mb-2">{t('admin.villagers.deleteTitle')}</h2>
            <p className="text-sm text-center text-muted-foreground mb-6">{t('admin.villagers.deleteDesc')}</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="flex-1 h-11 rounded-xl border border-border font-semibold hover:bg-muted text-sm"
              >
                {t('profile.cancel')}
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={saving}
                className="flex-1 h-11 bg-destructive text-destructive-foreground rounded-xl font-bold disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
              >
                {saving && <Loader2 size={16} className="animate-spin" />}
                {t('admin.villagers.deleteBtn')}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
