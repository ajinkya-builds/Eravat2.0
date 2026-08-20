import { useEffect, useState } from 'react';
import { subDays } from 'date-fns';
import { useLanguage } from '../../contexts/LanguageContext';
import {
    fetchAdminReports,
    fetchVillageCentroids,
    fetchVillagerCoords,
    reportsToSightingFacts,
} from '../../services/adminAnalyticsService';
import {
    beatIntelligence,
    compositionSummary,
    detectHotspots,
    ewsCoverage,
    headlines,
    hourlyConflictProfile,
    villageRisk,
    type BeatRow,
} from '../../services/edIntelligence';

const TIER_CLASS: Record<string, string> = {
    Critical: 'bg-destructive/15 text-destructive',
    High: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
    Watch: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
    Routine: 'bg-muted text-muted-foreground',
};

export function EdIntelligencePanel() {
    const { t } = useLanguage();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lines, setLines] = useState<string[]>([]);
    const [beats, setBeats] = useState<BeatRow[]>([]);
    const [composition, setComposition] = useState<ReturnType<typeof compositionSummary>>([]);
    const [hotspots, setHotspots] = useState<ReturnType<typeof detectHotspots>>([]);
    const [villages, setVillages] = useState<ReturnType<typeof villageRisk>>([]);
    const [coverage, setCoverage] = useState<ReturnType<typeof ewsCoverage>>([]);
    const [peak, setPeak] = useState<string>('');

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError(null);
            try {
                const end = new Date();
                const reports = await fetchAdminReports({ startDate: subDays(end, 90), endDate: end }, 2500);
                if (cancelled) return;
                const facts = reportsToSightingFacts(reports);
                const located = facts.filter((f) => f.lat != null && f.lng != null) as Array<{ lat: number; lng: number }>;
                const pad = 0.35;
                const bbox = located.length
                    ? {
                        minLat: Math.min(...located.map((f) => f.lat)) - pad,
                        maxLat: Math.max(...located.map((f) => f.lat)) + pad,
                        minLng: Math.min(...located.map((f) => f.lng)) - pad,
                        maxLng: Math.max(...located.map((f) => f.lng)) + pad,
                    }
                    : undefined;
                const [centroids, villagers] = await Promise.all([
                    fetchVillageCentroids(bbox),
                    fetchVillagerCoords(bbox).catch(() => [] as { lat: number; lng: number }[]),
                ]);
                if (cancelled) return;
                const beatRows = beatIntelligence(facts, centroids, end);
                const risk = villageRisk(facts, centroids);
                const hours = hourlyConflictProfile(facts);
                const peakLabel = hours.peak
                    ? t('ed_peak_hours')
                        .replace('{start}', String(hours.peak.start).padStart(2, '0'))
                        .replace('{end}', String(hours.peak.end).padStart(2, '0'))
                        .replace('{share}', String(hours.peak.share))
                    : t('ed_peak_none');
                setLines(headlines(beatRows, facts));
                setBeats(beatRows.slice(0, 12));
                setComposition(compositionSummary(facts));
                setHotspots(detectHotspots(facts, end).slice(0, 8));
                setVillages(risk);
                setCoverage(ewsCoverage(villagers, risk, centroids));
                setPeak(peakLabel);
            } catch (err) {
                if (!cancelled) setError(err instanceof Error ? err.message : String(err));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [t]);

    return (
        <section className="rounded-2xl border border-border bg-card p-4 md:p-5 space-y-4">
            <div>
                <h2 className="text-lg font-semibold tracking-tight">{t('ed_panel_title')}</h2>
                <p className="text-xs text-muted-foreground mt-1">{t('ed_panel_sub')}</p>
            </div>
            {loading && <p className="text-sm text-muted-foreground">{t('ed_loading')}</p>}
            {error && <p className="text-sm text-destructive">{error}</p>}
            {!loading && !error && (
                <>
                    <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {lines.map((line) => (
                            <li key={line} className="text-sm rounded-xl bg-muted/50 px-3 py-2">{line}</li>
                        ))}
                        <li className="text-sm rounded-xl bg-muted/50 px-3 py-2">{peak}</li>
                    </ul>

                    <div className="overflow-x-auto">
                        <table className="w-full text-xs md:text-sm">
                            <thead>
                                <tr className="text-left text-muted-foreground border-b border-border">
                                    <th className="py-2 pr-3">{t('ed_col_beat')}</th>
                                    <th className="py-2 pr-3">{t('ed_col_tier')}</th>
                                    <th className="py-2 pr-3">{t('ed_col_events')}</th>
                                    <th className="py-2 pr-3 hidden md:table-cell">{t('ed_col_trend')}</th>
                                    <th className="py-2">{t('ed_col_action')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {beats.map((b) => (
                                    <tr key={`${b.division}-${b.beat}`} className="border-b border-border/60 align-top">
                                        <td className="py-2 pr-3 font-medium">
                                            {b.beat}
                                            <div className="text-[11px] text-muted-foreground">{b.range} · {b.division}</div>
                                        </td>
                                        <td className="py-2 pr-3">
                                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${TIER_CLASS[b.tier]}`}>
                                                {b.tier}
                                            </span>
                                        </td>
                                        <td className="py-2 pr-3 whitespace-nowrap">
                                            {b.conflictEvents}/{b.reports}
                                            {(b.humanDeaths > 0 || b.peopleInjured > 0) && (
                                                <div className="text-[11px] text-destructive">
                                                    {b.humanDeaths}d / {b.peopleInjured}i
                                                </div>
                                            )}
                                        </td>
                                        <td className="py-2 pr-3 hidden md:table-cell">{b.trend}</td>
                                        <td className="py-2 text-muted-foreground">{b.action}</td>
                                    </tr>
                                ))}
                                {!beats.length && (
                                    <tr><td colSpan={5} className="py-4 text-muted-foreground">{t('ed_no_beats')}</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        <MiniTable
                            title={t('ed_composition')}
                            rows={composition.map((c) => [c.group, `${c.conflict}/${c.sightings} (${c.damageRatePct}%)`])}
                        />
                        <MiniTable
                            title={t('ed_hotspots')}
                            rows={hotspots.map((h) => [
                                `${h.tier} · ${h.events} ${t('ed_events')}`,
                                `${h.lat.toFixed(3)}, ${h.lng.toFixed(3)} · ${h.radiusKm} km`,
                            ])}
                        />
                        <MiniTable
                            title={t('ed_village_risk')}
                            rows={villages.map((v) => [
                                v.name,
                                `${v.events} · ${v.deaths}d/${v.injuries}i`,
                            ])}
                        />
                    </div>

                    {coverage.length > 0 && (
                        <div>
                            <h3 className="text-sm font-semibold mb-2">{t('ed_coverage')}</h3>
                            <div className="flex flex-wrap gap-2">
                                {coverage.slice(0, 10).map((c) => (
                                    <span
                                        key={c.village}
                                        className={`text-[11px] px-2 py-1 rounded-full ${
                                            c.status === 'No contact'
                                                ? 'bg-destructive/15 text-destructive'
                                                : c.status === 'Thin'
                                                    ? 'bg-amber-500/15 text-amber-700'
                                                    : 'bg-emerald-500/15 text-emerald-700'
                                        }`}
                                    >
                                        {c.village}: {c.status} ({c.contacts})
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                    <p className="text-[11px] text-muted-foreground">{t('ed_coverage_note')}</p>
                </>
            )}
        </section>
    );
}

function MiniTable({ title, rows }: { title: string; rows: [string, string][] }) {
    return (
        <div className="rounded-xl border border-border/80 p-3">
            <h3 className="text-sm font-semibold mb-2">{title}</h3>
            {rows.length === 0 ? (
                <p className="text-xs text-muted-foreground">—</p>
            ) : (
                <ul className="space-y-1.5">
                    {rows.map(([left, right]) => (
                        <li key={left} className="flex justify-between gap-2 text-xs">
                            <span className="font-medium truncate">{left}</span>
                            <span className="text-muted-foreground shrink-0">{right}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
