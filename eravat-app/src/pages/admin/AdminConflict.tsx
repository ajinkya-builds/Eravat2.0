import { logger } from '../../lib/logger';
import type { AdminReportRow } from '../../types/adminRows';
/**
 * AdminConflict — Conflict Dashboard
 *
 * SCHEMA NOTES:
 *  - Human Death / Human Injury / Grain Damage: tracked since the loss types
 *    were added to the report flow + category enum (migration
 *    20260611000000). Reports filed before that date count as 0.
 *  - Crop Damage:  derived from conflict_damages.category='crop' OR
 *                  observations.conflict_loss_details contains 'crop'.
 *  - House Damage: derived from conflict_damages.category='property' OR
 *                  conflict_loss_details contains 'property'.
 *  Pie chart uses actual loss_type strings from conflict_loss_details.
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../../supabase';
import { MapComponent } from '../../components/shared/MapComponent';
import {
    PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
    LineChart, Line, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { format, parseISO, subDays, startOfMonth, addMonths, isAfter } from 'date-fns';
import { Filter, AlertCircle, Map as MapIcon } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Division { id: string; name: string; }
interface PiePoint { name: string; value: number; color: string; }
interface LinePoint { month: string; crop: number; livestock: number; property: number; fencing: number; other: number; }

// ─── Constants ────────────────────────────────────────────────────────────────

const LOSS_COLORS: Record<string, string> = {
    crop:               'hsl(38, 92%, 50%)',
    livestock:          'hsl(142, 70%, 45%)',
    property:           'hsl(215, 70%, 55%)',
    fencing:            'hsl(275, 55%, 60%)',
    grain:              'hsl(28, 85%, 52%)',
    'human injury':     'hsl(0, 75%, 60%)',
    human_injury:       'hsl(0, 75%, 60%)',
    'human death':      'hsl(0, 85%, 42%)',
    human_death:        'hsl(0, 85%, 42%)',
    'solar panels':     'hsl(50, 90%, 55%)',
    'FD establishment': 'hsl(195, 70%, 50%)',
    Other:              'hsl(215, 16%, 57%)',
    'No loss':          'hsl(215, 16%, 75%)',
};

const LINE_COLORS = {
    crop:      'hsl(38, 92%, 50%)',
    livestock: 'hsl(142, 70%, 45%)',
    property:  'hsl(215, 70%, 55%)',
    fencing:   'hsl(275, 55%, 60%)',
    other:     'hsl(215, 16%, 57%)',
};

const DEFAULT_START = format(subDays(new Date(), 90), 'yyyy-MM-dd');
const DEFAULT_END   = format(new Date(), 'yyyy-MM-dd');

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
    title, value, flagged = false, delay = 0,
}: { title: string; value: number | string; flagged?: boolean; delay?: number }) {
    return (
        <motion.div
            initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay }}
            className="glass-card rounded-2xl p-4 flex flex-col gap-2 relative"
        >
            {flagged && (
                <span className="absolute top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 border border-amber-400/30">
                    ⚠ Schema
                </span>
            )}
            <div className="w-8 h-8 rounded-xl bg-destructive/10 flex items-center justify-center">
                <span className="text-destructive text-xs font-black">#</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{value ?? '—'}</p>
            <p className="text-xs font-medium text-muted-foreground">{title}</p>
        </motion.div>
    );
}

function DashboardMap() {
    const [showKml, setShowKml] = useState(false);
    return (
        <div className="relative rounded-2xl overflow-hidden" style={{ height: 380 }}>
            <div className="absolute top-3 right-3 z-[1000] flex items-center gap-2 bg-card/90 backdrop-blur-sm px-3 py-1.5 rounded-xl border border-border shadow text-xs font-medium">
                <MapIcon size={12} /> Show KML
                <button
                    onClick={() => setShowKml(v => !v)}
                    className={`relative w-9 h-5 rounded-full transition-colors ${showKml ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                >
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${showKml ? 'left-4' : 'left-0.5'}`} />
                </button>
            </div>
            <MapComponent showObservationPins={true} />
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminConflict() {
    const [divisions, setDivisions] = useState<Division[]>([]);
    const [selectedDivision, setSelectedDivision] = useState('');
    const [startDate, setStartDate] = useState(DEFAULT_START);
    const [endDate, setEndDate] = useState(DEFAULT_END);
    const [loading, setLoading] = useState(true);

    const [kpis, setKpis] = useState({ cropDamage: 0, houseDamage: 0, grainDamage: 0, humanDeath: 0, humanInjury: 0 });
    const [pieData, setPieData] = useState<PiePoint[]>([]);
    const [lineData, setLineData] = useState<LinePoint[]>([]);

    useEffect(() => {
        supabase.from('geo_divisions').select('id, name').order('name').then(({ data }) => setDivisions(data || []));
        fetchData('', DEFAULT_START, DEFAULT_END);
    }, []);

    const fetchData = async (divId: string, start: string, end: string) => {
        setLoading(true);
        try {
            let beatFilter: string[] | null = null;
            if (divId) {
                const { data: ranges } = await supabase.from('geo_ranges').select('id').eq('division_id', divId);
                const rangeIds = (ranges || []).map(r => r.id);
                if (rangeIds.length) {
                    const { data: beats } = await supabase.from('geo_beats').select('id').in('range_id', rangeIds);
                    beatFilter = (beats || []).map(b => b.id);
                } else { beatFilter = []; }
            }

            if (beatFilter !== null && beatFilter.length === 0) {
                setPieData([]); setLineData([]); setKpis({ cropDamage: 0, houseDamage: 0, grainDamage: 0, humanDeath: 0, humanInjury: 0 });
                return;
            }

            // Only fetch conflict_loss type reports
            let q = supabase
                .from('reports')
                .select(`
                    id, device_timestamp,
                    observations!inner(type, conflict_loss_details),
                    conflict_damages(category)
                `)
                .eq('observations.type', 'conflict_loss')
                .gte('device_timestamp', `${start}T00:00:00`)
                .lte('device_timestamp', `${end}T23:59:59`)
                .order('device_timestamp', { ascending: false })
                .limit(2000);

            if (beatFilter) q = q.in('beat_id', beatFilter);

            const { data: reports } = await q;

            // Build monthly buckets
            const monthMap = new Map<string, LinePoint>();
            let cur = startOfMonth(parseISO(start));
            const eDate = parseISO(end);
            while (!isAfter(cur, eDate)) {
                const key = format(cur, 'MMM yy');
                monthMap.set(key, { month: key, crop: 0, livestock: 0, property: 0, fencing: 0, other: 0 });
                cur = addMonths(cur, 1);
            }

            // Aggregate
            let cropDamage = 0;
            let houseDamage = 0;
            let grainDamage = 0;
            let humanDeath = 0;
            let humanInjury = 0;
            const pieMap = new Map<string, number>();

            ((reports ?? []) as unknown as AdminReportRow[]).forEach((rep) => {
                const obs = rep.observations?.[0];
                const lossDetails: string[] = Array.isArray(obs?.conflict_loss_details) ? obs.conflict_loss_details : [];
                const damCats: string[] = (rep.conflict_damages || []).map((d) => d.category ?? '');

                // Combine both sources for the pie and KPIs
                const allTypes = new Set([...lossDetails, ...damCats].filter(v => v && v !== 'none'));

                allTypes.forEach(t => pieMap.set(t, (pieMap.get(t) || 0) + 1));

                if (allTypes.has('crop')) cropDamage++;
                if (allTypes.has('property')) houseDamage++;
                if (allTypes.has('grain')) grainDamage++;
                if (allTypes.has('human injury') || allTypes.has('human_injury')) humanInjury++;
                if (allTypes.has('human death') || allTypes.has('human_death')) humanDeath++;

                // Monthly line data
                const month = format(parseISO(rep.device_timestamp), 'MMM yy');
                if (monthMap.has(month)) {
                    const row = monthMap.get(month)!;
                    if (allTypes.has('crop')) row.crop++;
                    if (allTypes.has('livestock')) row.livestock++;
                    if (allTypes.has('property')) row.property++;
                    if (allTypes.has('fencing')) row.fencing++;
                    if ([...allTypes].some(t => !['crop','livestock','property','fencing','No loss'].includes(t))) row.other++;
                }
            });

            const pie: PiePoint[] = Array.from(pieMap.entries())
                .filter(([, v]) => v > 0)
                .map(([name, value]) => ({
                    name: name.charAt(0).toUpperCase() + name.slice(1),
                    value,
                    color: LOSS_COLORS[name] || 'hsl(215, 16%, 57%)',
                }))
                .sort((a, b) => b.value - a.value);

            setKpis({ cropDamage, houseDamage, grainDamage, humanDeath, humanInjury });
            setPieData(pie);
            setLineData(Array.from(monthMap.values()));
        } catch (err) {
            logger.error('[AdminConflict] fetch error', err);
        } finally {
            setLoading(false);
        }
    };

    const handleApply = () => fetchData(selectedDivision, startDate, endDate);

    // Custom pie label
    const renderPieLabel = ({ percent }: { percent?: number }) =>
        (percent ?? 0) > 0.04 ? `${((percent ?? 0) * 100).toFixed(0)}%` : '';

    return (
        <div className="space-y-6">

            <div>
                <h1 className="text-2xl font-bold tracking-tight">Conflict Dashboard</h1>
                <p className="text-sm text-muted-foreground mt-0.5">Human-wildlife conflict and damage analysis</p>
            </div>

            {/* Filters */}
            <div className="glass-card rounded-2xl p-4 flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-muted-foreground">Division</label>
                    <select value={selectedDivision} onChange={e => setSelectedDivision(e.target.value)}
                        className="h-9 px-3 rounded-xl bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 min-w-[160px]">
                        <option value="">All Divisions</option>
                        {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-muted-foreground">Start Date</label>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                        className="h-9 px-3 rounded-xl bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-muted-foreground">End Date</label>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                        className="h-9 px-3 rounded-xl bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <button onClick={handleApply} disabled={loading}
                    className="h-9 px-5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-60 flex items-center gap-2">
                    <Filter size={14} /> Apply
                </button>
            </div>

            {/* Schema gap notice */}
            <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-amber-500/8 border border-amber-400/25 text-amber-700 text-xs">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span>
                    <strong>Note:</strong> Human Death, Human Injury, and Grain Damage are tracked from the date these
                    loss types were added to the report form onward; older reports are not reflected in those counts.
                </span>
            </div>

            {/* KPI Cards — 5 */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <KpiCard delay={0.05} title="Human Death"  value={loading ? '…' : kpis.humanDeath} />
                <KpiCard delay={0.08} title="Human Injury" value={loading ? '…' : kpis.humanInjury} />
                <KpiCard delay={0.11} title="Crop Damage"  value={loading ? '…' : kpis.cropDamage} />
                <KpiCard delay={0.14} title="Grain Damage" value={loading ? '…' : kpis.grainDamage} />
                <KpiCard delay={0.17} title="House Damage" value={loading ? '…' : kpis.houseDamage} />
            </div>

            {/* Charts — 50/50 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Pie chart */}
                <motion.div
                    initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }}
                    className="glass-card rounded-2xl p-5"
                >
                    <h3 className="text-sm font-bold mb-0.5">Damage Types Distribution</h3>
                    <p className="text-xs text-muted-foreground mb-4">From conflict_loss_details + conflict_damages.category</p>
                    {pieData.length === 0 ? (
                        <div className="h-52 flex items-center justify-center text-muted-foreground/50 text-sm">
                            {loading ? 'Loading…' : 'No conflict data for selected range'}
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height={240}>
                            <PieChart>
                                <Pie
                                    data={pieData} cx="50%" cy="50%"
                                    innerRadius={55} outerRadius={85}
                                    paddingAngle={3} dataKey="value"
                                    label={renderPieLabel} labelLine={false}
                                >
                                    {pieData.map((entry, i) => (
                                        <Cell key={i} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{ backgroundColor: 'var(--color-card)', borderRadius: '12px', border: '1px solid var(--color-border)' }}
                                    formatter={(value, name) => {
                                        const v = Number(value ?? 0);
                                        const total = pieData.reduce((a, b) => a + b.value, 0) || 1;
                                        return [`${v} (${((v / total) * 100).toFixed(1)}%)`, name];
                                    }}
                                />
                                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    )}
                </motion.div>

                {/* Line chart: Monthly Damage Trends */}
                <motion.div
                    initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.25 }}
                    className="glass-card rounded-2xl p-5"
                >
                    <h3 className="text-sm font-bold mb-0.5">Monthly Damage Trends</h3>
                    <p className="text-xs text-muted-foreground mb-4">One line per tracked damage type</p>
                    {lineData.length === 0 ? (
                        <div className="h-52 flex items-center justify-center text-muted-foreground/50 text-sm">
                            {loading ? 'Loading…' : 'No data'}
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height={240}>
                            <LineChart data={lineData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.5} />
                                <XAxis dataKey="month" fontSize={11} tickLine={false} axisLine={false} stroke="var(--color-muted-foreground)" />
                                <YAxis fontSize={11} tickLine={false} axisLine={false} stroke="var(--color-muted-foreground)" />
                                <Tooltip contentStyle={{ backgroundColor: 'var(--color-card)', borderRadius: '12px', border: '1px solid var(--color-border)' }} />
                                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
                                <Line type="monotone" dataKey="crop"      name="Crop"      stroke={LINE_COLORS.crop}      strokeWidth={2} dot={false} />
                                <Line type="monotone" dataKey="livestock" name="Livestock" stroke={LINE_COLORS.livestock} strokeWidth={2} dot={false} />
                                <Line type="monotone" dataKey="property"  name="Property"  stroke={LINE_COLORS.property}  strokeWidth={2} dot={false} />
                                <Line type="monotone" dataKey="fencing"   name="Fencing"   stroke={LINE_COLORS.fencing}   strokeWidth={2} dot={false} />
                                <Line type="monotone" dataKey="other"     name="Other"     stroke={LINE_COLORS.other}     strokeWidth={2} dot={false} strokeDasharray="4 2" />
                            </LineChart>
                        </ResponsiveContainer>
                    )}
                </motion.div>
            </div>

            {/* Map */}
            <motion.div initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }}>
                <DashboardMap />
            </motion.div>
        </div>
    );
}
