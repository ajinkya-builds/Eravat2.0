import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { motion } from 'framer-motion';
import {
    Users, Activity, AlertTriangle, ShieldCheck, Eye,
    PawPrint, TrendingUp, Tag
} from 'lucide-react';
import {
    LineChart, Line,
    BarChart, Bar,
    PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { MapComponent } from '../components/shared/MapComponent';
import { format, subDays, isToday, parseISO, startOfDay } from 'date-fns';
import { NotificationBell } from '../components/shared/NotificationBell';
import { useLanguage } from '../contexts/LanguageContext';

// ─── Palette ──────────────────────────────────────────────────────────────────
const COLOR_DIRECT   = 'hsl(152, 60%, 46%)';   // emerald
const COLOR_INDIRECT = 'hsl(38, 92%, 50%)';    // amber
const COLOR_LOSS     = 'hsl(0, 84.2%, 60.2%)'; // red
const COLOR_MALE     = 'hsl(215, 70%, 55%)';
const COLOR_FEMALE   = 'hsl(320, 55%, 60%)';
const COLOR_CALF     = 'hsl(152, 55%, 55%)';
const COLOR_UNKNOWN  = 'hsl(215, 16%, 57%)';

// ─── Types ────────────────────────────────────────────────────────────────────
interface DayBucket { day: string; total: number; direct: number; indirect: number; loss: number; }
interface BeatBar { beat: string; count: number; }
interface ElephantBar { day: string; male: number; female: number; calf: number; unknown: number; }

// ─── Helpers ──────────────────────────────────────────────────────────────────
const obsTypeNorm = (raw: string) => {
    if (raw === 'direct_sighting' || raw === 'direct') return 'direct';
    if (raw === 'indirect_sign' || raw === 'indirect') return 'indirect';
    if (raw === 'conflict_loss' || raw === 'loss') return 'loss';
    return 'direct';
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function AdminDashboard() {
    const { t } = useLanguage();

    // KPIs
    const [loading, setLoading] = useState(true);
    const [sightingsToday, setSightingsToday] = useState(0);
    const [activeConflicts, setActiveConflicts] = useState(0);
    const [totalPersonnel, setTotalPersonnel] = useState(0);
    const [elephantCountToday, setElephantCountToday] = useState(0);

    // Charts
    const [sevenDayData, setSevenDayData] = useState<DayBucket[]>([]);
    const [pieData, setPieData] = useState<{ name: string; value: number; color: string }[]>([]);
    const [beatBarData, setBeatBarData] = useState<BeatBar[]>([]);
    const [elephantBarData, setElephantBarData] = useState<ElephantBar[]>([]);
    const [indirectTags, setIndirectTags] = useState<{ tag: string; count: number }[]>([]);

    // Feed
    const [recentReports, setRecentReports] = useState<{
        id: string; type: string; beatName: string; userName: string; timeStr: string;
        total: number; conflictCat?: string;
    }[]>([]);

    // ── Fetch ──────────────────────────────────────────────────────────────────
    useEffect(() => { fetchDashboardData(); }, []);

    const fetchDashboardData = async () => {
        setLoading(true);
        try {
            // 1. Personnel count
            const { count: userCount } = await supabase
                .from('profiles')
                .select('*', { count: 'exact', head: true });
            setTotalPersonnel(userCount ?? 0);

            // 2. Reports for last 30 days (metrics, charts, feed)
            const since30 = subDays(new Date(), 30).toISOString();
            const { data: reportsData } = await supabase
                .from('reports')
                .select(`
                    id,
                    device_timestamp,
                    beat_id,
                    geo_beats (name),
                    observations (
                        type,
                        male_count, female_count, calf_count, unknown_count,
                        indirect_sign_details
                    ),
                    conflict_damages (category)
                `)
                .gte('device_timestamp', since30)
                .order('device_timestamp', { ascending: false })
                .limit(500);

            if (!reportsData) return;

            // ── KPIs ─────────────────────────────────────────────────────────
            let todayCount = 0;
            let conflictCount = 0;
            let elephantToday = 0;

            // 7-day buckets
            const last7: DayBucket[] = [];
            for (let i = 6; i >= 0; i--) {
                last7.push({ day: format(subDays(new Date(), i), 'EEE'), total: 0, direct: 0, indirect: 0, loss: 0 });
            }
            const dayMap: Record<string, DayBucket> = {};
            last7.forEach(d => { dayMap[d.day] = d; });

            // Beat bar: { beatName → count }
            const beatCountMap: Record<string, number> = {};

            // Elephant stacked bar: day → counts
            const elephantDayMap: Record<string, ElephantBar> = {};
            last7.forEach(b => {
                elephantDayMap[b.day] = { day: b.day, male: 0, female: 0, calf: 0, unknown: 0 };
            });

            // Pie data
            let directCount = 0, indirectCount = 0, lossCount = 0;

            // Indirect sign tags
            const tagMap: Record<string, number> = {};

            // Feed
            const feedItems: typeof recentReports = [];

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            reportsData.forEach((rep: any) => {
                const repDate = parseISO(rep.device_timestamp);
                const obs = rep.observations?.[0];
                const rawType = obs?.type ?? (rep.conflict_damages?.length ? 'conflict_loss' : 'direct_sighting');
                const type = obsTypeNorm(rawType);

                const total = obs
                    ? (obs.male_count + obs.female_count + obs.calf_count + obs.unknown_count)
                    : 0;

                // Pie
                if (type === 'direct') directCount++;
                else if (type === 'indirect') indirectCount++;
                else if (type === 'loss') lossCount++;

                // KPI today
                if (isToday(repDate)) {
                    todayCount++;
                    if (type === 'direct') elephantToday += total;
                }
                if (type === 'loss') conflictCount++;

                // 7-day
                const dayLabel = format(startOfDay(repDate), 'EEE');
                if (dayMap[dayLabel]) {
                    dayMap[dayLabel].total++;
                    dayMap[dayLabel][type]++;
                }

                // Beat bar
                const beatName = rep.geo_beats?.name || 'Unknown';
                beatCountMap[beatName] = (beatCountMap[beatName] || 0) + 1;

                // Elephant stacked bar (last 7 days, direct sightings only)
                if (type === 'direct' && obs && elephantDayMap[dayLabel]) {
                    elephantDayMap[dayLabel].male += obs.male_count;
                    elephantDayMap[dayLabel].female += obs.female_count;
                    elephantDayMap[dayLabel].calf += obs.calf_count;
                    elephantDayMap[dayLabel].unknown += obs.unknown_count;
                }

                // Indirect sign tags
                if (type === 'indirect' && Array.isArray(obs?.indirect_sign_details)) {
                    obs.indirect_sign_details.forEach((tag: string) => {
                        tagMap[tag] = (tagMap[tag] || 0) + 1;
                    });
                }

                // Feed (last 8)
                if (feedItems.length < 8) {
                    feedItems.push({
                        id: rep.id,
                        type,
                        beatName,
                        userName: 'Officer',
                        timeStr: format(repDate, 'MMM d, HH:mm'),
                        total,
                        conflictCat: rep.conflict_damages?.[0]?.category,
                    });
                }
            });

            // ── Commit state ─────────────────────────────────────────────────
            setSightingsToday(todayCount);
            setActiveConflicts(conflictCount);
            setElephantCountToday(elephantToday);

            setSevenDayData(last7);

            setPieData([
                { name: 'Direct Sighting', value: directCount, color: COLOR_DIRECT },
                { name: 'Indirect Sign', value: indirectCount, color: COLOR_INDIRECT },
                { name: 'Conflict / Loss', value: lossCount, color: COLOR_LOSS },
            ].filter(d => d.value > 0));

            const beatArr = Object.entries(beatCountMap)
                .map(([beat, count]) => ({ beat, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 6);
            setBeatBarData(beatArr);

            setElephantBarData(last7.map(b => elephantDayMap[b.day] || { ...b, male: 0, female: 0, calf: 0, unknown: 0 }));

            const tagArr = Object.entries(tagMap)
                .map(([tag, count]) => ({ tag, count }))
                .sort((a, b) => b.count - a.count);
            setIndirectTags(tagArr);

            setRecentReports(feedItems);

        } catch (err) {
            console.error('Dashboard fetch error', err);
        } finally {
            setLoading(false);
        }
    };

    // ── Render ─────────────────────────────────────────────────────────────────
    return (
        <div className="space-y-6">

            {/* ── Header ─────────────────────────────────────────────────── */}
            <motion.div
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="flex flex-col md:flex-row md:items-end justify-between gap-4"
            >
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('admin_overview')}</h1>
                    <p className="text-muted-foreground mt-1 text-sm">{t('realtime_pulse')}</p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="px-3 py-1 bg-emerald-500/10 text-emerald-600 rounded-full text-xs font-semibold flex items-center gap-2">
                        {t('system_online')} {loading && '(Syncing...)'}
                    </div>
                    <NotificationBell />
                </div>
            </motion.div>

            {/* ── KPI Cards ──────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard delay={0.1} title={t('sightings_today')} value={sightingsToday}
                    trend="Last 24 hrs" icon={Eye} color="emerald" />
                <StatCard delay={0.2} title="Active Conflicts" value={activeConflicts}
                    trend="Last 30 days" icon={AlertTriangle} color="destructive" />
                <StatCard delay={0.3} title="Elephants Sighted" value={elephantCountToday}
                    trend="Today (direct)" icon={PawPrint} color="primary" />
                <StatCard delay={0.4} title={t('total_personnel')} value={totalPersonnel}
                    trend={t('across_all_beats')} icon={Users} color="muted" />
            </div>

            {/* ── Map ────────────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-2">
                <div className="lg:col-span-3">
                    <MapComponent showObservationPins={true} />
                </div>
            </div>

            {/* ── Row 3: 7-day trend + type donut ────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* 7-day trend */}
                <ChartCard delay={0.5} title="7-Day Activity Trend" subtitle="Reports per day" className="lg:col-span-2">
                    <ResponsiveContainer width="100%" height={260}>
                        <LineChart data={sevenDayData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.5} />
                            <XAxis dataKey="day" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                            <Tooltip contentStyle={{ backgroundColor: 'var(--color-card)', borderRadius: '12px', border: '1px solid var(--color-border)' }} />
                            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '12px' }} />
                            <Line type="monotone" dataKey="direct" name="Direct" stroke={COLOR_DIRECT} strokeWidth={2.5} dot={false} />
                            <Line type="monotone" dataKey="indirect" name="Indirect" stroke={COLOR_INDIRECT} strokeWidth={2.5} dot={false} />
                            <Line type="monotone" dataKey="loss" name="Conflict" stroke={COLOR_LOSS} strokeWidth={2.5} dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </ChartCard>

                {/* Observation type donut */}
                <ChartCard delay={0.6} title="Observation Types" subtitle="Last 30 days" className="">
                    {pieData.length === 0 ? (
                        <EmptyState message="No observation data yet" />
                    ) : (
                        <ResponsiveContainer width="100%" height={260}>
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={90}
                                    paddingAngle={4}
                                    dataKey="value"
                                    label={({ percent }) => percent != null ? `${(percent * 100).toFixed(0)}%` : ''}
                                    labelLine={false}
                                >
                                    {pieData.map((entry, idx) => (
                                        <Cell key={idx} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{ backgroundColor: 'var(--color-card)', borderRadius: '12px', border: '1px solid var(--color-border)' }}
                                    formatter={(value, name) => [value, name]}
                                />
                                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '12px' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    )}
                </ChartCard>
            </div>

            {/* ── Row 4: Beat bar + Elephant stacked bar ──────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Sightings by beat */}
                <ChartCard delay={0.7} title="Sightings by Beat" subtitle="Top 6 most active beats (30d)">
                    {beatBarData.length === 0 ? (
                        <EmptyState message="No beat data yet" />
                    ) : (
                        <ResponsiveContainer width="100%" height={240}>
                            <BarChart data={beatBarData} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--color-border)" opacity={0.5} />
                                <XAxis type="number" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis type="category" dataKey="beat" stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} width={90} />
                                <Tooltip contentStyle={{ backgroundColor: 'var(--color-card)', borderRadius: '12px', border: '1px solid var(--color-border)' }} />
                                <Bar dataKey="count" name="Reports" fill={COLOR_DIRECT} radius={[0, 6, 6, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </ChartCard>

                {/* Elephant population breakdown */}
                <ChartCard delay={0.8} title="Elephant Count Breakdown" subtitle="Direct sightings, last 7 days">
                    <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={elephantBarData} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.5} />
                            <XAxis dataKey="day" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                            <Tooltip contentStyle={{ backgroundColor: 'var(--color-card)', borderRadius: '12px', border: '1px solid var(--color-border)' }} />
                            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '12px' }} />
                            <Bar dataKey="male" name="Male" stackId="a" fill={COLOR_MALE} />
                            <Bar dataKey="female" name="Female" stackId="a" fill={COLOR_FEMALE} />
                            <Bar dataKey="calf" name="Calf" stackId="a" fill={COLOR_CALF} />
                            <Bar dataKey="unknown" name="Unknown" stackId="a" fill={COLOR_UNKNOWN} radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>
            </div>

            {/* ── Row 5: Indirect sign tags + Recent alerts ───────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Indirect sign frequency */}
                <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.9 }}
                    className="glass-card rounded-2xl p-6"
                >
                    <h3 className="text-lg font-bold mb-1 flex items-center gap-2">
                        <Tag size={18} className="text-amber-500" />
                        Indirect Sign Types
                    </h3>
                    <p className="text-xs text-muted-foreground mb-4">Frequency from all reports</p>
                    {indirectTags.length === 0 ? (
                        <EmptyState message="No indirect signs logged yet" />
                    ) : (
                        <div className="space-y-2">
                            {indirectTags.map(({ tag, count }) => {
                                const max = indirectTags[0].count;
                                const pct = Math.round((count / max) * 100);
                                return (
                                    <div key={tag}>
                                        <div className="flex justify-between text-xs mb-1">
                                            <span className="font-medium">{tag}</span>
                                            <span className="text-muted-foreground">{count}</span>
                                        </div>
                                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-amber-500 rounded-full transition-all duration-700"
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </motion.div>

                {/* Recent alerts feed */}
                <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 1.0 }}
                    className="glass-card rounded-2xl p-6 lg:col-span-2 flex flex-col"
                >
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold flex items-center gap-2">
                            <Activity size={18} className="text-primary" />
                            {t('recent_alerts')}
                        </h3>
                        <span className="text-xs text-muted-foreground">Last 30 days</span>
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-2.5 no-scrollbar">
                        {recentReports.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground opacity-50">
                                <ShieldCheck size={40} className="mb-2" />
                                <p className="text-sm">{t('no_recent_alerts')}</p>
                            </div>
                        ) : recentReports.map((alert) => (
                            <div key={alert.id}
                                className="p-3 rounded-xl bg-muted/40 border border-border/50 flex gap-3 items-start hover:bg-muted/60 transition-colors">
                                <div className={`p-2 rounded-lg shrink-0 ${
                                    alert.type === 'loss' ? 'bg-destructive/10 text-destructive' :
                                    alert.type === 'indirect' ? 'bg-amber-500/10 text-amber-600' :
                                    'bg-primary/10 text-primary'
                                }`}>
                                    {alert.type === 'loss' ? <AlertTriangle size={15} /> :
                                     alert.type === 'indirect' ? <TrendingUp size={15} /> :
                                     <Eye size={15} />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-foreground">
                                        {alert.type === 'loss' ? t('conflict_reported') :
                                         alert.type === 'indirect' ? t('indirect_sign_logged') :
                                         t('direct_sighting_logged')}
                                        {alert.type === 'direct' && alert.total > 0 && (
                                            <span className="ml-1 text-xs font-normal text-muted-foreground">
                                                · {alert.total} elephant{alert.total !== 1 ? 's' : ''}
                                            </span>
                                        )}
                                        {alert.type === 'loss' && alert.conflictCat && (
                                            <span className="ml-1 text-xs font-normal text-muted-foreground">
                                                · {alert.conflictCat}
                                            </span>
                                        )}
                                    </p>
                                    <p className="text-xs text-muted-foreground truncate">
                                        {alert.beatName} · {alert.userName}
                                    </p>
                                </div>
                                <div className="text-xs text-muted-foreground/60 font-medium whitespace-nowrap shrink-0">
                                    {alert.timeStr}
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>

            </div>
        </div>
    );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function StatCard({ title, value, trend, icon: Icon, color, delay }: any) {
    const colorMap: Record<string, string> = {
        emerald:     'text-emerald-500 bg-emerald-500/10',
        destructive: 'text-destructive bg-destructive/10',
        primary:     'text-primary bg-primary/10',
        muted:       'text-muted-foreground bg-muted',
    };
    return (
        <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay }}
            className="glass-card rounded-2xl p-5"
        >
            <div className="flex justify-between items-start mb-4">
                <div className={`p-3 rounded-xl ${colorMap[color]}`}>
                    <Icon size={20} />
                </div>
            </div>
            <p className="text-3xl font-bold text-foreground mb-1">{value}</p>
            <p className="text-sm font-medium text-muted-foreground mb-1">{title}</p>
            <p className="text-xs text-muted-foreground/70">{trend}</p>
        </motion.div>
    );
}

function ChartCard({ title, subtitle, children, delay, className = '' }: {
    title: string; subtitle: string; children: React.ReactNode; delay: number; className?: string;
}) {
    return (
        <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay }}
            className={`glass-card rounded-2xl p-6 ${className}`}
        >
            <h3 className="text-lg font-bold mb-0.5">{title}</h3>
            <p className="text-xs text-muted-foreground mb-5">{subtitle}</p>
            {children}
        </motion.div>
    );
}

function EmptyState({ message }: { message: string }) {
    return (
        <div className="flex items-center justify-center h-40 text-muted-foreground/50 text-sm">
            {message}
        </div>
    );
}