import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Loader2, Search, UserPlus } from 'lucide-react';
import { supabase } from '../supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { canOnboardVillagers, canReadVillagers } from '../lib/rbac';
import { sanitiseIlikeTerm } from '../lib/ilike';
import { villageNameOf, type VillagerRecord } from '../lib/villagerRegistry';

export default function VillagersList() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [rows, setRows] = useState<VillagerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canRead = canReadVillagers(profile?.role);
  const canOnboard = canOnboardVillagers(profile?.role);

  useEffect(() => {
    if (!canRead) return;

    let cancelled = false;
    const handle = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        let q = supabase
          .from('villagers')
          .select('id, name, mobile, latitude, longitude, village_id, created_by, is_active, alert_opt_in, villages(name)')
          .eq('created_by', profile?.id ?? '')
          .order('name')
          .limit(100);

        if (!showInactive) q = q.eq('is_active', true);

        const trimmed = sanitiseIlikeTerm(query);
        if (trimmed) {
          q = q.or(`name.ilike.%${trimmed}%,mobile.ilike.%${trimmed}%`);
        }

        const { data, error: fetchErr } = await q;
        if (fetchErr) throw fetchErr;
        if (!cancelled) setRows((data as unknown as VillagerRecord[]) ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t('hathiMitra.listFailed'));
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
  }, [canRead, query, profile?.id, showInactive, t]);

  if (!canRead) {
    return (
      <div className="min-h-screen p-6 max-w-lg mx-auto">
        <p className="text-destructive text-sm">{t('hathiMitra.onboardForbidden')}</p>
        <button onClick={() => navigate('/')} className="mt-4 text-primary text-sm font-semibold">
          {t('profile.cancel')}
        </button>
      </div>
    );
  }

  const emptyMessage = sanitiseIlikeTerm(query)
    ? t('hathiMitra.listEmpty')
    : t('hathiMitra.listEmptyMine');

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
        <h1 className="text-lg font-bold flex-1">{t('hathiMitra.myListTitle')}</h1>
        {canOnboard && (
          <button
            type="button"
            onClick={() => navigate('/villagers/onboard')}
            className="p-2 rounded-xl bg-primary text-primary-foreground"
            aria-label={t('hathiMitra.onboardTitle')}
          >
            <UserPlus size={18} />
          </button>
        )}
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-3">
        <p className="text-sm text-muted-foreground">{t('hathiMitra.myListDesc')}</p>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('hathiMitra.searchPlaceholder')}
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
          {t('hathiMitra.showInactive')}
        </label>

        {error && (
          <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl p-3">
            {error}
          </p>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground text-sm">
            <Loader2 size={16} className="animate-spin" /> {t('loading')}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-border/50 bg-muted/20 px-4 py-5 space-y-2">
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
            {canOnboard && !query.trim() && (
              <button
                type="button"
                onClick={() => navigate('/villagers/onboard')}
                className="text-sm font-semibold text-primary"
              >
                {t('hathiMitra.onboardTitle')}
              </button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-border/40 rounded-2xl border border-border/50 overflow-hidden bg-card">
            {rows.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  data-testid="villager-row"
                  onClick={() => navigate(`/villagers/${r.id}`)}
                  className="w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-muted/40 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm text-foreground truncate">{r.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {r.mobile}
                      {villageNameOf(r) ? ` · ${villageNameOf(r)}` : ''}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {!r.is_active && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-muted text-muted-foreground">
                          {t('hathiMitra.inactiveBadge')}
                        </span>
                      )}
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        r.alert_opt_in && r.is_active
                          ? 'bg-emerald-500/15 text-emerald-700'
                          : 'bg-amber-500/15 text-amber-700'
                      }`}>
                        {r.alert_opt_in && r.is_active
                          ? t('hathiMitra.optedInBadge')
                          : t('hathiMitra.optedOutBadge')}
                      </span>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-muted-foreground shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
