import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Network } from '@capacitor/network';
import { supabase } from '../../supabase';
import { useLanguage } from '../../contexts/LanguageContext';
import { lookupGeoFromPoint } from '../../lib/geoLookup';
import { SearchableSelect, type SearchableOption } from './SearchableSelect';

export type TerritoryValue = {
    division_id: string | null;
    range_id: string | null;
    beat_id: string | null;
};

const GEO_CACHE_KEY = 'eravat_geo_lists_v1';

type GeoCache = {
    divisions: SearchableOption[];
    rangesByDivision: Record<string, SearchableOption[]>;
    beatsByRange: Record<string, SearchableOption[]>;
};

function readCache(): GeoCache {
    try {
        const raw = localStorage.getItem(GEO_CACHE_KEY);
        if (raw) return JSON.parse(raw) as GeoCache;
    } catch { /* ignore */ }
    return { divisions: [], rangesByDivision: {}, beatsByRange: {} };
}

function writeCache(cache: GeoCache) {
    try {
        localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(cache));
    } catch { /* ignore */ }
}

export function TerritorySelect({
    value,
    onChange,
    latitude,
    longitude,
    includeBeat = true,
    required = true,
}: {
    value: TerritoryValue;
    onChange: (next: TerritoryValue) => void;
    latitude?: number | null;
    longitude?: number | null;
    includeBeat?: boolean;
    required?: boolean;
}) {
    const { t } = useLanguage();
    const [divisions, setDivisions] = useState<SearchableOption[]>([]);
    const [ranges, setRanges] = useState<SearchableOption[]>([]);
    const [beats, setBeats] = useState<SearchableOption[]>([]);
    const [lookingUp, setLookingUp] = useState(false);
    const [fromLocation, setFromLocation] = useState(false);
    const [lookupNonce, setLookupNonce] = useState(0);
    const lastLookupKey = useRef<string>('');

    useEffect(() => {
        const cached = readCache();
        if (cached.divisions.length) setDivisions(cached.divisions);
        let cancelled = false;
        void (async () => {
            const { data } = await supabase.from('geo_divisions').select('id, name').order('name');
            if (cancelled || !data) return;
            setDivisions(data);
            writeCache({ ...readCache(), divisions: data });
        })();
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        if (!value.division_id) {
            setRanges([]);
            return;
        }
        const cached = readCache().rangesByDivision[value.division_id];
        if (cached) setRanges(cached);
        let cancelled = false;
        supabase
            .from('geo_ranges')
            .select('id, name')
            .eq('division_id', value.division_id)
            .order('name')
            .then(({ data }) => {
                if (cancelled || !data) return;
                setRanges(data);
                const next = readCache();
                next.rangesByDivision[value.division_id!] = data;
                writeCache(next);
            });
        return () => { cancelled = true; };
    }, [value.division_id]);

    useEffect(() => {
        if (!includeBeat || !value.range_id) {
            setBeats([]);
            return;
        }
        const cached = readCache().beatsByRange[value.range_id];
        if (cached) setBeats(cached);
        let cancelled = false;
        supabase
            .from('geo_beats')
            .select('id, name')
            .eq('range_id', value.range_id)
            .order('name')
            .then(({ data }) => {
                if (cancelled || !data) return;
                setBeats(data);
                const next = readCache();
                next.beatsByRange[value.range_id!] = data;
                writeCache(next);
            });
        return () => { cancelled = true; };
    }, [includeBeat, value.range_id]);

    useEffect(() => {
        const listener = Network.addListener('networkStatusChange', (status) => {
            if (status.connected && lastLookupKey.current === '') {
                setLookupNonce((n) => n + 1);
            }
        });
        return () => {
            void listener.then((l) => l.remove());
        };
    }, []);

    useEffect(() => {
        if (latitude == null || longitude == null) return;
        if (value.division_id || value.range_id || value.beat_id) return;
        const key = `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
        if (lastLookupKey.current === key) return;
        let cancelled = false;
        setLookingUp(true);
        void lookupGeoFromPoint(latitude, longitude).then((match) => {
            if (cancelled) return;
            if (!match?.division_id) {
                // Leave key unset so reconnect / nonce retry can try again.
                setLookingUp(false);
                return;
            }
            lastLookupKey.current = key;
            setFromLocation(true);
            onChange({
                division_id: match.division_id,
                range_id: match.range_id,
                beat_id: includeBeat ? match.beat_id : null,
            });
            setLookingUp(false);
        }).catch(() => {
            if (!cancelled) setLookingUp(false);
        });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [latitude, longitude, includeBeat, lookupNonce, value.division_id, value.range_id, value.beat_id]);

    return (
        <div className="space-y-3 rounded-2xl border border-border bg-muted/10 p-4">
            <div className="flex items-start justify-between gap-2">
                <div>
                    <h4 className="text-sm font-semibold text-foreground">
                        {includeBeat ? t('dtl_confirm_territory') : t('dtl_confirm_division_range')}
                        {required && <span className="text-destructive"> *</span>}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        {fromLocation ? t('dtl_location_based_hint') : t('dtl_territory_on_sync')}
                    </p>
                </div>
                {lookingUp && <Loader2 size={16} className="animate-spin text-primary shrink-0 mt-0.5" />}
            </div>
            {fromLocation && (
                <p className="text-xs text-emerald-600 font-medium">{t('dtl_from_location')}</p>
            )}

            <SearchableSelect
                label={t('dtl_division')}
                value={value.division_id}
                options={divisions}
                required={required}
                placeholder={t('dtl_search')}
                onChange={(id) => {
                    setFromLocation(false);
                    onChange({ division_id: id, range_id: null, beat_id: null });
                }}
            />
            <SearchableSelect
                label={t('dtl_range')}
                value={value.range_id}
                options={ranges}
                required={required}
                disabled={!value.division_id}
                placeholder={t('dtl_search')}
                onChange={(id) => {
                    setFromLocation(false);
                    onChange({ ...value, range_id: id, beat_id: null });
                }}
            />
            {includeBeat && (
                <SearchableSelect
                    label={t('dtl_beat')}
                    value={value.beat_id}
                    options={beats}
                    required={required}
                    disabled={!value.range_id}
                    placeholder={t('dtl_search')}
                    onChange={(id) => {
                        setFromLocation(false);
                        onChange({ ...value, beat_id: id });
                    }}
                />
            )}
        </div>
    );
}
