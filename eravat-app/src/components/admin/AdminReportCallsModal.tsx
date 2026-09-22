import { Phone } from 'lucide-react';

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
    | 'skipped';

export interface VillagerCallRow {
    id: string;
    villager_id: string;
    villager_name: string;
    village_name: string;
    phone_e164: string;
    distance_m: number | null;
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
    };
    return known[status] ?? 'admin.obs.callStatusUnknown';
}

export function callStatusClass(status: string): string {
    return STATUS_CLASS[status] ?? 'bg-muted text-muted-foreground';
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

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-card border border-border rounded-2xl w-full max-w-3xl max-h-[85vh] shadow-2xl flex flex-col overflow-hidden">
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
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-3 py-1.5 rounded-lg text-sm border border-border hover:bg-muted shrink-0"
                    >
                        {t('cancel')}
                    </button>
                </div>

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
