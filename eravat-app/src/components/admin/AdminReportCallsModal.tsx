import { Download, Phone } from 'lucide-react';

/** MSG91-aligned villager call statuses (see map_msg91_voice_status). */
export type VillagerCallStatus =
    | 'queued'
    | 'triggered'
    | 'ringing'
    | 'completed'
    | 'no_answer'
    | 'busy'
    | 'cancelled'
    | 'failed'
    | 'skipped'
    | 'recently_alerted';

export interface VillagerCallRow {
    id: string;
    villager_id: string;
    villager_name: string;
    village_name: string;
    phone_e164: string;
    distance_m: number | null;
    latitude: number | null;
    longitude: number | null;
    call_status: VillagerCallStatus | string;
    failure_reason: string | null;
    provider_status_raw: string | null;
    msg91_uuid: string | null;
    duration_seconds: number | null;
    requested_at: string | null;
    started_at: string | null;
    ended_at: string | null;
    created_at: string;
}

const STATUS_CLASS: Record<string, string> = {
    queued: 'bg-muted text-muted-foreground',
    triggered: 'bg-sky-500/15 text-sky-700',
    ringing: 'bg-sky-500/15 text-sky-700',
    completed: 'bg-emerald-500/15 text-emerald-700',
    no_answer: 'bg-amber-500/15 text-amber-700',
    busy: 'bg-amber-500/15 text-amber-700',
    cancelled: 'bg-muted text-muted-foreground',
    failed: 'bg-destructive/15 text-destructive',
    skipped: 'bg-muted text-muted-foreground',
    recently_alerted: 'bg-amber-500/15 text-amber-800',
};

export function callStatusLabelKey(status: string): string {
    const known: Record<string, string> = {
        queued: 'admin.obs.callStatusQueued',
        triggered: 'admin.obs.callStatusTriggered',
        ringing: 'admin.obs.callStatusRinging',
        completed: 'admin.obs.callStatusCompleted',
        no_answer: 'admin.obs.callStatusNoAnswer',
        busy: 'admin.obs.callStatusBusy',
        cancelled: 'admin.obs.callStatusCancelled',
        failed: 'admin.obs.callStatusFailed',
        skipped: 'admin.obs.callStatusSkipped',
        recently_alerted: 'admin.obs.callStatusRecentlyAlerted',
    };
    return known[status] ?? 'admin.obs.callStatusUnknown';
}

export function callStatusClass(status: string): string {
    return STATUS_CLASS[status] ?? 'bg-muted text-muted-foreground';
}

const KNOWN_STATUSES = new Set([
    'queued',
    'triggered',
    'ringing',
    'completed',
    'no_answer',
    'busy',
    'cancelled',
    'failed',
    'skipped',
    'recently_alerted',
]);

export interface CallLogMetrics {
    triggered: number;
    received: number;
    failed: number;
    noAnswer: number;
    busy: number;
    queued: number;
    ringing: number;
    dialed: number;
    cancelled: number;
    skipped: number;
    recentlyAlerted: number;
    unknown: number;
}

export function summarizeCallLogs(rows: Pick<VillagerCallRow, 'call_status'>[]): CallLogMetrics {
    const count = (status: string) => rows.filter((row) => row.call_status === status).length;
    return {
        triggered: rows.filter((row) => row.call_status !== 'recently_alerted').length,
        received: count('completed'),
        failed: count('failed'),
        noAnswer: count('no_answer'),
        busy: count('busy'),
        queued: count('queued'),
        ringing: count('ringing'),
        dialed: count('triggered'),
        cancelled: count('cancelled'),
        skipped: count('skipped'),
        recentlyAlerted: count('recently_alerted'),
        unknown: rows.filter((row) => !KNOWN_STATUSES.has(row.call_status)).length,
    };
}

function csvCell(value: string | number | null | undefined): string {
    const text = value == null ? '' : String(value);
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
}

/** Display villager lat/lng (same source as CSV export). */
export function formatCallCoordinate(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return '—';
    return value.toFixed(6);
}

export function callLogsToCsv(rows: VillagerCallRow[], t: (key: string) => string): string {
    const headers = [
        t('admin.obs.callVillager'),
        t('admin.obs.callVillage'),
        t('admin.obs.callPhone'),
        t('admin.obs.callDistance'),
        t('admin.obs.callLatitude'),
        t('admin.obs.callLongitude'),
        t('admin.obs.callStatus'),
        t('admin.obs.callFailure'),
        t('admin.obs.callDuration'),
    ];
    const lines = rows.map((row) =>
        [
            row.villager_name,
            row.village_name,
            row.phone_e164,
            row.distance_m == null ? '' : Math.round(row.distance_m),
            row.latitude,
            row.longitude,
            t(callStatusLabelKey(row.call_status)),
            row.failure_reason,
            row.duration_seconds,
        ]
            .map(csvCell)
            .join(','),
    );
    return [headers.join(','), ...lines].join('\n');
}

