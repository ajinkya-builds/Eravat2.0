import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Layers, ChevronDown, ChevronRight, MapPin, Loader2,
    AlertTriangle, Check, Building2, TreePine, Shield, Search, X
} from 'lucide-react';
import { supabase } from '../../supabase';
import { useLanguage } from '../../contexts/LanguageContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GeoDivision { id: string; name: string; code: string | null; state: string | null; }
interface GeoRange { id: string; name: string; code: string | null; division_id: string; }
interface GeoBeat { id: string; name: string; code: string | null; range_id: string; }

interface OfficerOption { id: string; label: string; role: string; }

type ContactMap = Record<string, string>;   // geoId → userId
type SaveState = Record<string, 'saving' | 'saved'>;

// ─── Searchable Combobox ──────────────────────────────────────────────────────

interface SearchableComboboxProps {
    value: string;
    options: OfficerOption[];
    placeholder: string;
    onChange: (userId: string) => void;
}

function SearchableCombobox({ value, options, placeholder, onChange }: SearchableComboboxProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const selected = options.find(o => o.id === value);
    const filtered = options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()));

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
                setQuery('');
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleOpen = () => {
        setQuery('');
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
    };

    const handleSelect = (id: string) => {
        onChange(id);
        setOpen(false);
        setQuery('');
    };

    const handleClear = (e: React.MouseEvent) => {
        e.stopPropagation();
        onChange('');
        setOpen(false);
    };

    return (
        <div ref={containerRef} className="relative min-w-0 flex-1">
            {/* Trigger */}
            <div
                onClick={handleOpen}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs rounded-lg bg-background border border-border cursor-pointer hover:border-primary/40 transition-colors select-none"
            >
                <Search size={12} className="text-muted-foreground shrink-0" />
                <span className={`flex-1 truncate ${selected ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                    {selected ? selected.label : placeholder}
                </span>
                {selected
                    ? <X size={12} className="text-muted-foreground hover:text-destructive shrink-0" onClick={handleClear} />
                    : <ChevronDown size={12} className="text-muted-foreground shrink-0" />
                }
            </div>

            {/* Dropdown */}
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: -4, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.98 }}
                        transition={{ duration: 0.12 }}
                        className="absolute top-full mt-1 left-0 right-0 z-50 bg-card border border-border rounded-xl shadow-xl overflow-hidden"
                        style={{ minWidth: '200px' }}
                    >
                        {/* Search input */}
                        <div className="p-2 border-b border-border">
                            <div className="flex items-center gap-2 px-2 py-1.5 bg-muted rounded-lg">
                                <Search size={12} className="text-muted-foreground shrink-0" />
                                <input
                                    ref={inputRef}
                                    value={query}
                                    onChange={e => setQuery(e.target.value)}
                                    placeholder="Type to search..."
                                    className="flex-1 bg-transparent text-xs outline-none text-foreground placeholder:text-muted-foreground"
                                />
                            </div>
                        </div>

                        {/* Options list */}
                        <div className="max-h-48 overflow-y-auto">
                            {filtered.length === 0 ? (
                                <p className="text-xs text-muted-foreground text-center py-4">No officers found</p>
                            ) : (
                                filtered.map(opt => (
                                    <button
                                        key={opt.id}
                                        onClick={() => handleSelect(opt.id)}
                                        className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors text-left ${value === opt.id ? 'bg-primary/10 font-semibold text-primary' : ''}`}
                                    >
                                        {value === opt.id && <Check size={11} className="shrink-0" />}
                                        <span className="truncate">{opt.label}</span>
                                    </button>
                                ))
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ─── Territory Row ────────────────────────────────────────────────────────────

interface TerritoryRowProps {
    geoId: string;
    level: 'division' | 'range' | 'beat';
    label: string;
    code?: string | null;
    meta?: string | null;
    officers: OfficerOption[];
    selectedUserId: string;
    roleLabel: string;
    savingState: SaveState;
    expanded?: boolean;
    hasChildren?: boolean;
    onToggle?: () => void;
    onChange: (geoId: string, userId: string) => void;
    onSave: (geoId: string) => void;
    delay?: number;
}

