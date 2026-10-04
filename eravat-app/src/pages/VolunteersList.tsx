import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Search, UserPlus } from 'lucide-react';
import { supabase } from '../supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useOnboardingPermissions } from '../hooks/useOnboardingPermissions';
import { sanitiseIlikeTerm, tokenOrFilters } from '../lib/ilike';

type HathiMitraRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  is_active: boolean | null;
};

function displayName(row: HathiMitraRow): string {
  return `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim();
}

export default function VolunteersList() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { t } = useLanguage();
  const { canAddHathiMitra, loading: permissionLoading } = useOnboardingPermissions();
  const [query, setQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [rows, setRows] = useState<HathiMitraRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.id) return;

    let cancelled = false;
    const handle = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        let q = supabase
          .from('profiles')
          .select('id, first_name, last_name, phone, is_active')
          .eq('role', 'volunteer')
          .eq('created_by', profile.id)
          .order('first_name')
          .limit(100);

        if (!showInactive) q = q.eq('is_active', true);

        for (const filter of tokenOrFilters(['first_name', 'last_name', 'phone'], query)) {
          q = q.or(filter);
        }

        const { data, error: fetchErr } = await q;
        if (fetchErr) throw fetchErr;
        if (!cancelled) setRows((data as HathiMitraRow[]) ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t('volunteer.listFailed'));
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query, profile?.id, showInactive, t]);

  if (!permissionLoading && !loading && !canAddHathiMitra && rows.length === 0 && !error) {
    return (
      <div className="min-h-screen p-6 max-w-lg mx-auto">
        <p className="text-destructive text-sm">{t('volunteer.onboardForbidden')}</p>
        <button onClick={() => navigate('/')} className="mt-4 text-primary text-sm font-semibold">
          {t('profile.cancel')}
        </button>
      </div>
    );
  }

  const emptyMessage = sanitiseIlikeTerm(query)
    ? t('volunteer.listEmpty')
    : t('volunteer.listEmptyMine');

  return (
    <div className="bg-background pb-8">
      <div className="border-b border-border/50 px-4 py-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/', { replace: true })}
          className="p-2 rounded-xl hover:bg-muted/50 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold flex-1">{t('volunteer.myListTitle')}</h1>
        {canAddHathiMitra && (
          <button
            type="button"
            onClick={() => navigate('/volunteers/onboard')}
            className="p-2 rounded-xl bg-primary text-primary-foreground"
            aria-label={t('volunteer.onboardTitle')}
          >
            <UserPlus size={18} />
          </button>
        )}
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-3">
        <p className="text-sm text-muted-foreground">{t('volunteer.myListDesc')}</p>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('volunteer.searchPlaceholder')}
            className="w-full pl-9 pr-3 py-3 rounded-xl bg-muted/50 border border-border text-sm"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded border-border"
          />
          {t('volunteer.showInactive')}
        </label>

        {error && (
          <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl p-3">
            {error}
          </p>
        )}

        {loading || permissionLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground text-sm">
            <Loader2 size={16} className="animate-spin" /> {t('loading')}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-border/50 bg-muted/20 px-4 py-5 space-y-2">
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
            {canAddHathiMitra && !query.trim() && (
              <button
                type="button"
                onClick={() => navigate('/volunteers/onboard')}
                className="text-sm font-semibold text-primary"
              >
                {t('volunteer.onboardTitle')}
              </button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-border/40 rounded-2xl border border-border/50 overflow-hidden bg-card">
            {rows.map((row) => (
              <li key={row.id} data-testid="hathi-mitra-row" className="px-4 py-3">
                <p className="font-semibold text-sm text-foreground truncate">
                  {displayName(row) || t('volunteer.unnamed')}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{row.phone}</p>
                {!row.is_active && (
                  <span className="mt-1.5 inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-muted text-muted-foreground">
                    {t('volunteer.inactiveBadge')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