function downloadCsv(filename: string, csv: string) {
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

interface Props {
    open: boolean;
    reportId: string | null;
    reportLabel?: string;
    rows: VillagerCallRow[];
    loading: boolean;
    error: string | null;
    onClose: () => void;
    t: (key: string) => string;
}

export function AdminReportCallsModal({
    open,
    reportId,
    reportLabel,
    rows,
    loading,
    error,
    onClose,
    t,
}: Props) {
    if (!open || !reportId) return null;

    const metrics = summarizeCallLogs(rows);
    const metricItems: { key: string; label: string; value: number; tone: string }[] = [
        { key: 'triggered', label: t('admin.obs.callMetricTriggered'), value: metrics.triggered, tone: 'text-foreground' },
        { key: 'recentlyAlerted', label: t('admin.obs.callMetricRecentlyAlerted'), value: metrics.recentlyAlerted, tone: 'text-amber-800' },
        { key: 'received', label: t('admin.obs.callMetricReceived'), value: metrics.received, tone: 'text-emerald-700' },
        { key: 'failed', label: t('admin.obs.callMetricFailed'), value: metrics.failed, tone: 'text-destructive' },
        { key: 'noAnswer', label: t('admin.obs.callMetricNoAnswer'), value: metrics.noAnswer, tone: 'text-amber-700' },
        { key: 'busy', label: t('admin.obs.callMetricBusy'), value: metrics.busy, tone: 'text-amber-700' },
        { key: 'queued', label: t('admin.obs.callMetricQueued'), value: metrics.queued, tone: 'text-muted-foreground' },
        { key: 'ringing', label: t('admin.obs.callMetricRinging'), value: metrics.ringing, tone: 'text-sky-700' },
        { key: 'dialed', label: t('admin.obs.callMetricDialed'), value: metrics.dialed, tone: 'text-sky-700' },
        { key: 'cancelled', label: t('admin.obs.callMetricCancelled'), value: metrics.cancelled, tone: 'text-muted-foreground' },
        { key: 'skipped', label: t('admin.obs.callMetricSkipped'), value: metrics.skipped, tone: 'text-muted-foreground' },
        { key: 'unknown', label: t('admin.obs.callMetricUnknown'), value: metrics.unknown, tone: 'text-muted-foreground' },
    ];

    return (
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            data-testid="admin-report-calls-modal"
        >
            <div className="bg-card border border-border rounded-2xl w-full max-w-4xl max-h-[85vh] shadow-2xl flex flex-col overflow-hidden">
                <div className="flex items-start justify-between gap-3 p-5 border-b border-border">
                    <div className="flex items-start gap-3 min-w-0">
                        <div className="p-2.5 rounded-xl bg-primary/10 shrink-0">
                            <Phone className="text-primary" size={18} />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-lg font-bold truncate">{t('admin.obs.viewCalls')}</h2>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                {reportLabel || reportId}
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-1">
                                {t('admin.obs.viewCallsHint')}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            type="button"
                            data-testid="admin-report-calls-export"
                            disabled={loading || rows.length === 0}
                            onClick={() => downloadCsv(`call-logs-${reportId}.csv`, callLogsToCsv(rows, t))}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-border hover:bg-muted disabled:opacity-40"
                        >
                            <Download size={14} />
                            {t('admin.obs.exportCSV')}
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-3 py-1.5 rounded-lg text-sm border border-border hover:bg-muted"
                        >
                            {t('cancel')}
                        </button>
                    </div>
                </div>

                {!loading && rows.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 px-5 py-3 border-b border-border bg-muted/20" data-testid="admin-report-calls-metrics">
                        {metricItems.map((item) => (
                            <div key={item.key} className="rounded-lg border border-border bg-card px-2.5 py-2">
                                <p className={`text-base font-bold leading-none ${item.tone}`}>{item.value}</p>
                                <p className="text-[10px] text-muted-foreground mt-1 leading-tight">{item.label}</p>
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex-1 overflow-auto p-4">
                    {error && (
                        <div className="mb-3 p-3 rounded-xl bg-destructive/10 text-destructive text-sm">{error}</div>
                    )}
                    {loading ? (
                        <p className="text-sm text-muted-foreground py-10 text-center">{t('loading')}</p>
                    ) : rows.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-10 text-center">{t('admin.obs.noCalls')}</p>
                    ) : (
                        <div className="overflow-x-auto rounded-xl border border-border">
                            <table className="w-full text-sm border-collapse">
                                <thead>
                                    <tr className="border-b border-border bg-muted/30">
                                        {[
                                            t('admin.obs.callVillager'),
                                            t('admin.obs.callVillage'),
                                            t('admin.obs.callPhone'),
                                            t('admin.obs.callDistance'),
                                            t('admin.obs.callLatitude'),
                                            t('admin.obs.callLongitude'),
                                            t('admin.obs.callStatus'),
                                        ].map((h) => (
                                            <th
                                                key={h}
                                                className="p-3 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider"
                                            >
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row) => (
                                        <tr key={row.id} className="border-b border-border/50 last:border-0">
                                            <td className="p-3 font-medium">{row.villager_name}</td>
                                            <td className="p-3 text-muted-foreground">{row.village_name || '—'}</td>
                                            <td className="p-3 font-mono text-xs whitespace-nowrap">{row.phone_e164}</td>
                                            <td className="p-3 text-muted-foreground text-xs whitespace-nowrap">
                                                {row.distance_m == null
                                                    ? '—'
                                                    : row.distance_m < 1000
                                                      ? `${Math.round(row.distance_m)} m`
                                                      : `${(row.distance_m / 1000).toFixed(1)} km`}
                                            </td>
                                            <td
                                                className="p-3 font-mono text-xs whitespace-nowrap text-muted-foreground"
                                                data-testid="admin-report-call-latitude"
                                            >
                                                {formatCallCoordinate(row.latitude)}
                                            </td>
                                            <td
                                                className="p-3 font-mono text-xs whitespace-nowrap text-muted-foreground"
                                                data-testid="admin-report-call-longitude"
                                            >
                                                {formatCallCoordinate(row.longitude)}
                                            </td>
                                            <td className="p-3">
                                                <div className="space-y-1">
                                                    <span
                                                        className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-semibold ${callStatusClass(row.call_status)}`}
                                                    >
                                                        {t(callStatusLabelKey(row.call_status))}
                                                    </span>
                                                    {row.failure_reason ? (
                                                        <p className="text-[11px] text-destructive max-w-[220px] truncate" title={row.failure_reason}>
                                                            {row.failure_reason}
                                                        </p>
                                                    ) : null}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