function TerritoryRow({
    geoId, level, label, code, meta, officers, selectedUserId,
    roleLabel, savingState, expanded, hasChildren, onToggle, onChange, onSave, delay = 0
}: TerritoryRowProps) {
    const isSaving = savingState[geoId] === 'saving';
    const isSaved = savingState[geoId] === 'saved';

    const levelStyles = {
        division: { indent: 'pl-0', iconBg: 'bg-violet-500/10', iconColor: 'text-violet-600', icon: Building2, badge: 'bg-violet-500/10 text-violet-600 border-violet-500/20', rowBg: 'bg-card' },
        range: { indent: 'pl-5', iconBg: 'bg-blue-500/10', iconColor: 'text-blue-600', icon: MapPin, badge: 'bg-blue-500/10 text-blue-600 border-blue-500/20', rowBg: 'bg-muted/20' },
        beat: { indent: 'pl-10', iconBg: 'bg-emerald-500/10', iconColor: 'text-emerald-600', icon: TreePine, badge: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', rowBg: 'bg-muted/10' },
    }[level];
    const Icon = levelStyles.icon;

    return (
        <motion.tr
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay }}
            className={`group border-b border-border/30 hover:bg-primary/5 transition-colors ${levelStyles.rowBg}`}
        >
            {/* Territory name cell */}
            <td className={`py-2.5 pr-4 ${levelStyles.indent}`}>
                <div className="flex items-center gap-2">
                    {/* Expand toggle */}
                    <button
                        onClick={onToggle}
                        className={`p-0.5 rounded text-muted-foreground transition-colors ${hasChildren ? 'hover:bg-muted cursor-pointer' : 'opacity-0 cursor-default pointer-events-none'}`}
                    >
                        {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    </button>
                    <div className={`p-1.5 rounded-md shrink-0 ${levelStyles.iconBg}`}>
                        <Icon size={12} className={levelStyles.iconColor} />
                    </div>
                    <div className="min-w-0">
                        <span className="text-sm font-semibold text-foreground truncate">{label}</span>
                        {meta && <span className="text-[11px] text-muted-foreground ml-1.5">{meta}</span>}
                    </div>
                    {code && (
                        <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded-full border ${levelStyles.badge} shrink-0`}>
                            {code}
                        </span>
                    )}
                </div>
            </td>

            {/* Contact type cell */}
            <td className="py-2.5 pr-4 w-32">
                <span className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-full border ${levelStyles.badge}`}>
                    <Shield size={9} /> {roleLabel}
                </span>
            </td>

            {/* Searchable select cell */}
            <td className="py-2.5 pr-3 w-64">
                <SearchableCombobox
                    value={selectedUserId}
                    options={officers}
                    placeholder={`Search ${roleLabel}…`}
                    onChange={(uid) => onChange(geoId, uid)}
                />
            </td>

            {/* Save button cell */}
            <td className="py-2.5 w-20">
                <button
                    onClick={() => onSave(geoId)}
                    disabled={isSaving || !selectedUserId}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-primary text-primary-foreground disabled:opacity-40 hover:bg-primary/90 active:scale-95 transition-all shadow-sm shadow-primary/20 whitespace-nowrap"
                >
                    {isSaving ? <Loader2 size={11} className="animate-spin" /> : isSaved ? <Check size={11} /> : null}
                    {isSaving ? 'Saving' : isSaved ? 'Saved!' : 'Save'}
                </button>
            </td>
        </motion.tr>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminDivisions() {
    const [divisions, setDivisions] = useState<GeoDivision[]>([]);
    const [ranges, setRanges] = useState<GeoRange[]>([]);
    const [beats, setBeats] = useState<GeoBeat[]>([]);
    const [dfos, setDfos] = useState<OfficerOption[]>([]);
    const [rangeOfficers, setRangeOfficers] = useState<OfficerOption[]>([]);
    const [beatGuards, setBeatGuards] = useState<OfficerOption[]>([]);
    const [divisionContacts, setDivisionContacts] = useState<ContactMap>({});
    const [rangeContacts, setRangeContacts] = useState<ContactMap>({});
    const [beatContacts, setBeatContacts] = useState<ContactMap>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedDivisions, setExpandedDivisions] = useState<Set<string>>(new Set());
    const [expandedRanges, setExpandedRanges] = useState<Set<string>>(new Set());
    const [savingState, setSavingState] = useState<SaveState>({});
    const [globalSearch, setGlobalSearch] = useState('');
    const { t } = useLanguage();

    // ── Fetch ────────────────────────────────────────────────────────────────

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [
                { data: divData, error: divErr },
                { data: ranData, error: ranErr },
                { data: beaData, error: beaErr },
            ] = await Promise.all([
                supabase.from('geo_divisions').select('id, name, code, state').order('name'),
                supabase.from('geo_ranges').select('id, name, code, division_id').order('name'),
                supabase.from('geo_beats').select('id, name, code, range_id').order('name'),
            ]);
            if (divErr) throw divErr;
            if (ranErr) throw ranErr;
            if (beaErr) throw beaErr;
            setDivisions(divData || []);
            setRanges(ranData || []);
            setBeats(beaData || []);

            // Profiles with all assignments (not just primary)
            const { data: profileData, error: pErr } = await supabase
                .from('profiles')
                .select(`
                    id, first_name, last_name, role,
                    user_region_assignments (
                        id, division_id, range_id, beat_id, is_primary_contact
                    )
                `)
                .in('role', ['dfo', 'range_officer', 'beat_guard'])
                .eq('is_active', true)
                .order('first_name');
            if (pErr) throw pErr;

            const dfoList: OfficerOption[] = [];
            const roList: OfficerOption[] = [];
            const bgList: OfficerOption[] = [];

            // Use priority: is_primary_contact=true beats any regular assignment
            const divMap: Record<string, { userId: string; isPrimary: boolean }> = {};
            const ranMap: Record<string, { userId: string; isPrimary: boolean }> = {};
            const beaMap: Record<string, { userId: string; isPrimary: boolean }> = {};

            (profileData || []).forEach((p: any) => {
                const label = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Unknown';
                const entry: OfficerOption = { id: p.id, label, role: p.role };
                if (p.role === 'dfo') dfoList.push(entry);
                if (p.role === 'range_officer') roList.push(entry);
                if (p.role === 'beat_guard') bgList.push(entry);

                // Normalize: PostgREST returns a single object (not array) when the FK has a UNIQUE constraint
                const rawAssignments = p.user_region_assignments;
                const assignments: any[] = Array.isArray(rawAssignments)
                    ? rawAssignments
                    : rawAssignments
                        ? [rawAssignments]
                        : [];

                assignments.forEach((a: any) => {
                    const isPrimary = Boolean(a.is_primary_contact);

                    // Division-level assignment (dfo with only division_id set)
                    if (p.role === 'dfo' && a.division_id && !a.range_id) {
                        const existing = divMap[a.division_id];
                        if (!existing || (!existing.isPrimary && isPrimary)) {
                            divMap[a.division_id] = { userId: p.id, isPrimary };
                        }
                    }

                    // Range-level assignment
                    if (p.role === 'range_officer' && a.range_id && !a.beat_id) {
                        const existing = ranMap[a.range_id];
                        if (!existing || (!existing.isPrimary && isPrimary)) {
                            ranMap[a.range_id] = { userId: p.id, isPrimary };
                        }
                    }

                    // Beat-level assignment
                    if (p.role === 'beat_guard' && a.beat_id) {
                        const existing = beaMap[a.beat_id];
                        if (!existing || (!existing.isPrimary && isPrimary)) {
                            beaMap[a.beat_id] = { userId: p.id, isPrimary };
                        }
                    }
                });
            });

            setDfos(dfoList);
            setRangeOfficers(roList);
            setBeatGuards(bgList);
            setDivisionContacts(Object.fromEntries(Object.entries(divMap).map(([k, v]) => [k, v.userId])));
            setRangeContacts(Object.fromEntries(Object.entries(ranMap).map(([k, v]) => [k, v.userId])));
            setBeatContacts(Object.fromEntries(Object.entries(beaMap).map(([k, v]) => [k, v.userId])));

            // Auto-expand all on load
            setExpandedDivisions(new Set((divData || []).map((d: GeoDivision) => d.id)));

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load geography data');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    // ── Save ─────────────────────────────────────────────────────────────────

    const saveContact = async (
        geoId: string,
        userId: string,
        level: 'division' | 'range' | 'beat',
        divisionId?: string,
        rangeId?: string,
    ) => {
        setSavingState(s => ({ ...s, [geoId]: 'saving' }));
        try {
            // Clear existing primaries for this scope
            if (level === 'division') {
                await supabase.from('user_region_assignments')
                    .update({ is_primary_contact: false })
                    .eq('division_id', geoId).is('range_id', null).eq('is_primary_contact', true);
            } else if (level === 'range') {
                await supabase.from('user_region_assignments')
                    .update({ is_primary_contact: false })
                    .eq('range_id', geoId).is('beat_id', null).eq('is_primary_contact', true);
            } else {
                await supabase.from('user_region_assignments')
                    .update({ is_primary_contact: false })
                    .eq('beat_id', geoId).eq('is_primary_contact', true);
            }

            // Find existing assignment for this user + scope
            let q = supabase.from('user_region_assignments').select('id').eq('user_id', userId);
            if (level === 'division') q = q.eq('division_id', geoId).is('range_id', null).is('beat_id', null);
            else if (level === 'range') q = q.eq('range_id', geoId).is('beat_id', null);
            else q = q.eq('beat_id', geoId);
            const { data: existing } = await q.maybeSingle();

            if (existing) {
                await supabase.from('user_region_assignments')
                    .update({ is_primary_contact: true }).eq('id', existing.id);
            } else {
                const row: Record<string, any> = { user_id: userId, is_primary_contact: true };
                if (level === 'division') { row.division_id = geoId; }
                else if (level === 'range') { row.range_id = geoId; if (divisionId) row.division_id = divisionId; }
                else { row.beat_id = geoId; if (rangeId) row.range_id = rangeId; if (divisionId) row.division_id = divisionId; }
                await supabase.from('user_region_assignments').insert(row);
            }

            setSavingState(s => ({ ...s, [geoId]: 'saved' }));
            setTimeout(() => setSavingState(s => { const n = { ...s }; delete n[geoId]; return n; }), 2000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save');
            setSavingState(s => { const n = { ...s }; delete n[geoId]; return n; });
        }
    };

    // ── Filter by global search ───────────────────────────────────────────────

    const q = globalSearch.toLowerCase();
    const filteredDivisions = divisions.filter(d =>
        !q || d.name.toLowerCase().includes(q) || d.code?.toLowerCase().includes(q) ||
        ranges.some(r => r.division_id === d.id && (
            r.name.toLowerCase().includes(q) || r.code?.toLowerCase().includes(q) ||
            beats.some(b => b.range_id === r.id && (b.name.toLowerCase().includes(q) || b.code?.toLowerCase().includes(q)))
        ))
    );

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="space-y-5 w-full">

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-primary/10">
                        <Layers size={20} className="text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('admin_divisions_contacts')}</h1>
                        <p className="text-muted-foreground text-xs mt-0.5">{t('ad_assign_officers')}</p>
                    </div>
                </div>

                {/* Global search */}
                <div className="relative sm:w-64">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                        value={globalSearch}
                        onChange={e => setGlobalSearch(e.target.value)}
                        placeholder={t('ad_filter_territories')}
                        className="w-full pl-9 pr-3 py-2 text-sm bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    {globalSearch && (
                        <button onClick={() => setGlobalSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                            <X size={13} />
                        </button>
                    )}
                </div>
            </div>

            {/* Legend pills */}
            <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
                {[
                    { icon: Building2, label: t('ad_division_dfo'), cls: 'bg-violet-500/10 text-violet-600' },
                    { icon: MapPin, label: t('ad_range_officer'), cls: 'bg-blue-500/10 text-blue-600' },
                    { icon: TreePine, label: t('ad_beat_guard'), cls: 'bg-emerald-500/10 text-emerald-600' },
                ].map(({ icon: Icon, label, cls }) => (
                    <span key={label} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${cls}`}>
                        <Icon size={11} /> {label}
                    </span>
                ))}
            </div>

            {/* Error */}
            {error && (
                <div className="bg-destructive/10 border border-destructive/20 text-destructive p-3 rounded-xl flex items-center gap-3 text-sm">
                    <AlertTriangle size={15} /> {error}
                </div>
            )}

            {/* Table */}
            {loading ? (
                <div className="flex flex-col items-center gap-3 py-20">
                    <Loader2 className="animate-spin text-primary" size={28} />
                    <p className="text-sm text-muted-foreground">{t('ad_loading')}</p>
                </div>
            ) : filteredDivisions.length === 0 ? (
                <div className="glass-card rounded-2xl p-12 text-center text-muted-foreground">
                    <Layers size={36} className="mx-auto mb-3 opacity-30" />
                    <p className="font-medium">{globalSearch ? t('ad_no_match') : t('ad_no_divisions')}</p>
                </div>
            ) : (
                <div className="glass-card rounded-2xl overflow-hidden border border-border/50">
                    <table className="w-full border-collapse text-sm">
                        <thead>
                            <tr className="bg-muted/50 border-b border-border">
                                <th className="py-2.5 px-4 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('au_territory')}</th>
                                <th className="py-2.5 px-4 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-32">{t('au_role')}</th>
                                <th className="py-2.5 px-4 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-64">{t('ad_primary_contact')}</th>
                                <th className="py-2.5 px-4 text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-20"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredDivisions.map((div, di) => {
                                const divRanges = ranges.filter(r => r.division_id === div.id);
                                const isDivExpanded = expandedDivisions.has(div.id);

                                return [
                                    // Division row
                                    <TerritoryRow
                                        key={div.id}
                                        geoId={div.id}
                                        level="division"
                                        label={div.name}
                                        code={div.code}
                                        meta={div.state}
                                        officers={dfos}
                                        selectedUserId={divisionContacts[div.id] ?? ''}
                                        roleLabel="DFO"
                                        savingState={savingState}
                                        expanded={isDivExpanded}
                                        hasChildren={divRanges.length > 0}
                                        onToggle={() => setExpandedDivisions(prev => {
                                            const n = new Set(prev);
                                            n.has(div.id) ? n.delete(div.id) : n.add(div.id);
                                            return n;
                                        })}
                                        onChange={(id, uid) => setDivisionContacts(c => ({ ...c, [id]: uid }))}
                                        onSave={(id) => saveContact(id, divisionContacts[id], 'division')}
                                        delay={di * 0.04}
                                    />,

                                    // Range rows
                                    ...(!isDivExpanded ? [] : divRanges.flatMap((range, ri) => {
                                        const rangeBeats = beats.filter(b => b.range_id === range.id);
                                        const isRangeExpanded = expandedRanges.has(range.id);

                                        return [
                                            <TerritoryRow
                                                key={range.id}
                                                geoId={range.id}
                                                level="range"
                                                label={range.name}
                                                code={range.code}
                                                officers={rangeOfficers}
                                                selectedUserId={rangeContacts[range.id] ?? ''}
                                                roleLabel="Range Officer"
                                                savingState={savingState}
                                                expanded={isRangeExpanded}
                                                hasChildren={rangeBeats.length > 0}
                                                onToggle={() => setExpandedRanges(prev => {
                                                    const n = new Set(prev);
                                                    n.has(range.id) ? n.delete(range.id) : n.add(range.id);
                                                    return n;
                                                })}
                                                onChange={(id, uid) => setRangeContacts(c => ({ ...c, [id]: uid }))}
                                                onSave={(id) => saveContact(id, rangeContacts[id], 'range', div.id)}
                                                delay={di * 0.04 + ri * 0.02}
                                            />,

                                            // Beat rows
                                            ...(!isRangeExpanded ? [] : rangeBeats.map((beat, bi) => (
                                                <TerritoryRow
                                                    key={beat.id}
                                                    geoId={beat.id}
                                                    level="beat"
                                                    label={beat.name}
                                                    code={beat.code}
                                                    officers={beatGuards}
                                                    selectedUserId={beatContacts[beat.id] ?? ''}
                                                    roleLabel="Beat Guard"
                                                    savingState={savingState}
                                                    hasChildren={false}
                                                    onChange={(id, uid) => setBeatContacts(c => ({ ...c, [id]: uid }))}
                                                    onSave={(id) => saveContact(id, beatContacts[id], 'beat', div.id, range.id)}
                                                    delay={di * 0.04 + ri * 0.02 + bi * 0.01}
                                                />
                                            ))),
                                        ];
                                    })),
                                ];
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
