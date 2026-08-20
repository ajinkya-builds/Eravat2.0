import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Search, UserPlus } from 'lucide-react';
import { supabase } from '../supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { canOnboardVillagers, canReadVillagers } from '../lib/rbac';

type VillagerRow = {
  id: string;
  name: string;
  mobile: string;
  latitude: number | null;
  longitude: number | null;
  village_id: string;
  villages?: { name: string } | { name: string }[] | null;
};

function villageNameOf(row: VillagerRow): string | null {
  const v = row.villages;
  if (!v) return null;
  if (Array.isArray(v)) return v[0]?.name ?? null;
  return v.name ?? null;
}

export default function VillagersList() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<VillagerRow[]>([]);
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
          .select('id, name, mobile, latitude, longitude, village_id, villages(name)')
          .eq('is_active', true)
          .eq('created_by', profile?.id ?? '')
          .order('name')
          .limit(50);

        const trimmed = query.trim();
        if (trimmed) {
          q = q.or(`name.ilike.%${trimmed}%,mobile.ilike.%${trimmed}%`);
        }

        const { data, error: fetchErr } = await q;
        if (fetchErr) throw fetchErr;
        if (!cancelled) setRows((data as unknown as VillagerRow[]) ?? []);
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
  }, [canRead, query, profile?.id]);

  if (!canRead) {
    return (
      <div className="min-h-screen p-6 max-w-lg mx-auto">
        <p className="text-destructive text-sm">{t('hathiMitra.onboardForbidden')}</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-primary text-sm font-semibold">
          {t('profile.cancel')}
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-16 z-30 glass-effect border-b border-border/50 px-4 py-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl hover:bg-muted/50 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold flex-1">{t('hathiMitra.listTitle')}</h1>
        {canOnboard && (
          <button
            type="button"
            onClick={() => navigate('/villagers/onboard')}
            className="p-2 rounded-xl hover:bg-muted/50 transition-colors text-primary"
            aria-label={t('hathiMitra.onboardTitle')}
          >
            <UserPlus size={20} />
          </button>
        )}
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('hathiMitra.searchPlaceholder')}
            className="w-full pl-9 pr-3 py-3 rounded-xl bg-muted/50 border border-border text-sm"
          />
        </div>

        {error && (
          <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl p-3">
            {error}
          </p>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground text-sm">
            <Loader2 size={16} className="animate-spin" /> {t('loading')}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">{t('hathiMitra.listEmpty')}</p>
        ) : (
          <ul className="divide-y divide-border/40 rounded-2xl border border-border/50 overflow-hidden bg-card">
            {rows.map((r) => (
              <li key={r.id} className="px-4 py-3">
                <p className="font-semibold text-sm text-foreground">{r.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {r.mobile}
                  {villageNameOf(r) ? ` · ${villageNameOf(r)}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
