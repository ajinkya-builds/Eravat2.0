import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Loader2, MessageCircleWarning, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { track } from '../lib/analytics';
import {
  SUPPORT_ISSUE_OPEN_EVENT,
  flushPendingSupportIssues,
  submitSupportIssue,
} from '../lib/supportIssues';
import { cn } from '../lib/utils';

export function ReportIssueWidget() {
  const location = useLocation();
  const { t, language } = useLanguage();
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<'success' | 'queued' | string | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setNotes('');
    setFeedback(null);
    setSubmitting(false);
  }, []);

  useEffect(() => {
    const onOpen = () => {
      setOpen(true);
      setFeedback(null);
      track('support.report_opened', { page: location.pathname });
    };
    window.addEventListener(SUPPORT_ISSUE_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(SUPPORT_ISSUE_OPEN_EVENT, onOpen);
  }, [location.pathname]);

  useEffect(() => {
    const flush = () => { void flushPendingSupportIssues(); };
    window.addEventListener('online', flush);
    void flushPendingSupportIssues();
    return () => window.removeEventListener('online', flush);
  }, []);

  // Raise above bottom nav / report wizard footer so the FAB never covers primary CTAs.
  const raisedNav =
    !location.pathname.startsWith('/admin') &&
    location.pathname !== '/login' &&
    !location.pathname.startsWith('/profile/complete-location');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    const result = await submitSupportIssue(notes, {
      pagePath: location.pathname,
      locale: language,
      isOnline: navigator.onLine,
      phone: profile?.phone,
    });
    setSubmitting(false);
    if (!result.ok) {
      setFeedback(result.error);
      track('support.report_failed', { error: result.error });
      return;
    }
    track('support.report_submitted', { queued: result.queued === true });
    setFeedback(result.queued ? 'queued' : 'success');
    setNotes('');
    window.setTimeout(() => close(), 1400);
  };

  const errorCopy =
    feedback === 'notes_required' ? t('support.notesRequired')
    : feedback === 'rate_limited' ? t('support.tooMany')
    : feedback === 'failed' ? t('support.failed')
    : null;

  return (
    <>
      <button
        type="button"
        data-testid="report-issue-open"
        onClick={() => {
          setOpen(true);
          setFeedback(null);
          track('support.report_opened', { page: location.pathname, source: 'fab' });
        }}
        className={cn(
          'fixed z-[60] right-3 flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 px-3.5 py-2.5 text-xs font-semibold',
          raisedNav ? 'bottom-[5.75rem]' : 'bottom-6',
        )}
        style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <MessageCircleWarning size={15} />
        {t('support.reportIssue')}
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4 bg-black/40">
          <form
            onSubmit={handleSubmit}
            data-testid="report-issue-form"
            className="w-full max-w-md rounded-2xl bg-background border border-border shadow-xl p-5 space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold">{t('support.title')}</h2>
                <p className="text-xs text-muted-foreground mt-1">{t('support.hint')}</p>
              </div>
              <button type="button" onClick={close} className="p-1 rounded-lg hover:bg-muted" aria-label={t('dismiss')}>
                <X size={16} />
              </button>
            </div>

            <textarea
              data-testid="report-issue-notes"
              required
              minLength={3}
              maxLength={2000}
              rows={5}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('support.notesPlaceholder')}
              className="w-full rounded-xl border border-border bg-muted/40 p-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />

            {feedback === 'success' && (
              <p className="text-sm text-emerald-700 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                {t('support.success')}
              </p>
            )}
            {feedback === 'queued' && (
              <p className="text-sm text-amber-700 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                {t('support.queued')}
              </p>
            )}
            {errorCopy && (
              <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl p-3">
                {errorCopy}
              </p>
            )}

            <button
              type="submit"
              data-testid="report-issue-submit"
              disabled={submitting || notes.trim().length < 3}
              className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
              {submitting ? t('support.submitting') : t('support.submit')}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
