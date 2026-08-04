import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Search, UserPlus, Loader2, AlertTriangle, MapPin, ChevronRight, Shield, Edit2, Trash2 } from 'lucide-react';
import { supabase } from '../../supabase';
import { useAuth, type UserProfile } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { canManageRole, GEOGRAPHIC_ROLES } from '../../lib/rbac';
import { LocationFields } from '../../components/profile/LocationFields';

interface Profile {
    id: string;
    role: string;
    first_name: string;
    last_name: string;
    phone?: string;
    is_active: boolean;
    created_at: string;
    // Joined
    beat_name?: string;
    range_name?: string;
    division_name?: string;
    division_id?: string;
    range_id?: string;
    beat_id?: string;
    user_region_assignments?: any[];
}

interface GeoEntity { id: string; name: string; code?: string; }
interface GeoRange extends GeoEntity { division_id: string; }
interface GeoBeat extends GeoEntity { range_id: string; }

const DEFAULT_NEW_USER = {
    first_name: '', last_name: '', phone: '',
    role: 'volunteer', division_id: '', range_id: '', beat_id: '',
    latitude: null as number | null, longitude: null as number | null,
};

const ROLES = [
    { value: 'admin', label: 'Admin (State Full Access)' },
    { value: 'ccf', label: 'Chief Conservator (State)' },
    { value: 'biologist', label: 'Biologist (State)' },
    { value: 'veterinarian', label: 'Veterinarian (State)' },
    { value: 'dfo', label: 'DFO (Division)' },
    { value: 'rrt', label: 'Rapid Response Team' },
    { value: 'range_officer', label: 'Range Officer' },
    { value: 'beat_guard', label: 'Beat Guard' },
    { value: 'volunteer', label: 'Volunteer / Gram Mitra' },
];

