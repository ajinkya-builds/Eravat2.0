import { useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import { useLanguage } from '../../contexts/LanguageContext';

export type VillageOption = {
  id: string;
  name: string;
  division_id: string | null;
};

interface VillageAutocompleteProps {
  value: string;
  onChange: (name: string, selected: VillageOption | null) => void;
  divisionId?: string | null;
  disabled?: boolean;
}

export function VillageAutocomplete({
  value,
  onChange,
  divisionId,
  disabled,
}: VillageAutocompleteProps) {
  const { t } = useLanguage();
  const [suggestions, setSuggestions] = useState<VillageOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 1) {
      setSuggestions([]);
      return;
    }

    let cancelled = false;
    const handle = window.setTimeout(async () => {
      setLoading(true);
      try {
        let query = supabase
          .from('villages')
          .select('id, name, division_id')
          .ilike('name', `%${q}%`)
          .order('name')
          .limit(12);

        if (divisionId) {
          query = query.or(`division_id.eq.${divisionId},division_id.is.null`);
        }

        const { data, error } = await query;
        if (error) throw error;
        if (!cancelled) setSuggestions((data as VillageOption[]) ?? []);
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [value, divisionId]);

  return (
    <div className="space-y-2 relative">
      <label className="text-sm font-medium ml-1">{t('hathiMitra.village')}</label>
      <input
        required
        disabled={disabled}
        value={value}
        onChange={(e) => {
          onChange(e.target.value, null);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Allow click on suggestion before closing
          window.setTimeout(() => setOpen(false), 150);
        }}
        placeholder={t('hathiMitra.villagePlaceholder')}
        className="w-full p-3 rounded-xl bg-muted/50 border border-border text-sm"
        autoComplete="off"
      />
      <p className="text-xs text-muted-foreground ml-1">{t('hathiMitra.villageHint')}</p>

      {open && (suggestions.length > 0 || loading) && (
        <ul className="absolute z-20 left-0 right-0 mt-1 max-h-48 overflow-auto rounded-xl border border-border bg-background shadow-lg">
          {loading && suggestions.length === 0 && (
            <li className="px-3 py-2 text-xs text-muted-foreground">{t('loading')}</li>
          )}
          {suggestions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted/60"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(s.name, s);
                  setOpen(false);
                }}
              >
                {s.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
