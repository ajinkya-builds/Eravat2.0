import { logger } from '../../lib/logger';
import type { AdminReportRow } from '../../types/adminRows';
/**
 * AdminLive — Live Dashboard
 *
 * SCHEMA NOTES (⚠️ = gap):
 *  - Human Death / Human Injury: tracked since the loss types were added to
 *    the report flow + category enum (migration 20260611000000). Reports
 *    filed before that date count as 0.
 *  - "Created By" vs "Sighted By": only one user_id per report in current schema.
 *    Both columns show the same reporter.
 *  - "Reported By" vs "Created By": same user. Flagged in table header.
 *  - Warning Recipients: count of distinct users who received notifications for each report.
 *  - Total Warnings: total notification rows for the period.
 *  - Warning Recipients KPI: distinct users across all notification rows.
 */

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../../supabase';
import { MapComponent } from '../../components/shared/MapComponent';
import { format, subDays, parseISO } from 'date-fns';
import { Filter, AlertCircle, Map as MapIcon, ChevronLeft, ChevronRight } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Division { id: string; name: string; }

interface SightingRow {
    id: string;
    division: string;
    reportedBy: string;
    reportedByPhone: string;
    sightingTime: string;
    uploadedTime: string;
    damage: string;
    warningRecipients: number;
    obsType: string;
}

type TimeRange = 'today' | '3d' | '7d' | '30d' | '60d' | '90d' | '180d';

const TIME_RANGE_OPTIONS: { label: string; value: TimeRange }[] = [
    { label: 'Today',    value: 'today' },
    { label: '3 Days',   value: '3d' },
    { label: '7 Days',   value: '7d' },
    { label: '30 Days',  value: '30d' },
    { label: '60 Days',  value: '60d' },
    { label: '90 Days',  value: '90d' },
    { label: '180 Days', value: '180d' },
];

const timeRangeDays: Record<TimeRange, number> = {
    today: 0, '3d': 3, '7d': 7, '30d': 30, '60d': 60, '90d': 90, '180d': 180,
};

const PAGE_SIZE = 20;

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ title, value, sub, flagged = false, delay = 0 }: {
    title: string; value: number | string; sub?: string; flagged?: boolean; delay?: number;
}) {
    return (
        <motion.div
            initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay }}
            className="glass-card rounded-2xl p-4 flex flex-col gap-1.5 relative"
        >
            {flagged && (
                <span className="absolute top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 border border-amber-400/30">
                    ⚠ Schema
                </span>
            )}
            <p className="text-2xl font-bold text-foreground">{value}</p>
            <p className="text-xs font-medium text-muted-foreground">{title}</p>
            {sub && <p className="text-[10px] text-muted-foreground/60">{sub}</p>}
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

