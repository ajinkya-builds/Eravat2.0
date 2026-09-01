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
  /** Soft preference only — never hard-filters results (GPS/profile division can differ from village master data). */
  preferredDivisionId?: string | null;
  disabled?: boolean;
}

/** Prefer villages in the active division (or unassigned), then alphabetical. */
export function rankVillageOptions(
  rows: VillageOption[],
  preferredDivisionId?: string | null,
): VillageOption[] {
  if (!preferredDivisionId) {
    return [...rows].sort((a, b) => a.name.localeCompare(b.name));
  }
  return [...rows].sort((a, b) => {
    const rank = (v: VillageOption) =>
      v.division_id === preferredDivisionId || v.division_id == null ? 0 : 1;
    return rank(a) - rank(b) || a.name.localeCompare(b.name);
  });
}

export function VillageAutocomplete({
  value,
  onChange,
  preferredDivisionId,
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
      setLoading(false);
      return;
    }

    let cancelled = false;
    const handle = window.setTimeout(async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('villages')
          .select('id, name, division_id')
          .ilike('name', `%${q}%`)
          .order('name')
          .limit(24);

        if (error) throw error;
        if (!cancelled) {
          setSuggestions(rankVillageOptions((data as VillageOption[]) ?? [], preferredDivisionId).slice(0, 12));
        }
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
  }, [value, preferredDivisionId]);

  const showPanel = open && value.trim().length > 0;

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
        data-testid="village-autocomplete"
      />
      <p className="text-xs text-muted-foreground ml-1">{t('hathiMitra.villageHint')}</p>

      {showPanel && (
        <ul
          className="absolute z-20 left-0 right-0 mt-1 max-h-48 overflow-auto rounded-xl border border-border bg-background shadow-lg"
          data-testid="village-suggestions"
        >
          {loading && suggestions.length === 0 && (
            <li className="px-3 py-2 text-xs text-muted-foreground">{t('loading')}</li>
          )}
          {!loading && suggestions.length === 0 && (
            <li className="px-3 py-2 text-xs text-muted-foreground">{t('hathiMitra.villageNoMatches')}</li>
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
