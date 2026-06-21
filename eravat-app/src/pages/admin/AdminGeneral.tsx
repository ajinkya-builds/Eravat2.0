import { logger } from '../../lib/logger';
import type { AdminReportRow } from '../../types/adminRows';
/**
 * AdminGeneral — General Dashboard
 *
 * SCHEMA NOTES:
 *  - Human Death / Human Injury / Grain Damage: tracked since the loss types
 *    were added to the report flow + category enum (migration
 *    20260611000000). Reports filed before that date count as 0.
 *  - "Total Calls" in division table: approximated as notification count for
 *    reports originating in that division.
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../../supabase';
import { MapComponent } from '../../components/shared/MapComponent';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { format, parseISO, startOfMonth, addMonths, isAfter, subDays } from 'date-fns';
import { Filter, AlertCircle, Map as MapIcon } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Division { id: string; name: string; }
interface Kpis {
    totalSightings: number;
    totalDamages: number;
    humanDeath: number;
    humanInjury: number;
    cropDamage: number;
    grainDamage: number;
    houseDamage: number;
}
interface MonthlyPoint { month: string; sightings: number; damages: number; }
interface DivisionRow {
    id: string; name: string;
    sightings: number; calls: number;
    officials: number; villagers: number; appUsers: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const obsIsLoss = (type: string) => type === 'conflict_loss' || type === 'loss';

const DEFAULT_START = format(subDays(new Date(), 90), 'yyyy-MM-dd');
const DEFAULT_END   = format(new Date(), 'yyyy-MM-dd');

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
    title, value, color = 'default', flagged = false, delay = 0,
}: {
    title: string;
    value: number | string;
    color?: 'blue' | 'orange' | 'red' | 'amber' | 'default';
    flagged?: boolean;
    delay?: number;
}) {
    const colorMap: Record<string, string> = {
        blue:    'text-blue-600 bg-blue-500/10',
        orange:  'text-orange-500 bg-orange-500/10',
        red:     'text-red-500 bg-red-500/10',
        amber:   'text-amber-600 bg-amber-500/10',
        default: 'text-primary bg-primary/10',
    };
    return (
        <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay }}
            className="glass-card rounded-2xl p-4 flex flex-col gap-2 relative"
        >
            {flagged && (
                <span className="absolute top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 border border-amber-400/30">
                    ⚠ Schema
                </span>
            )}
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${colorMap[color]}`}>
                <span className="text-xs font-black">#</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{value ?? '—'}</p>
            <p className="text-xs font-medium text-muted-foreground leading-tight">{title}</p>
        </motion.div>
    );
}

function DashboardMap() {
    const [showKml, setShowKml] = useState(false);
    return (
        <div className="relative rounded-2xl overflow-hidden" style={{ height: 380 }}>
            {/* KML toggle — functional KML overlay requires MapComponent extension */}
            <div className="absolute top-3 right-3 z-[1000] flex items-center gap-2 bg-card/90 backdrop-blur-sm px-3 py-1.5 rounded-xl border border-border shadow text-xs font-medium">
                <MapIcon size={12} />
                Show KML
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