export default function AdminUsers() {
    const { profile: currentUserProfile } = useAuth();
    const { t } = useLanguage();
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [divisions, setDivisions] = useState<GeoEntity[]>([]);
    const [ranges, setRanges] = useState<GeoRange[]>([]);
    const [beats, setBeats] = useState<GeoBeat[]>([]);
    const [beatsByRange, setBeatsByRange] = useState<Record<string, GeoBeat[]>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editUser, setEditUser] = useState<Profile & { division_id?: string, range_id?: string, beat_id?: string } | null>(null);
    const [selected, setSelected] = useState<string[]>([]);
    const [confirmDelete, setConfirmDelete] = useState<{ ids: string[]; label: string } | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [toast, setToast] = useState<string | null>(null);

    const fetchData = async (searchTerm = debouncedSearch) => {
        setLoading(true);
        setError(null);
        try {
            const trimmed = searchTerm.trim();
            let profileQuery = supabase
                .from('profiles')
                .select('id, role, first_name, last_name, phone, is_active, created_at')
                .order('created_at', { ascending: false })
                .limit(trimmed.length >= 2 ? 50 : 100);

            if (trimmed.length >= 2) {
                profileQuery = profileQuery.or(
                    `first_name.ilike.%${trimmed}%,last_name.ilike.%${trimmed}%,phone.ilike.%${trimmed}%`
                );
            }

            const [
                { data: profileData, error: pErr },
                { data: divData },
                { data: ranData },
            ] = await Promise.all([
                profileQuery,
                supabase.from('geo_divisions').select('id, name, code').order('name'),
                supabase.from('geo_ranges').select('id, name, code, division_id').order('name'),
            ]);
            if (pErr) throw pErr;

            const profileIds = (profileData || []).map((p) => p.id);
            const { data: assignmentData, error: aErr } = profileIds.length
                ? await supabase
                    .from('user_region_assignments')
                    .select(`
                        user_id, division_id, range_id, beat_id, is_primary_contact,
                        geo_divisions (name),
                        geo_ranges (name),
                        geo_beats (name)
                    `)
                    .in('user_id', profileIds)
                : { data: [], error: null };
            if (aErr) throw aErr;

            setDivisions(divData || []);
            setRanges(ranData || []);
            setBeats([]);
            setBeatsByRange({});

            const divisionNameById = new Map((divData || []).map((d) => [d.id, d.name]));
            const rangeNameById = new Map((ranData || []).map((r) => [r.id, r.name]));
            const rangeDivisionById = new Map((ranData || []).map((r) => [r.id, r.division_id]));

            const assignmentsByUser = new Map<string, any[]>();
            (assignmentData || []).forEach((a: any) => {
                const existing = assignmentsByUser.get(a.user_id) || [];
                existing.push(a);
                assignmentsByUser.set(a.user_id, existing);
            });

            const specificityScore = (a: any) => {
                if (a?.beat_id) return 3;
                if (a?.range_id) return 2;
                if (a?.division_id) return 1;
                return 0;
            };

            const flat: Profile[] = (profileData || []).map((p: any) => {
                const userAssignments = assignmentsByUser.get(p.id) || [];
                const assignment = userAssignments.sort((a, b) => {
                    const primaryDelta = Number(Boolean(b?.is_primary_contact)) - Number(Boolean(a?.is_primary_contact));
                    if (primaryDelta !== 0) return primaryDelta;
                    return specificityScore(b) - specificityScore(a);
                })[0];
                const derivedRangeId = assignment?.range_id ?? null;
                const derivedDivisionId = assignment?.division_id || (derivedRangeId ? rangeDivisionById.get(derivedRangeId) : null);
                return {
                    ...p,
                    division_id: assignment?.division_id ?? derivedDivisionId ?? null,
                    range_id: assignment?.range_id ?? derivedRangeId ?? null,
                    beat_id: assignment?.beat_id ?? null,
                    division_name:
                        assignment?.geo_divisions?.name ??
                        ((assignment?.division_id || derivedDivisionId) ? divisionNameById.get(assignment?.division_id || derivedDivisionId) ?? null : null),
                    range_name:
                        assignment?.geo_ranges?.name ??
                        ((assignment?.range_id || derivedRangeId) ? rangeNameById.get(assignment?.range_id || derivedRangeId) ?? null : null),
                    beat_name: assignment?.geo_beats?.name ?? null,
                    user_region_assignments: userAssignments,
                };
            });
            setProfiles(flat);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    const loadBeatsForRange = async (rangeId: string) => {
        if (!rangeId) {
            setBeats([]);
            return;
        }
        if (beatsByRange[rangeId]) {
            setBeats(beatsByRange[rangeId]);
            return;
        }
        const { data, error: beatErr } = await supabase
            .from('geo_beats')
            .select('id, name, code, range_id')
            .eq('range_id', rangeId)
            .order('name');
        if (beatErr) {
            console.error('[AdminUsers] Failed to load beats for range', rangeId, beatErr);
            setBeats([]);
            return;
        }
        const list = data || [];
        setBeatsByRange((prev) => ({ ...prev, [rangeId]: list }));
        setBeats(list);
    };

    useEffect(() => {
        const handle = window.setTimeout(() => setDebouncedSearch(search), 300);
        return () => window.clearTimeout(handle);
    }, [search]);

    useEffect(() => { void fetchData(debouncedSearch); }, [debouncedSearch]);

    const filtered = useMemo(() => profiles, [profiles]);
    const handleCreate = async (userData: typeof DEFAULT_NEW_USER) => {
        setIsSubmitting(true);
        setError(null);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('Not authenticated');

            const body: Record<string, unknown> = { ...userData };

            const { data, error: fnErr } = await supabase.functions.invoke('create-user', {
                body,
                headers: { Authorization: `Bearer ${session.access_token}` },
            });

            if (fnErr) throw fnErr;
            if (data?.error) throw new Error(data.error);

            setShowModal(false);
            setToast('Personnel registered successfully');
            setTimeout(() => setToast(null), 3000);
            await fetchData();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create personnel');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUpdate = async (userData: Profile & { division_id?: string, range_id?: string, beat_id?: string }) => {
        setIsSubmitting(true);
        setError(null);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('Not authenticated');

            const { data, error: fnErr } = await supabase.functions.invoke('update-user', {
                body: userData,
                headers: { Authorization: `Bearer ${session.access_token}` },
            });

            if (fnErr) throw fnErr;
            if (data?.error) throw new Error(data.error);
            if (data?.warning) setError(data.warning);

            setEditUser(null);
            setToast(data?.warning ? null : 'Personnel updated successfully');
            setTimeout(() => setToast(null), 3000);
            await fetchData();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update personnel');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleConfirmDelete = async () => {
        if (!confirmDelete) return;
        setIsSubmitting(true);
        setError(null);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('Not authenticated');

            for (const id of confirmDelete.ids) {
                const { data, error: fnErr } = await supabase.functions.invoke('delete-user', {
                    body: { id },
                    headers: { Authorization: `Bearer ${session.access_token}` },
                });

                if (fnErr) throw fnErr;
                if (data?.error) throw new Error(data.error);
            }

            setSelected(prev => prev.filter(id => !confirmDelete.ids.includes(id)));
            setConfirmDelete(null);
            setToast(`${confirmDelete.ids.length > 1 ? confirmDelete.ids.length + ' personnel' : 'Personnel'} deleted successfully`);
            setTimeout(() => setToast(null), 3000);
            await fetchData();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete personnel');
        } finally {
            setIsSubmitting(false);
        }
    };

    const toggleSelect = (id: string) =>
        setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

    const manageableIds = useMemo(() =>
        filtered.filter(p => canManageRole(currentUserProfile?.role, p.role)).map(p => p.id),
        [filtered, currentUserProfile?.role]
    );

    // Determine if the current user can create ANY user types based on their role
    const canCreateAnyUser = currentUserProfile?.role && Object.values(ROLES).some(r => canManageRole(currentUserProfile.role, r.value));

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{t('admin.users.title')}</h1>
                    <p className="text-sm text-muted-foreground mt-1">{t('admin.users.subtitle')}</p>
                </div>
                <div className="flex items-center gap-2">
                    {selected.length > 0 && (
                        <button onClick={() => setConfirmDelete({ ids: selected, label: `Delete ${selected.length} selected personnel permanently?` })}
                            className="bg-destructive text-destructive-foreground h-11 px-5 rounded-xl flex items-center gap-2 font-semibold shadow-lg shadow-destructive/20 hover:bg-destructive/90 transition-colors text-sm">
                            <Trash2 size={16} /> {t('admin.users.deleteBtn')} ({selected.length})
                        </button>
                    )}
                    {canCreateAnyUser && (
                        <button onClick={() => { setError(null); setShowModal(true); }}
                            className="bg-primary text-primary-foreground h-11 px-6 rounded-xl flex items-center gap-2 font-semibold shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all">
                            <UserPlus size={18} /> {t('admin.users.registerPersonnel')}
                        </button>
                    )}
                </div>
            </div>

            {error && (
                <div className="bg-destructive/10 border border-destructive/20 text-destructive p-4 rounded-xl flex items-center gap-3 text-sm">
                    <AlertTriangle size={16} /> {error}
                </div>
            )}
            {toast && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 p-4 rounded-xl flex items-center gap-3 text-sm font-medium">
                    <Shield size={16} /> {toast}
                </div>
            )}

            <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                <input placeholder={t('admin.users.searchPlaceholder')} value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>

            <div className="glass-card rounded-2xl overflow-hidden border border-border/50">
                {loading ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-20">
                        <Loader2 className="animate-spin text-primary" size={28} />
                        <p className="text-sm text-muted-foreground">{t('au_loading')}</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-16 text-muted-foreground">{t('admin.users.noPersonnel')}</div>
                ) : (
                    <>
                        {/* Mobile card layout */}
                        <div className="md:hidden divide-y divide-border/40">
                            {filtered.map((p, i) => (
                                <motion.div
                                    key={p.id}
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: Math.min(i, 15) * 0.02 }}
                                    className="p-4 flex flex-col gap-3"
                                >
                                    <div className="flex items-start gap-3">
                                        {canManageRole(currentUserProfile?.role, p.role) ? (
                                            <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggleSelect(p.id)} className="rounded border-border mt-2.5 shrink-0" />
                                        ) : <span className="w-4 block shrink-0 mt-2.5" />}
                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                            <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                                                {(p.first_name?.[0] ?? '') + (p.last_name?.[0] ?? '')}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-semibold text-sm truncate">{p.first_name} {p.last_name}</p>
                                                <p className="text-sm font-semibold text-foreground/80 mt-0.5">{p.phone || 'N/A'}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2 pl-7">
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase bg-secondary/50 border border-border">
                                            {p.role === 'admin' && <Shield size={10} className="text-emerald-500" />}
                                            {p.role?.replace('_', ' ') ?? 'N/A'}
                                        </span>
                                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${p.is_active ? 'bg-emerald-500/15 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>
                                            {p.is_active ? t('admin.users.active') : t('admin.users.inactive')}
                                        </span>
                                    </div>

                                    <div className="pl-7">
                                        <div className="flex items-center gap-1.5 text-sm text-foreground/80">
                                            <MapPin size={13} className="text-primary shrink-0" />
                                            <span className="font-medium">{p.beat_name || p.range_name || p.division_name || 'Global'}</span>
                                        </div>
                                        {((p.beat_name && (p.range_name || p.division_name)) || (p.range_name && p.division_name)) && (
                                            <p className="text-[10px] text-muted-foreground pl-5 mt-0.5 flex items-center gap-1">
                                                {p.division_name} <ChevronRight size={8} /> {p.range_name}
                                            </p>
                                        )}
                                    </div>

                                    {canManageRole(currentUserProfile?.role, p.role) && (
                                        <div className="flex items-center gap-2 pl-7">
                                            <button onClick={() => {
                                                setError(null);
                                                const next = {
                                                    ...p,
                                                    division_id: p.division_id || '',
                                                    range_id: p.range_id || '',
                                                    beat_id: p.beat_id || ''
                                                } as any;
                                                setEditUser(next);
                                                if (next.range_id) void loadBeatsForRange(next.range_id);
                                            }}
                                                className="p-2 text-muted-foreground hover:text-primary bg-muted/30 hover:bg-primary/10 rounded-lg transition-colors"
                                                title="Edit">
                                                <Edit2 size={16} />
                                            </button>
                                            <button onClick={() => setConfirmDelete({ ids: [p.id], label: t('admin.users.deleteDesc') })}
                                                className="p-2 text-muted-foreground hover:text-destructive bg-muted/30 hover:bg-destructive/10 rounded-lg transition-colors"
                                                title="Delete">
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    )}
                                </motion.div>
                            ))}
                        </div>

                        {/* Desktop / tablet table */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-muted/40 border-b border-border">
                                        <th className="p-4 w-10">
                                            <input type="checkbox"
                                                onChange={e => setSelected(e.target.checked ? manageableIds : [])}
                                                checked={selected.length === manageableIds.length && manageableIds.length > 0}
                                                className="rounded border-border" />
                                        </th>
                                        <th className="p-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('admin.users.name')}</th>
                                        <th className="p-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('admin.users.contact')}</th>
                                        <th className="p-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('admin.users.role')}</th>
                                        <th className="p-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('admin.users.territory')}</th>
                                        <th className="p-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('admin.users.status')}</th>
                                        <th className="p-4 text-xs font-bold uppercase tracking-wider text-muted-foreground text-right">{t('admin.users.actions')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/40">
                                    {filtered.map((p, i) => (
                                        <motion.tr key={p.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: Math.min(i, 15) * 0.02 }} className="hover:bg-muted/20 group transition-colors">
                                            <td className="p-4">
                                                {canManageRole(currentUserProfile?.role, p.role) ? (
                                                    <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggleSelect(p.id)} className="rounded border-border" />
                                                ) : <span className="w-4 block" />}
                                            </td>
                                            <td className="p-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                                                        {(p.first_name?.[0] ?? '') + (p.last_name?.[0] ?? '')}
                                                    </div>
                                                    <div>
                                                        <p className="font-semibold text-sm">{p.first_name} {p.last_name}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-4 text-sm font-semibold">
                                                {p.phone || 'N/A'}
                                            </td>
                                            <td className="p-4">
                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase bg-secondary/50 border border-border">
                                                    {p.role === 'admin' && <Shield size={10} className="text-emerald-500" />}
                                                    {p.role?.replace('_', ' ') ?? 'N/A'}
                                                </span>
                                            </td>
                                            <td className="p-4">
                                                <div className="flex items-center gap-1.5 text-sm text-foreground/80">
                                                    <MapPin size={13} className="text-primary shrink-0" />
                                                    <span className="font-medium">{p.beat_name || p.range_name || p.division_name || 'Global'}</span>
                                                </div>
                                                {((p.beat_name && (p.range_name || p.division_name)) || (p.range_name && p.division_name)) && (
                                                    <p className="text-[10px] text-muted-foreground pl-5 mt-0.5 flex items-center gap-1">
                                                        {p.division_name} <ChevronRight size={8} /> {p.range_name}
                                                    </p>
                                                )}
                                            </td>
                                            <td className="p-4">
                                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${p.is_active ? 'bg-emerald-500/15 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>
                                                    {p.is_active ? t('admin.users.active') : t('admin.users.inactive')}
                                                </span>
                                            </td>
                                            <td className="p-4 text-right">
                                                {canManageRole(currentUserProfile?.role, p.role) && (
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button onClick={() => {
                                                            setError(null);
                                                            const next = {
                                                                ...p,
                                                                division_id: p.division_id || '',
                                                                range_id: p.range_id || '',
                                                                beat_id: p.beat_id || ''
                                                            } as any;
                                                            setEditUser(next);
                                                            if (next.range_id) void loadBeatsForRange(next.range_id);
                                                        }}
                                                            className="p-2 text-muted-foreground hover:text-primary bg-muted/30 hover:bg-primary/10 rounded-lg transition-colors"
                                                            title="Edit">
                                                            <Edit2 size={16} />
                                                        </button>
                                                        <button onClick={() => setConfirmDelete({ ids: [p.id], label: t('admin.users.deleteDesc') })}
                                                            className="p-2 text-muted-foreground hover:text-destructive bg-muted/30 hover:bg-destructive/10 rounded-lg transition-colors"
                                                            title="Delete">
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </motion.tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>

            <RegisterUserModal
                isOpen={showModal}
                onClose={() => { setShowModal(false); setError(null); }}
                onSubmit={handleCreate}
                error={error}
                isSubmitting={isSubmitting}
                divisions={divisions}
                ranges={ranges}
                beats={beats}
                onRangeChange={loadBeatsForRange}
                ROLES={ROLES}
                GEOGRAPHIC_ROLES={GEOGRAPHIC_ROLES}
                t={t}
            />

            <EditUserModal
                user={editUser}
                onClose={() => { setEditUser(null); setError(null); }}
                onSubmit={handleUpdate}
                error={error}
                isSubmitting={isSubmitting}
                divisions={divisions}
                ranges={ranges}
                beats={beats}
                onRangeChange={loadBeatsForRange}
                ROLES={ROLES}
                GEOGRAPHIC_ROLES={GEOGRAPHIC_ROLES}
                currentUserProfile={currentUserProfile}
                t={t}
            />

            {confirmDelete && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                        className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                        <div className="flex justify-center mb-4">
                            <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                                <Trash2 className="text-destructive" size={24} />
                            </div>
                        </div>
                        <h2 className="text-xl font-bold text-center mb-2">{t('admin.users.deleteTitle')}</h2>
                        <p className="text-sm text-center text-muted-foreground mb-6">
                            {confirmDelete.label}
                        </p>
                        <div className="flex gap-3">
                            <button type="button" onClick={() => setConfirmDelete(null)}
                                className="flex-1 h-11 rounded-xl border border-border font-semibold hover:bg-muted transition-colors text-sm">
                                {t('profile.cancel')}
                            </button>
                            <button type="button" onClick={handleConfirmDelete} disabled={isSubmitting}
                                className="flex-1 h-11 bg-destructive text-destructive-foreground rounded-xl font-bold hover:bg-destructive/90 transition-colors shadow-lg shadow-destructive/20 disabled:opacity-50 flex items-center justify-center gap-2 text-sm">
                                {isSubmitting && <Loader2 size={16} className="animate-spin" />}
                                {t('admin.users.deleteBtn')}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

interface RegisterUserModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (userData: typeof DEFAULT_NEW_USER) => Promise<void>;
    error: string | null;
    isSubmitting: boolean;
    divisions: GeoEntity[];
    ranges: GeoRange[];
    beats: GeoBeat[];
    onRangeChange: (rangeId: string) => void | Promise<void>;
    ROLES: typeof ROLES;
    GEOGRAPHIC_ROLES: readonly string[];
    t: (key: string) => string;
}

function RegisterUserModal({
    isOpen,
    onClose,
    onSubmit,
    error,
    isSubmitting,
    divisions,
    ranges,
    beats,
    onRangeChange,
    ROLES,
    GEOGRAPHIC_ROLES,
    t
}: RegisterUserModalProps) {
    const [newUser, setNewUser] = useState(DEFAULT_NEW_USER);
    const [volunteerFullName, setVolunteerFullName] = useState('');

    useEffect(() => {
        if (!isOpen) {
            setNewUser(DEFAULT_NEW_USER);
            setVolunteerFullName('');
        }
    }, [isOpen]);

    const filteredRanges = ranges.filter(r => r.division_id === newUser.division_id);
    const filteredBeats = beats.filter(b => !newUser.range_id || b.range_id === newUser.range_id);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        void onSubmit(newUser);
    };

    if (!isOpen) return null;

    const needsBeat = newUser.role === 'volunteer' || newUser.role === 'beat_guard';
    const needsRange = needsBeat || newUser.role === 'range_officer';
    const needsTerritory =
        newUser.role === 'volunteer' || (GEOGRAPHIC_ROLES as readonly string[]).includes(newUser.role);

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div initial={{ scale: 0.93, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
                <h2 className="text-xl font-bold mb-1">{t('admin.users.registerPersonnel')}</h2>
                <p className="text-sm text-muted-foreground mb-6">{t('admin.users.registerDesc')}</p>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {newUser.role === 'volunteer' ? (
                        <div>
                            <label className="text-xs font-semibold text-muted-foreground mb-1 block">{t('volunteer.onboardName')}</label>
                            <input
                                required
                                maxLength={200}
                                placeholder={t('volunteer.onboardNamePlaceholder')}
                                value={volunteerFullName}
                                onChange={e => {
                                    const val = e.target.value;
                                    setVolunteerFullName(val);
                                    const parts = val.trim().split(/\s+/);
                                    setNewUser({
                                        ...newUser,
                                        first_name: parts[0] || '',
                                        last_name: parts.slice(1).join(' '),
                                    });
                                }}
                                className="w-full p-3 rounded-xl bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                            />
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-semibold text-muted-foreground mb-1 block">{t('profile.firstName')}</label>
                                <input required maxLength={100} value={newUser.first_name} onChange={e => setNewUser({ ...newUser, first_name: e.target.value })}
                                    className="w-full p-3 rounded-xl bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-muted-foreground mb-1 block">{t('profile.lastName')}</label>
                                <input required maxLength={100} value={newUser.last_name} onChange={e => setNewUser({ ...newUser, last_name: e.target.value })}
                                    className="w-full p-3 rounded-xl bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="text-xs font-semibold text-muted-foreground mb-1 block">{t('profile.phoneNumber')}</label>
                        <input type="tel" required maxLength={20} value={newUser.phone} onChange={e => setNewUser({ ...newUser, phone: e.target.value })} placeholder="+91 98765 43210"
                            className="w-full p-3 rounded-xl bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-muted-foreground mb-1 block">{t('admin.users.systemRole')}</label>
                        <select value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value, division_id: '', range_id: '', beat_id: '' })}
                            className="w-full p-3 rounded-xl bg-muted/50 border border-border text-sm">
                            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                    </div>

                    <LocationFields
                        value={{ latitude: newUser.latitude, longitude: newUser.longitude }}
                        onChange={(loc) => setNewUser({ ...newUser, latitude: loc.latitude, longitude: loc.longitude })}
                        required={newUser.role === 'volunteer'}
                    />

                    {needsTerritory && (
                        <div className="space-y-3 p-4 bg-primary/5 rounded-2xl border border-primary/10">
                            <p className="text-xs font-bold text-primary flex items-center gap-2"><MapPin size={12} /> {t('admin.users.assignTerritory')}</p>
                            <select required value={newUser.division_id} onChange={e => setNewUser({ ...newUser, division_id: e.target.value, range_id: '', beat_id: '' })}
                                className="w-full p-3 rounded-xl bg-background border border-border text-sm">
                                <option value="">{t('admin.users.selectDivision')}</option>
                                {divisions.map(d => <option key={d.id} value={d.id}>{d.name} {d.code ? `(${d.code})` : ''}</option>)}
                            </select>
                            {needsRange && (
                                <select required value={newUser.range_id} disabled={!newUser.division_id}
                                    onChange={e => {
                                        const rangeId = e.target.value;
                                        setNewUser({ ...newUser, range_id: rangeId, beat_id: '' });
                                        void onRangeChange(rangeId);
                                    }}
                                    className="w-full p-3 rounded-xl bg-background border border-border text-sm disabled:opacity-40">
                                    <option value="">{t('admin.users.selectRange')}</option>
                                    {filteredRanges.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                </select>
                            )}
                            {needsBeat && (
                                <select required value={newUser.beat_id} disabled={!newUser.range_id}
                                    onChange={e => setNewUser({ ...newUser, beat_id: e.target.value })}
                                    className="w-full p-3 rounded-xl bg-background border border-border text-sm disabled:opacity-40">
                                    <option value="">{t('admin.users.selectBeat')}</option>
                                    {filteredBeats.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                </select>
                            )}
                        </div>
                    )}

                    {error && (
                        <div className="bg-destructive/10 border border-destructive/20 text-destructive p-3.5 rounded-xl flex items-center gap-3 text-sm">
                            <AlertTriangle size={16} className="shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose}
                            className="flex-1 h-12 rounded-xl border border-border font-semibold hover:bg-muted transition-colors text-sm">
                            {t('profile.cancel')}
                        </button>
                        <button type="submit" disabled={isSubmitting}
                            className="flex-1 h-12 bg-primary text-primary-foreground rounded-xl font-bold shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 text-sm">
                            {isSubmitting && <Loader2 size={16} className="animate-spin" />}
                            {isSubmitting ? t('admin.users.registering') : t('admin.users.registerBtn')}
                        </button>
                    </div>
                </form>
            </motion.div>
        </div>
    );
}

interface EditUserModalProps {
    user: Profile & { division_id?: string, range_id?: string, beat_id?: string } | null;
    onClose: () => void;
    onSubmit: (userData: Profile & { division_id?: string, range_id?: string, beat_id?: string }) => Promise<void>;
    error: string | null;
    isSubmitting: boolean;
    divisions: GeoEntity[];
    ranges: GeoRange[];
    beats: GeoBeat[];
    onRangeChange: (rangeId: string) => void | Promise<void>;
    ROLES: typeof ROLES;
    GEOGRAPHIC_ROLES: readonly string[];
    currentUserProfile: UserProfile | null;
    t: (key: string) => string;
}

function EditUserModal({
    user,
    onClose,
    onSubmit,
    error,
    isSubmitting,
    divisions,
    ranges,
    beats,
    onRangeChange,
    ROLES,
    GEOGRAPHIC_ROLES,
    currentUserProfile,
    t
}: EditUserModalProps) {
    const [editUser, setEditUser] = useState<Profile & { division_id?: string, range_id?: string, beat_id?: string } | null>(null);

    useEffect(() => {
        if (user) {
            setEditUser({ ...user });
        } else {
            setEditUser(null);
        }
    }, [user]);

    if (!user || !editUser) return null;

    const filteredRanges = ranges.filter(r => r.division_id === editUser.division_id);
    const filteredBeats = beats.filter(b => !editUser.range_id || b.range_id === editUser.range_id);
    const needsBeat = editUser.role === 'volunteer' || editUser.role === 'beat_guard';
    const needsRange = needsBeat || editUser.role === 'range_officer';
    const needsTerritory =
        editUser.role === 'volunteer' || (GEOGRAPHIC_ROLES as readonly string[]).includes(editUser.role || '');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        void onSubmit(editUser);
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div initial={{ scale: 0.93, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
                <h2 className="text-xl font-bold mb-1">{t('admin.users.editPersonnel')}</h2>
                <p className="text-sm text-muted-foreground mb-6">{t('admin.users.editDesc')}</p>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-semibold text-muted-foreground mb-1 block">{t('profile.firstName')}</label>
                            <input required maxLength={100} value={editUser.first_name || ''} onChange={e => setEditUser({ ...editUser, first_name: e.target.value })}
                                className="w-full p-3 rounded-xl bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-muted-foreground mb-1 block">{t('profile.lastName')}</label>
                            <input required maxLength={100} value={editUser.last_name || ''} onChange={e => setEditUser({ ...editUser, last_name: e.target.value })}
                                className="w-full p-3 rounded-xl bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-semibold text-muted-foreground mb-1 block">{t('profile.phoneNumber')}</label>
                        <input type="tel" required maxLength={20} value={editUser.phone || ''} onChange={e => setEditUser({ ...editUser, phone: e.target.value })} placeholder="+91 98765 43210"
                            className="w-full p-3 rounded-xl bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-muted-foreground mb-1 block">{t('admin.users.systemRole')}</label>
                        <select value={editUser.role || ''} onChange={e => setEditUser({ ...editUser, role: e.target.value, division_id: '', range_id: '', beat_id: '' })}
                            className="w-full p-3 rounded-xl bg-muted/50 border border-border text-sm">
                            {ROLES.filter(r =>
                                editUser.id === currentUserProfile?.id
                                    ? true
                                    : canManageRole(currentUserProfile?.role, r.value)
                            ).map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                    </div>

                    {needsTerritory && (
                        <div className="space-y-3 p-4 bg-primary/5 rounded-2xl border border-primary/10">
                            <p className="text-xs font-bold text-primary flex items-center gap-2"><MapPin size={12} /> {t('admin.users.assignTerritory')}</p>
                            <select required value={editUser.division_id || ''} onChange={e => setEditUser({ ...editUser, division_id: e.target.value, range_id: '', beat_id: '' })}
                                className="w-full p-3 rounded-xl bg-background border border-border text-sm">
                                <option value="">{t('admin.users.selectDivision')}</option>
                                {divisions.map(d => <option key={d.id} value={d.id}>{d.name} {d.code ? `(${d.code})` : ''}</option>)}
                            </select>
                            {needsRange && (
                                <select required value={editUser.range_id || ''} disabled={!editUser.division_id}
                                    onChange={e => {
                                        const rangeId = e.target.value;
                                        setEditUser({ ...editUser, range_id: rangeId, beat_id: '' });
                                        void onRangeChange(rangeId);
                                    }}
                                    className="w-full p-3 rounded-xl bg-background border border-border text-sm disabled:opacity-40">
                                    <option value="">{t('admin.users.selectRange')}</option>
                                    {filteredRanges.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                </select>
                            )}
                            {needsBeat && (
                                <select required value={editUser.beat_id || ''} disabled={!editUser.range_id}
                                    onChange={e => setEditUser({ ...editUser, beat_id: e.target.value })}
                                    className="w-full p-3 rounded-xl bg-background border border-border text-sm disabled:opacity-40">
                                    <option value="">{t('admin.users.selectBeat')}</option>
                                    {filteredBeats.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                </select>
                            )}
                        </div>
                    )}

                    {error && (
                        <div className="bg-destructive/10 border border-destructive/20 text-destructive p-3.5 rounded-xl flex items-center gap-3 text-sm">
                            <AlertTriangle size={16} className="shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose}
                            className="flex-1 h-12 rounded-xl border border-border font-semibold hover:bg-muted transition-colors text-sm">
                            {t('profile.cancel')}
                        </button>
                        <button type="submit" disabled={isSubmitting}
                            className="flex-1 h-12 bg-primary text-primary-foreground rounded-xl font-bold shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 text-sm">
                            {isSubmitting && <Loader2 size={16} className="animate-spin" />}
                            {isSubmitting ? t('admin.users.updating') : t('admin.settings.saveChanges')}
                        </button>
                    </div>
                </form>
            </motion.div>
        </div>
    );
}
