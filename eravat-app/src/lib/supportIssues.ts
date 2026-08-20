import { supabase } from '../supabase';

export const SUPPORT_ISSUE_OPEN_EVENT = 'eravat-open-report-issue';
const PENDING_KEY = 'eravat_pending_support_issues';
const MAX_NOTES = 2000;

export type SupportIssueStatus = 'open' | 'resolved';

export type SupportIssue = {
  id: string;
  created_at: string;
  user_id: string | null;
  notes: string;
  page_path: string | null;
  app_env: string | null;
  app_version: string | null;
  role: string | null;
  phone: string | null;
  display_name: string | null;
  user_agent: string | null;
  locale: string | null;
  is_online: boolean | null;
  status: SupportIssueStatus;
  resolved_at: string | null;
};

export type SupportIssueDraft = {
  notes: string;
  page_path: string;
  app_env: string;
  app_version: string;
  user_agent: string;
  locale: string;
  is_online: boolean;
  phone?: string | null;
};

export function openReportIssueDialog(): void {
  window.dispatchEvent(new CustomEvent(SUPPORT_ISSUE_OPEN_EVENT));
}

export function sanitiseSupportNotes(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_NOTES);
}

export function buildSupportIssueDraft(
  notes: string,
  opts?: { pagePath?: string; locale?: string; isOnline?: boolean; phone?: string },
): SupportIssueDraft | { error: 'notes_required' } {
  const cleaned = sanitiseSupportNotes(notes);
  if (cleaned.length < 3) return { error: 'notes_required' };
  return {
    notes: cleaned,
    page_path: (opts?.pagePath ?? (typeof window !== 'undefined' ? window.location.pathname : '/')).slice(0, 300),
    app_env: String(import.meta.env.VITE_APP_ENV || import.meta.env.MODE || 'unknown').slice(0, 20),
    app_version: String(import.meta.env.VITE_APP_VERSION || '2.0.0').slice(0, 40),
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 400) : '',
    locale: (opts?.locale ?? (typeof navigator !== 'undefined' ? navigator.language : 'en')).slice(0, 8),
    is_online: opts?.isOnline ?? (typeof navigator !== 'undefined' ? navigator.onLine : true),
    phone: opts?.phone?.trim() || null,
  };
}

function readPending(): SupportIssueDraft[] {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SupportIssueDraft[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePending(rows: SupportIssueDraft[]): void {
  if (rows.length === 0) {
    localStorage.removeItem(PENDING_KEY);
    return;
  }
  localStorage.setItem(PENDING_KEY, JSON.stringify(rows.slice(-20)));
}

export function queueSupportIssue(draft: SupportIssueDraft): void {
  writePending([...readPending(), draft]);
}

function isNetworkish(err: { message?: string; code?: string } | null): boolean {
  const msg = (err?.message || '').toLowerCase();
  return msg.includes('failed to fetch') || msg.includes('network') || msg.includes('offline');
}

export async function submitSupportIssue(
  notes: string,
  opts?: { pagePath?: string; locale?: string; isOnline?: boolean; phone?: string },
): Promise<{ ok: true; queued?: boolean } | { ok: false; error: string }> {
  const draft = buildSupportIssueDraft(notes, opts);
  if ('error' in draft) return { ok: false, error: draft.error };

  const { error } = await supabase.from('support_issues').insert(draft);
  if (!error) return { ok: true };

  const msg = (error.message || '').toLowerCase();
  if (msg.includes('rate_limited')) return { ok: false, error: 'rate_limited' };
  if (msg.includes('notes_required') || msg.includes('notes_too_long')) {
    return { ok: false, error: 'notes_required' };
  }
  if (!navigator.onLine || isNetworkish(error)) {
    queueSupportIssue(draft);
    return { ok: true, queued: true };
  }
  return { ok: false, error: 'failed' };
}

export async function flushPendingSupportIssues(): Promise<number> {
  const pending = readPending();
  if (pending.length === 0) return 0;
  const kept: SupportIssueDraft[] = [];
  let sent = 0;
  for (const draft of pending) {
    const { error } = await supabase.from('support_issues').insert(draft);
    if (error) {
      if ((error.message || '').toLowerCase().includes('rate_limited')) {
        kept.push(draft);
        continue;
      }
      if (!navigator.onLine || isNetworkish(error)) {
        kept.push(draft);
        continue;
      }
      // Drop malformed drafts so the queue cannot stall.
      continue;
    }
    sent += 1;
  }
  writePending(kept);
  return sent;
}

export async function fetchSupportIssues(): Promise<SupportIssue[]> {
  const { data, error } = await supabase
    .from('support_issues')
    .select(
      'id, created_at, user_id, notes, page_path, app_env, app_version, role, phone, display_name, user_agent, locale, is_online, status, resolved_at',
    )
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data as SupportIssue[]) ?? [];
}

export async function setSupportIssueStatus(
  id: string,
  status: SupportIssueStatus,
): Promise<void> {
  const { error } = await supabase.from('support_issues').update({ status }).eq('id', id);
  if (error) throw error;
}