export default function AdminGeneral() {
    const [divisions, setDivisions] = useState<Division[]>([]);
    const [selectedDivision, setSelectedDivision] = useState('');
    const [startDate, setStartDate] = useState(DEFAULT_START);
    const [endDate, setEndDate] = useState(DEFAULT_END);
    const [loading, setLoading] = useState(true);
    const [kpis, setKpis] = useState<Kpis>({
        totalSightings: 0, totalDamages: 0,
        humanDeath: 0, humanInjury: 0,
        cropDamage: 0, grainDamage: 0, houseDamage: 0,
    });
    const [monthlyData, setMonthlyData] = useState<MonthlyPoint[]>([]);
    const [divisionRows, setDivisionRows] = useState<DivisionRow[]>([]);

    // Load divisions once for dropdown
    useEffect(() => {
        supabase.from('geo_divisions').select('id, name').order('name').then(({ data }) => {
            setDivisions(data || []);
        });
        fetchData('', DEFAULT_START, DEFAULT_END);
        // Mount-only initial load; later fetches go through the Apply button.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchData = async (divId: string, start: string, end: string) => {
        setLoading(true);
        try {
            // ── 1. Resolve beat_ids for division filter ──────────────────────
            let beatFilter: string[] | null = null;
            if (divId) {
                const { data: ranges } = await supabase
                    .from('geo_ranges')
                    .select('id')
                    .eq('division_id', divId);
                const rangeIds = (ranges || []).map(r => r.id);
                if (rangeIds.length) {
                    const { data: beats } = await supabase
                        .from('geo_beats')
                        .select('id')
                        .in('range_id', rangeIds);
                    beatFilter = (beats || []).map(b => b.id);
                } else {
                    beatFilter = [];
                }
            }

            // ── 2. Fetch reports ─────────────────────────────────────────────
            let q = supabase
                .from('reports')
                .select(`
                    id, device_timestamp,
                    geo_beats(name, geo_ranges(name, geo_divisions(id, name))),
                    observations(type, conflict_loss_details),
                    conflict_damages(category)
                `)
                .gte('device_timestamp', `${start}T00:00:00`)
                .lte('device_timestamp', `${end}T23:59:59`)
                .order('device_timestamp', { ascending: false })
                .limit(2000);

            if (beatFilter !== null) {
                if (beatFilter.length === 0) {
                    // Division has no beats — no reports
                    setKpis({ totalSightings: 0, totalDamages: 0, humanDeath: 0, humanInjury: 0, cropDamage: 0, grainDamage: 0, houseDamage: 0 });
                    setMonthlyData([]);
                    setDivisionRows([]);
                    return;
                }
                q = q.in('beat_id', beatFilter);
            }

            const { data: reports } = await q;

            // ── 3. Fetch user assignments for division table ──────────────────
            const { data: assignments } = await supabase
                .from('user_region_assignments')
                .select('user_id, division_id, profiles(role, is_active)')
                .not('division_id', 'is', null);

            // ── 4. Fetch notification counts per division report ──────────────
            const { data: notifData } = await supabase
                .from('notifications')
                .select('report_id')
                .not('report_id', 'is', null);
            const notifByReport = new Map<string, number>();
            (notifData || []).forEach(n => {
                notifByReport.set(n.report_id, (notifByReport.get(n.report_id) || 0) + 1);
            });

            // ── 5. Compute KPIs ───────────────────────────────────────────────
            let totalSightings = 0;
            let totalDamages = 0;
            let cropDamage = 0;
            let houseDamage = 0;
            let grainDamage = 0;
            let humanDeath = 0;
            let humanInjury = 0;

            // Monthly buckets
            const monthMap = new Map<string, MonthlyPoint>();
            const s = startOfMonth(parseISO(start));
            const e = parseISO(end);
            let cur = s;
            while (!isAfter(cur, e)) {
                const key = format(cur, 'MMM yy');
                monthMap.set(key, { month: key, sightings: 0, damages: 0 });
                cur = addMonths(cur, 1);
            }

            // Division aggregation
            const divMap = new Map<string, DivisionRow>();

            ((reports ?? []) as unknown as AdminReportRow[]).forEach((rep) => {
                totalSightings++;
                const obs = rep.observations?.[0];
                const isLoss = obs ? obsIsLoss(obs.type ?? '') : !!rep.conflict_damages?.length;
                if (isLoss) totalDamages++;

                // Damage sub-types from conflict_loss_details
                const lossDetails: string[] = Array.isArray(obs?.conflict_loss_details)
                    ? obs.conflict_loss_details : [];
                if (lossDetails.includes('crop')) cropDamage++;
                if (lossDetails.includes('property')) houseDamage++;
                // Also check conflict_damages.category as fallback
                const damCats: string[] = (rep.conflict_damages || []).map((d) => d.category ?? '');
                if (!lossDetails.includes('crop') && damCats.includes('crop')) cropDamage++;
                if (!lossDetails.includes('property') && damCats.includes('property')) houseDamage++;
                if (lossDetails.includes('grain') || damCats.includes('grain')) grainDamage++;
                if (lossDetails.includes('human injury') || damCats.includes('human_injury')) humanInjury++;
                if (lossDetails.includes('human death') || damCats.includes('human_death')) humanDeath++;

                // Monthly bucket
                const month = format(parseISO(rep.device_timestamp), 'MMM yy');
                if (monthMap.has(month)) {
                    monthMap.get(month)!.sightings++;
                    if (isLoss) monthMap.get(month)!.damages++;
                }

                // Division row
                const div = rep.geo_beats?.geo_ranges?.geo_divisions;
                if (div?.id) {
                    if (!divMap.has(div.id)) {
                        divMap.set(div.id, {
                            id: div.id, name: div.name ?? div.id,
                            sightings: 0, calls: 0,
                            officials: 0, villagers: 0, appUsers: 0,
                        });
                    }
                    const row = divMap.get(div.id)!;
                    row.sightings++;
                    row.calls += notifByReport.get(rep.id) || 0;
                }
            });

            // Add user counts to division rows from assignments
            const OFFICIAL_ROLES = ['admin','ccf','biologist','veterinarian','dfo','rrt','range_officer','beat_guard'];
            type AssignmentJoinRow = { division_id: string | null; profiles?: { role?: string | null; is_active?: boolean | null } | null };
            ((assignments ?? []) as unknown as AssignmentJoinRow[]).forEach((a) => {
                const p = a.profiles;
                if (!p || !a.division_id) return;
                if (!divMap.has(a.division_id)) {
                    const divName = divisions.find(d => d.id === a.division_id)?.name || a.division_id;
                    divMap.set(a.division_id, { id: a.division_id, name: divName, sightings: 0, calls: 0, officials: 0, villagers: 0, appUsers: 0 });
                }
                const row = divMap.get(a.division_id)!;
                if (OFFICIAL_ROLES.includes(p.role ?? '')) row.officials++;
                if (p.role === 'volunteer') row.villagers++;
                if (p.is_active) row.appUsers++;
            });

            setKpis({ totalSightings, totalDamages, humanDeath, humanInjury, cropDamage, grainDamage, houseDamage });
            setMonthlyData(Array.from(monthMap.values()));
            setDivisionRows(Array.from(divMap.values()).sort((a, b) => b.sightings - a.sightings));
        } catch (err) {
            logger.error('[AdminGeneral] fetch error', err);
        } finally {
            setLoading(false);
        }
    };

    const handleApply = () => fetchData(selectedDivision, startDate, endDate);

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="space-y-6">

            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold tracking-tight">General Dashboard</h1>
                <p className="text-sm text-muted-foreground mt-0.5">Overview of all elephant sightings and damages</p>
            </div>

            {/* Filters */}
            <div className="glass-card rounded-2xl p-4 flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-muted-foreground">Division</label>
                    <select
                        value={selectedDivision}
                        onChange={e => setSelectedDivision(e.target.value)}
                        className="h-9 px-3 rounded-xl bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 min-w-[160px]"
                    >
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
                <button
                    onClick={handleApply}
                    disabled={loading}
                    className="h-9 px-5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-60 flex items-center gap-2"
                >
                    <Filter size={14} />
                    Apply
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

            {/* KPI Cards — 7 */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
                <KpiCard delay={0.05} title="Total Sightings"  value={loading ? '…' : kpis.totalSightings} color="blue" />
                <KpiCard delay={0.08} title="Total Damages"   value={loading ? '…' : kpis.totalDamages}   color="orange" />
                <KpiCard delay={0.11} title="Human Death"     value={loading ? '…' : kpis.humanDeath}     color="red" />
                <KpiCard delay={0.14} title="Human Injury"    value={loading ? '…' : kpis.humanInjury}    color="red" />
                <KpiCard delay={0.17} title="Crop Damage"     value={loading ? '…' : kpis.cropDamage}     color="amber" />
                <KpiCard delay={0.20} title="Grain Damage"    value={loading ? '…' : kpis.grainDamage}    color="amber" />
                <KpiCard delay={0.23} title="House Damage"    value={loading ? '…' : kpis.houseDamage}    color="default" />
            </div>

            {/* Charts row — 50/50 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Bar chart: Monthly Sightings vs Damages */}
                <motion.div
                    initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.25 }}
                    className="glass-card rounded-2xl p-5"
                >
                    <h3 className="text-sm font-bold mb-0.5">Monthly Sightings vs Damages</h3>
                    <p className="text-xs text-muted-foreground mb-4">Blue = Total Sightings · Orange = Damage Reports</p>
                    {monthlyData.length === 0 ? (
                        <div className="h-52 flex items-center justify-center text-muted-foreground/50 text-sm">No data for selected range</div>
                    ) : (
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={monthlyData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.5} />
                                <XAxis dataKey="month" fontSize={11} tickLine={false} axisLine={false} stroke="var(--color-muted-foreground)" />
                                <YAxis fontSize={11} tickLine={false} axisLine={false} stroke="var(--color-muted-foreground)" />
                                <Tooltip contentStyle={{ backgroundColor: 'var(--color-card)', borderRadius: '12px', border: '1px solid var(--color-border)' }} />
                                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '12px' }} />
                                <Bar dataKey="sightings" name="Total Sightings" fill="hsl(215, 70%, 55%)" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="damages"   name="Damage Sightings" fill="hsl(38, 92%, 50%)"  radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </motion.div>

                {/* Division-wise breakdown table */}
                <motion.div
                    initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }}
                    className="glass-card rounded-2xl p-5 overflow-hidden"
                >
                    <h3 className="text-sm font-bold mb-1">Division-wise Breakdown</h3>
                    <p className="text-xs text-muted-foreground mb-3">Sightings / Calls · Official Users · Villagers · App Users</p>
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                            <thead>
                                <tr className="border-b border-border bg-muted/30">
                                    {['Division', 'Sightings / Calls', 'Officials', 'Villagers', 'App Users'].map(h => (
                                        <th key={h} className="p-2 text-left font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">Loading…</td></tr>
                                ) : divisionRows.length === 0 ? (
                                    <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">No data</td></tr>
                                ) : divisionRows.map(row => (
                                    <tr key={row.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                                        <td className="p-2 font-medium truncate max-w-[110px]">{row.name}</td>
                                        <td className="p-2 text-center">
                                            <span className="font-semibold">{row.sightings}</span>
                                            <span className="text-muted-foreground"> / {row.calls}</span>
                                        </td>
                                        <td className="p-2 text-center">{row.officials}</td>
                                        <td className="p-2 text-center">{row.villagers}</td>
                                        <td className="p-2 text-center">{row.appUsers}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </motion.div>
            </div>

            {/* Map — full width */}
            <motion.div initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.35 }}>
                <DashboardMap />
            </motion.div>
        </div>
    );
}