export default function AdminLive() {
    const [divisions, setDivisions] = useState<Division[]>([]);
    const [selectedDivision, setSelectedDivision] = useState('');
    const [timeRange, setTimeRange] = useState<TimeRange>('30d');
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);

    const [kpis, setKpis] = useState({
        totalWarnings: 0,
        warningRecipients: 0,
        cropDamage: 0,
        propertyDamage: 0,
        humanInjury: 0,
        humanDeath: 0,
    });
    const [sightings, setSightings] = useState<SightingRow[]>([]);
    const [totalCount, setTotalCount] = useState(0);

    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

    useEffect(() => {
        supabase.from('geo_divisions').select('id, name').order('name').then(({ data }) => setDivisions(data || []));
    }, []);

    const fetchData = useCallback(async (divId: string, range: TimeRange, pg: number) => {
        setLoading(true);
        try {
            // Date bound
            const days = timeRangeDays[range];
            const since = days === 0
                ? format(new Date(), 'yyyy-MM-dd') + 'T00:00:00'
                : subDays(new Date(), days).toISOString();

            // Resolve beat filter
            let beatFilter: string[] | null = null;
            if (divId) {
                const { data: ranges } = await supabase.from('geo_ranges').select('id').eq('division_id', divId);
                const rIds = (ranges || []).map(r => r.id);
                if (rIds.length) {
                    const { data: beats } = await supabase.from('geo_beats').select('id').in('range_id', rIds);
                    beatFilter = (beats || []).map(b => b.id);
                } else { beatFilter = []; }
            }

            if (beatFilter !== null && beatFilter.length === 0) {
                setKpis({ totalWarnings: 0, warningRecipients: 0, cropDamage: 0, propertyDamage: 0, humanInjury: 0, humanDeath: 0 });
                setSightings([]); setTotalCount(0);
                return;
            }

            // ── KPI sub-counts source: all reports in range (capped) ─────────
            let allQ = supabase
                .from('reports')
                .select('id, observations(type, conflict_loss_details), conflict_damages(category)')
                .gte('device_timestamp', since)
                .limit(2000);
            if (beatFilter) allQ = allQ.in('beat_id', beatFilter);
            const { data: allReports } = await allQ;

            // ── KPI: notifications, scoped to the selected division ──────────
            type NotifRow = { id: string; user_id: string; report_id: string | null };
            let allNotifs: NotifRow[] = [];
            if (beatFilter) {
                // Scope via report IDs; chunk .in() to keep request URLs bounded
                const reportIds = (allReports || []).map(r => r.id);
                const chunks: string[][] = [];
                for (let i = 0; i < reportIds.length; i += 200) chunks.push(reportIds.slice(i, i + 200));
                const results = await Promise.all(chunks.map(ids =>
                    supabase.from('notifications')
                        .select('id, user_id, report_id')
                        .gte('created_at', since)
                        .in('report_id', ids)
                ));
                allNotifs = results.flatMap(r => (r.data as NotifRow[]) || []);
            } else {
                const { data } = await supabase.from('notifications')
                    .select('id, user_id, report_id')
                    .gte('created_at', since)
                    .limit(5000);
                allNotifs = (data as NotifRow[]) || [];
            }
            const totalWarnings = allNotifs.length;
            const warningRecipients = new Set(allNotifs.map(n => n.user_id)).size;

            // Map: report_id → notification count
            const notifCountByReport = new Map<string, number>();
            allNotifs.forEach(n => {
                if (n.report_id) notifCountByReport.set(n.report_id, (notifCountByReport.get(n.report_id) || 0) + 1);
            });

            // ── Reports fetch (paginated) ─────────────────────────────────────
            const from = (pg - 1) * PAGE_SIZE;
            const to = from + PAGE_SIZE - 1;

            let q = supabase
                .from('reports')
                .select(`
                    id, device_timestamp, server_created_at, beat_id,
                    geo_beats(name, geo_ranges(name, geo_divisions(id, name))),
                    profiles(first_name, last_name, phone),
                    observations(type, conflict_loss_details),
                    conflict_damages(category)
                `, { count: 'exact' })
                .gte('device_timestamp', since)
                .order('device_timestamp', { ascending: false })
                .range(from, to);

            if (beatFilter) q = q.in('beat_id', beatFilter);

            const { data: reports, count } = await q;

            setTotalCount(count || 0);

            let cropDamage = 0, propertyDamage = 0, humanInjury = 0, humanDeath = 0;
            ((allReports ?? []) as unknown as AdminReportRow[]).forEach((rep) => {
                const obs = rep.observations?.[0];
                const ld: string[] = Array.isArray(obs?.conflict_loss_details) ? obs.conflict_loss_details : [];
                const dc: string[] = (rep.conflict_damages || []).map((d) => d.category ?? '');
                if (ld.includes('crop') || dc.includes('crop')) cropDamage++;
                if (ld.includes('property') || dc.includes('property')) propertyDamage++;
                if (ld.includes('human injury') || dc.includes('human_injury')) humanInjury++;
                if (ld.includes('human death') || dc.includes('human_death')) humanDeath++;
            });

            setKpis({ totalWarnings, warningRecipients, cropDamage, propertyDamage, humanInjury, humanDeath });

            // ── Map reports to table rows ─────────────────────────────────────
            const rows: SightingRow[] = ((reports ?? []) as unknown as AdminReportRow[]).map((rep) => {
                const obs = rep.observations?.[0];
                const ld: string[] = Array.isArray(obs?.conflict_loss_details) ? obs.conflict_loss_details : [];
                const dc: string[] = (rep.conflict_damages || []).map((d) => d.category ?? '');
                const damageStr = [...new Set([...ld, ...dc])].filter(v => v && v !== 'none' && v !== 'No loss').join(', ') || '—';

                const division = rep.geo_beats?.geo_ranges?.geo_divisions?.name || '—';
                const profile = rep.profiles;
                const reportedBy = profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : '—';
                const phone = profile?.phone || '—';

                return {
                    id: rep.id,
                    division,
                    reportedBy,
                    reportedByPhone: phone,
                    sightingTime: rep.device_timestamp,
                    uploadedTime: rep.server_created_at ?? '',
                    damage: damageStr,
                    warningRecipients: notifCountByReport.get(rep.id) || 0,
                    obsType: obs?.type || '—',
                };
            });

            setSightings(rows);
        } catch (err) {
            logger.error('[AdminLive] fetch error', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData(selectedDivision, timeRange, page);
    }, [fetchData, selectedDivision, timeRange, page]);

    const handleApply = () => {
        setPage(1);
        fetchData(selectedDivision, timeRange, 1);
    };

    return (
        <div className="space-y-6">

            <div>
                <h1 className="text-2xl font-bold tracking-tight">Live Dashboard</h1>
                <p className="text-sm text-muted-foreground mt-0.5">Real-time sighting activity and warning dispatch</p>
            </div>

            {/* Filters */}
            <div className="glass-card rounded-2xl p-4 flex flex-wrap items-end gap-4">
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-muted-foreground">Division</label>
                    <select value={selectedDivision} onChange={e => setSelectedDivision(e.target.value)}
                        className="h-9 px-3 rounded-xl bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 min-w-[160px]">
                        <option value="">All Divisions</option>
                        {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                </div>

                {/* Time range radio pills */}
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-muted-foreground">Time Range</label>
                    <div className="flex flex-wrap gap-1">
                        {TIME_RANGE_OPTIONS.map(opt => (
                            <button
                                key={opt.value}
                                onClick={() => setTimeRange(opt.value)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                                    timeRange === opt.value
                                        ? 'bg-primary text-primary-foreground border-primary shadow'
                                        : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>

                <button onClick={handleApply} disabled={loading}
                    className="h-9 px-5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-60 flex items-center gap-2 self-end">
                    <Filter size={14} /> Apply
                </button>
            </div>

            {/* Schema note */}
            <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-amber-500/8 border border-amber-400/25 text-amber-700 text-xs">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span>
                    <strong>Schema notes:</strong> Human Injury and Human Death count reports filed after these loss
                    types were added to the report form. "Created By" and "Sighted By" map to the same
                    <code> reports.user_id</code> reporter — no separate witness field exists.
                </span>
            </div>

            {/* KPI Cards — 6 */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <KpiCard delay={0.05} title="Total Warnings"      value={loading ? '…' : kpis.totalWarnings}      sub="Notifications sent" />
                <KpiCard delay={0.08} title="Warning Recipients"  value={loading ? '…' : kpis.warningRecipients}  sub="Distinct users notified" />
                <KpiCard delay={0.11} title="Crop Damage"         value={loading ? '…' : kpis.cropDamage}         sub="Reports with crop loss" />
                <KpiCard delay={0.14} title="Property Damage"     value={loading ? '…' : kpis.propertyDamage}     sub="Reports with property loss" />
                <KpiCard delay={0.17} title="Human Injury"        value={loading ? '…' : kpis.humanInjury}        sub="Reports with human injury" />
                <KpiCard delay={0.20} title="Human Death"         value={loading ? '…' : kpis.humanDeath}         sub="Reports with human death" />
            </div>

            {/* Sighting List View */}
            <motion.div
                initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.22 }}
                className="glass-card rounded-2xl overflow-hidden"
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                    <h3 className="font-bold text-sm">Sighting List View</h3>
                    <span className="text-xs text-muted-foreground">
                        Total: <strong>{totalCount}</strong> sightings
                    </span>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                        <thead>
                            <tr className="bg-muted/30 border-b border-border">
                                {[
                                    'Division', 'Reported By', 'Created By (= Reported) ⚠',
                                    'Sighted By ⚠', 'Sighting Time', 'Uploaded Time',
                                    'Damage', 'Warning Recipients',
                                ].map(h => (
                                    <th key={h} className="p-3 text-left font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Loading…</td></tr>
                            ) : sightings.length === 0 ? (
                                <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No sightings for selected range</td></tr>
                            ) : sightings.map((row, i) => (
                                <motion.tr key={row.id}
                                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                                    className="border-b border-border/40 hover:bg-muted/15 transition-colors"
                                >
                                    <td className="p-3 font-medium max-w-[100px] truncate">{row.division}</td>
                                    <td className="p-3">
                                        <span className="font-medium">{row.reportedBy}</span>
                                        <br />
                                        <span className="text-muted-foreground">{row.reportedByPhone}</span>
                                    </td>
                                    <td className="p-3 text-muted-foreground">{row.reportedBy}</td>
                                    <td className="p-3 text-muted-foreground">{row.reportedBy}</td>
                                    <td className="p-3 whitespace-nowrap">
                                        {format(parseISO(row.sightingTime), 'dd MMM, HH:mm')}
                                    </td>
                                    <td className="p-3 whitespace-nowrap text-muted-foreground">
                                        {row.uploadedTime ? format(parseISO(row.uploadedTime), 'dd MMM, HH:mm') : '—'}
                                    </td>
                                    <td className="p-3 max-w-[120px] truncate" title={row.damage}>{row.damage}</td>
                                    <td className="p-3">
                                        {row.warningRecipients > 0 ? (
                                            <span className="text-primary font-semibold cursor-pointer hover:underline">
                                                {row.warningRecipients} — View Affected Villagers
                                            </span>
                                        ) : (
                                            <span className="text-muted-foreground">0</span>
                                        )}
                                    </td>
                                </motion.tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-5 py-3 border-t border-border text-xs text-muted-foreground">
                        <span>
                            Showing {Math.min((page - 1) * PAGE_SIZE + 1, totalCount)}–{Math.min(page * PAGE_SIZE, totalCount)} of {totalCount}
                        </span>
                        <div className="flex gap-2">
                            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                                className="p-1.5 rounded-lg border border-border disabled:opacity-40 hover:bg-muted">
                                <ChevronLeft size={14} />
                            </button>
                            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                                className="p-1.5 rounded-lg border border-border disabled:opacity-40 hover:bg-muted">
                                <ChevronRight size={14} />
                            </button>
                        </div>
                    </div>
                )}
            </motion.div>

            {/* Map */}
            <motion.div initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }}>
                <DashboardMap />
            </motion.div>
        </div>
    );
}
