import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Search, UserPlus, Loader2, AlertTriangle, MapPin, ChevronRight, Shield, Edit2, Trash2 } from 'lucide-react';
import { supabase } from '../../supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';

interface Profile {
    id: string;
    role: string;
    first_name: string;
    last_name: string;
    phone?: string;
    is_active: boolean;
    status?: string;
    created_at: string;
    // Joined
    email?: string;
    beat_name?: string;
    range_name?: string;
    division_name?: string;
    user_region_assignments?: any[];
}

interface GeoEntity { id: string; name: string; code?: string; }
interface GeoRange extends GeoEntity { division_id: string; }
interface GeoBeat extends GeoEntity { range_id: string; }

const DEFAULT_NEW_USER = {
    first_name: '', last_name: '', email: '', password: '', phone: '',
    role: 'volunteer', division_id: '', range_id: '', beat_id: '',
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

const GEOGRAPHIC_ROLES = ['dfo', 'rrt', 'range_officer', 'beat_guard'];

const ROLE_HIERARCHY: Record<string, string[]> = {
    admin: ['*'],
    ccf: ['*'],
    biologist: [],
    veterinarian: [],
    dfo: ['range_officer', 'beat_guard'],
    rrt: ['beat_guard'],
    range_officer: ['beat_guard'],
    beat_guard: [],
    volunteer: []
};

const canManageRole = (callerRole?: string, targetRole?: string) => {
    if (!callerRole || !targetRole) return false;
    const allowed = ROLE_HIERARCHY[callerRole];
    if (!allowed) return false;
    if (allowed.includes('*')) return true;
    return allowed.includes(targetRole);
};

export default function AdminUsers() {
    const { profile: currentUserProfile } = useAuth();
    const { t } = useLanguage();
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [divisions, setDivisions] = useState<GeoEntity[]>([]);
    const [ranges, setRanges] = useState<GeoRange[]>([]);
    const [beats, setBeats] = useState<GeoBeat[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editUser, setEditUser] = useState<Profile & { password?: string, division_id?: string, range_id?: string, beat_id?: string } | null>(null);
    const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [newUser, setNewUser] = useState(DEFAULT_NEW_USER);
    const [toast, setToast] = useState<string | null>(null);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            // Fetch profiles with region assignment
            const { data: profileData, error: pErr } = await supabase
                .from('profiles')
                .select(`
                    *,
                    user_region_assignments (
                        division_id, range_id, beat_id,
                        geo_divisions (name),
                        geo_ranges (name),
                        geo_beats (name)
                    )
                `)
                .order('created_at', { ascending: false });

            if (pErr) throw pErr;

            // Flatten assignments into profile objects
            const flat: Profile[] = (profileData || []).map((p: any) => ({
                ...p,
                division_name: p.user_region_assignments?.[0]?.geo_divisions?.name ?? null,
                range_name: p.user_region_assignments?.[0]?.geo_ranges?.name ?? null,
                beat_name: p.user_region_assignments?.[0]?.geo_beats?.name ?? null,
            }));
            setProfiles(flat);

            // Fetch geography
            const [{ data: divData }, { data: ranData }, { data: beaData }] = await Promise.all([
                supabase.from('geo_divisions').select('id, name, code').order('name'),
                supabase.from('geo_ranges').select('id, name, code, division_id').order('name'),
                supabase.from('geo_beats').select('id, name, code, range_id').order('name'),
            ]);
            setDivisions(divData || []);
            setRanges(ranData || []);
            setBeats(beaData || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('Not authenticated');

            const { data, error: fnErr } = await supabase.functions.invoke('create-user', {
                body: newUser,
                headers: { Authorization: `Bearer ${session.access_token}` },
            });

            if (fnErr) throw fnErr;
            if (data?.error) throw new Error(data.error);

            setShowModal(false);
            setNewUser(DEFAULT_NEW_USER);
            setToast('Personnel registered successfully');
            setTimeout(() => setToast(null), 3000);
            await fetchData();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create personnel');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editUser) return;
        setIsSubmitting(true);
        setError(null);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('Not authenticated');

            const { data, error: fnErr } = await supabase.functions.invoke('update-user', {
                body: editUser,
                headers: { Authorization: `Bearer ${session.access_token}` },
            });

            if (fnErr) throw fnErr;
            if (data?.error) throw new Error(data.error);

            setEditUser(null);
            setToast('Personnel updated successfully');
            setTimeout(() => setToast(null), 3000);
            await fetchData();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update personnel');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteUserId) return;
        setIsSubmitting(true);
        setError(null);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('Not authenticated');

            const { data, error: fnErr } = await supabase.functions.invoke('delete-user', {
                body: { id: deleteUserId },
                headers: { Authorization: `Bearer ${session.access_token}` },
            });

            if (fnErr) throw fnErr;
            if (data?.error) throw new Error(data.error);

            setDeleteUserId(null);
            setToast('Personnel deleted successfully');
            setTimeout(() => setToast(null), 3000);
            await fetchData();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete personnel');
        } finally {
            setIsSubmitting(false);
        }
    };

    const filtered = useMemo(() =>
        profiles.filter(p => `${p.first_name} ${p.last_name}`.toLowerCase().includes(search.toLowerCase())),
        [profiles, search]
    );

    const filteredRanges = ranges.filter(r => r.division_id === (editUser ? editUser.division_id : newUser.division_id));
    const filteredBeats = beats.filter(b => b.range_id === (editUser ? editUser.range_id : newUser.range_id));

    // Determine if the current user can create ANY user types based on their role
    const canCreateAnyUser = currentUserProfile?.role && Object.values(ROLES).some(r => canManageRole(currentUserProfile.role, r.value));

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{t('au_personnel_hierarchy')}</h1>
                    <p className="text-sm text-muted-foreground mt-1">{t('au_manage_staff')}</p>
                </div>
                {canCreateAnyUser && (
                    <button onClick={() => setShowModal(true)}
                        className="bg-primary text-primary-foreground h-11 px-6 rounded-xl flex items-center gap-2 font-semibold shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all">
                        <UserPlus size={18} /> {t('au_register_personnel')}
                    </button>
                )}
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
                <input placeholder={t('au_search_placeholder')} value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>

            <div className="glass-card rounded-2xl overflow-hidden border border-border/50">
                {loading ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-20">
                        <Loader2 className="animate-spin text-primary" size={28} />
                        <p className="text-sm text-muted-foreground">{t('au_loading')}</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-muted/40 border-b border-border">
                                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('au_name')}</th>
                                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('au_contact')}</th>
                                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('au_role')}</th>
                                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('au_territory')}</th>
                                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('au_status')}</th>
                                    <th className="p-4 text-xs font-bold uppercase tracking-wider text-muted-foreground text-right">{t('au_actions')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/40">
                                {filtered.length === 0 ? (
                                    <tr><td colSpan={5} className="text-center py-16 text-muted-foreground">{t('au_no_personnel')}</td></tr>
                                ) : filtered.map((p, i) => (
                                    <motion.tr key={p.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.04 }} className="hover:bg-muted/20 group transition-colors">
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
                                        <td className="p-4">
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-sm">{p.email || 'N/A'}</span>
                                                {p.phone && <span className="text-xs text-muted-foreground">{p.phone}</span>}
                                            </div>
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
                                            {(p.beat_name && (p.range_name || p.division_name)) && (
                                                <p className="text-[10px] text-muted-foreground pl-5 mt-0.5 flex items-center gap-1">
                                                    {p.division_name} <ChevronRight size={8} /> {p.range_name}
                                                </p>
                                            )}
                                        </td>
                                        <td className="p-4">
                                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${p.is_active ? 'bg-emerald-500/15 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>
                                                {p.is_active ? t('au_active') : t('au_inactive')}
                                            </span>
                                        </td>
                                        <td className="p-4 text-right">
                                            {canManageRole(currentUserProfile?.role, p.role) && (
                                                <div className="flex items-center justify-end gap-2">
                                                    <button onClick={() => setEditUser({
                                                        ...p,
                                                        division_id: p.user_region_assignments?.[0]?.division_id || '',
                                                        range_id: p.user_region_assignments?.[0]?.range_id || '',
                                                        beat_id: p.user_region_assignments?.[0]?.beat_id || '',
                                                        password: '' // empty indicates no password change
                                                    } as any)}
                                                        className="p-2 text-muted-foreground hover:text-primary bg-muted/30 hover:bg-primary/10 rounded-lg transition-colors"
                                                        title="Edit">
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button onClick={() => setDeleteUserId(p.id)}
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
                )}
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <motion.div initial={{ scale: 0.93, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                        className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
                        <h2 className="text-xl font-bold mb-1">{t('au_register_personnel')}</h2>
                        <p className="text-sm text-muted-foreground mb-6">{t('au_create_account')}</p>

                        <form onSubmit={handleCreate} className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-semibold text-muted-foreground mb-1 block">{t('first_name')}</label>
                                    <input required value={newUser.first_name} onChange={e => setNewUser({ ...newUser, first_name: e.target.value })}
                                        className="w-full p-3 rounded-xl bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-muted-foreground mb-1 block">{t('last_name')}</label>
                                    <input required value={newUser.last_name} onChange={e => setNewUser({ ...newUser, last_name: e.target.value })}
                                        className="w-full p-3 rounded-xl bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-semibold text-muted-foreground mb-1 block">{t('email')}</label>
                                    <input type="email" required value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                                        className="w-full p-3 rounded-xl bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-muted-foreground mb-1 block">{t('au_password')}</label>
                                    <input type="password" required minLength={6} value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                                        className="w-full p-3 rounded-xl bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-muted-foreground mb-1 block">{t('phone_number')}</label>
                                <input type="tel" value={newUser.phone} onChange={e => setNewUser({ ...newUser, phone: e.target.value })} placeholder="Optional"
                                    className="w-full p-3 rounded-xl bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-muted-foreground mb-1 block">{t('au_system_role')}</label>
                                <select value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value, division_id: '', range_id: '', beat_id: '' })}
                                    className="w-full p-3 rounded-xl bg-muted/50 border border-border text-sm">
                                    {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                </select>
                            </div>

                            {GEOGRAPHIC_ROLES.includes(newUser.role) && (
                                <div className="space-y-3 p-4 bg-primary/5 rounded-2xl border border-primary/10">
                                    <p className="text-xs font-bold text-primary flex items-center gap-2"><MapPin size={12} /> {t('au_assign_territory')}</p>
                                    <select required value={newUser.division_id} onChange={e => setNewUser({ ...newUser, division_id: e.target.value, range_id: '', beat_id: '' })}
                                        className="w-full p-3 rounded-xl bg-background border border-border text-sm">
                                        <option value="">{t('au_select_division')}</option>
                                        {divisions.map(d => <option key={d.id} value={d.id}>{d.name} {d.code ? `(${d.code})` : ''}</option>)}
                                    </select>
                                    {['range_officer', 'beat_guard'].includes(newUser.role) && (
                                        <select required value={newUser.range_id} disabled={!newUser.division_id} onChange={e => setNewUser({ ...newUser, range_id: e.target.value, beat_id: '' })}
                                            className="w-full p-3 rounded-xl bg-background border border-border text-sm disabled:opacity-40">
                                            <option value="">{t('au_select_range')}</option>
                                            {filteredRanges.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                        </select>
                                    )}
                                    {newUser.role === 'beat_guard' && (
                                        <select required value={newUser.beat_id} disabled={!newUser.range_id} onChange={e => setNewUser({ ...newUser, beat_id: e.target.value })}
                                            className="w-full p-3 rounded-xl bg-background border border-border text-sm disabled:opacity-40">
                                            <option value="">{t('au_select_beat')}</option>
                                            {filteredBeats.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                        </select>
                                    )}
                                </div>
                            )}

                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setShowModal(false)}
                                    className="flex-1 h-12 rounded-xl border border-border font-semibold hover:bg-muted transition-colors text-sm">
                                    {t('cancel')}
                                </button>
                                <button type="submit" disabled={isSubmitting}
                                    className="flex-1 h-12 bg-primary text-primary-foreground rounded-xl font-bold shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 text-sm">
                                    {isSubmitting && <Loader2 size={16} className="animate-spin" />}
                                    {isSubmitting ? t('au_registering') : t('au_register_assign')}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}

            {editUser && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <motion.div initial={{ scale: 0.93, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                        className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
                        <h2 className="text-xl font-bold mb-1">{t('au_edit_personnel')}</h2>
                        <p className="text-sm text-muted-foreground mb-6">{t('au_modify_details')}</p>

                        <form onSubmit={handleUpdate} className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-semibold text-muted-foreground mb-1 block">{t('first_name')}</label>
                                    <input required value={editUser.first_name || ''} onChange={e => setEditUser({ ...editUser, first_name: e.target.value })}
                                        className="w-full p-3 rounded-xl bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-muted-foreground mb-1 block">{t('last_name')}</label>
                                    <input required value={editUser.last_name || ''} onChange={e => setEditUser({ ...editUser, last_name: e.target.value })}
                                        className="w-full p-3 rounded-xl bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-semibold text-muted-foreground mb-1 block">{t('au_email_no_edit')}</label>
                                    <input type="email" disabled value={editUser.email || ''}
                                        className="w-full p-3 rounded-xl bg-muted border border-border text-sm opacity-60 cursor-not-allowed" />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-muted-foreground mb-1 block">{t('au_new_password')}</label>
                                    <input type="password" minLength={6} value={editUser.password || ''} onChange={e => setEditUser({ ...editUser, password: e.target.value })}
                                        placeholder={t('au_leave_blank')}
                                        className="w-full p-3 rounded-xl bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-muted-foreground mb-1 block">{t('phone_number')}</label>
                                <input type="tel" value={editUser.phone || ''} onChange={e => setEditUser({ ...editUser, phone: e.target.value })} placeholder="Optional"
                                    className="w-full p-3 rounded-xl bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-muted-foreground mb-1 block">{t('au_system_role')}</label>
                                <select value={editUser.role || ''} onChange={e => setEditUser({ ...editUser, role: e.target.value, division_id: '', range_id: '', beat_id: '' })}
                                    className="w-full p-3 rounded-xl bg-muted/50 border border-border text-sm">
                                    {ROLES.filter(r => canManageRole(currentUserProfile?.role, r.value)).map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                </select>
                            </div>

                            {GEOGRAPHIC_ROLES.includes(editUser.role) && (
                                <div className="space-y-3 p-4 bg-primary/5 rounded-2xl border border-primary/10">
                                    <p className="text-xs font-bold text-primary flex items-center gap-2"><MapPin size={12} /> {t('au_assign_territory')}</p>
                                    <select required value={editUser.division_id || ''} onChange={e => setEditUser({ ...editUser, division_id: e.target.value, range_id: '', beat_id: '' })}
                                        className="w-full p-3 rounded-xl bg-background border border-border text-sm">
                                        <option value="">{t('au_select_division')}</option>
                                        {divisions.map(d => <option key={d.id} value={d.id}>{d.name} {d.code ? `(${d.code})` : ''}</option>)}
                                    </select>
                                    {['range_officer', 'beat_guard'].includes(editUser.role) && (
                                        <select required value={editUser.range_id || ''} disabled={!editUser.division_id} onChange={e => setEditUser({ ...editUser, range_id: e.target.value, beat_id: '' })}
                                            className="w-full p-3 rounded-xl bg-background border border-border text-sm disabled:opacity-40">
                                            <option value="">{t('au_select_range')}</option>
                                            {filteredRanges.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                        </select>
                                    )}
                                    {editUser.role === 'beat_guard' && (
                                        <select required value={editUser.beat_id || ''} disabled={!editUser.range_id} onChange={e => setEditUser({ ...editUser, beat_id: e.target.value })}
                                            className="w-full p-3 rounded-xl bg-background border border-border text-sm disabled:opacity-40">
                                            <option value="">{t('au_select_beat')}</option>
                                            {filteredBeats.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                        </select>
                                    )}
                                </div>
                            )}

                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setEditUser(null)}
                                    className="flex-1 h-12 rounded-xl border border-border font-semibold hover:bg-muted transition-colors text-sm">
                                    {t('cancel')}
                                </button>
                                <button type="submit" disabled={isSubmitting}
                                    className="flex-1 h-12 bg-primary text-primary-foreground rounded-xl font-bold shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 text-sm">
                                    {isSubmitting && <Loader2 size={16} className="animate-spin" />}
                                    {isSubmitting ? t('au_updating') : t('save_changes')}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}

            {deleteUserId && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                        className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                        <div className="flex justify-center mb-4">
                            <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                                <Trash2 className="text-destructive" size={24} />
                            </div>
                        </div>
                        <h2 className="text-xl font-bold text-center mb-2">{t('au_delete_title')}</h2>
                        <p className="text-sm text-center text-muted-foreground mb-6">
                            {t('au_delete_desc')}
                        </p>
                        <div className="flex gap-3">
                            <button type="button" onClick={() => setDeleteUserId(null)}
                                className="flex-1 h-11 rounded-xl border border-border font-semibold hover:bg-muted transition-colors text-sm">
                                {t('cancel')}
                            </button>
                            <button type="button" onClick={handleDelete} disabled={isSubmitting}
                                className="flex-1 h-11 bg-destructive text-destructive-foreground rounded-xl font-bold hover:bg-destructive/90 transition-colors shadow-lg shadow-destructive/20 disabled:opacity-50 flex items-center justify-center gap-2 text-sm">
                                {isSubmitting && <Loader2 size={16} className="animate-spin" />}
                                {t('ao_delete')}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
}
