import { MapPin, Loader2 } from 'lucide-react';
import { useGeolocation } from '../../hooks/useGeolocation';
import { useLanguage } from '../../contexts/LanguageContext';

export interface LocationValue {
  latitude: number | null;
  longitude: number | null;
}

interface LocationFieldsProps {
  value: LocationValue;
  onChange: (value: LocationValue) => void;
  required?: boolean;
}

export function LocationFields({ value, onChange, required = true }: LocationFieldsProps) {
  const { fetchLocation, loading, error } = useGeolocation();
  const { t } = useLanguage();

  const captureGps = async () => {
    const pos = await fetchLocation();
    if (pos?.coords) {
      onChange({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
    }
  };

  return (
    <div className="space-y-3 p-4 bg-primary/5 rounded-2xl border border-primary/10">
      <p className="text-xs font-bold text-primary flex items-center gap-2">
        <MapPin size={12} />
        {t('profile.gpsLocation')}
        {required && <span className="text-destructive">*</span>}
      </p>

      <button
        type="button"
        onClick={captureGps}
        disabled={loading}
        className="w-full py-2.5 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <MapPin size={16} />}
        {t('profile.captureGps')}
      </button>

      {error && (
        <p className="text-xs text-destructive">
          {error === 'LOCATION_PERMISSION_DENIED'
            ? t('geo_err_denied')
            : error === 'LOCATION_UNAVAILABLE'
              ? t('geo_err_unavailable')
              : error === 'LOCATION_TIMEOUT'
                ? t('geo_err_timeout')
                : error === 'LOCATION_UNSUPPORTED'
                  ? t('geo_err_unsupported')
                  : t('geo_err_failed')}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">{t('dtl_latitude')}</label>
          <input
            type="number"
            step="any"
            required={required}
            value={value.latitude ?? ''}
            onChange={(e) =>
              onChange({
                ...value,
                latitude: e.target.value === '' ? null : parseFloat(e.target.value),
              })
            }
            className="w-full p-3 rounded-xl bg-background border border-border text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">{t('dtl_longitude')}</label>
          <input
            type="number"
            step="any"
            required={required}
            value={value.longitude ?? ''}
            onChange={(e) =>
              onChange({
                ...value,
                longitude: e.target.value === '' ? null : parseFloat(e.target.value),
              })
            }
            className="w-full p-3 rounded-xl bg-background border border-border text-sm"
          />
        </div>
      </div>

      {value.latitude != null && value.longitude != null && (
        <p className="text-xs text-emerald-600 font-medium">
          {t('dtl_location_acquired')} {value.latitude.toFixed(6)}, {value.longitude.toFixed(6)}
        </p>
      )}
    </div>
  );
}
