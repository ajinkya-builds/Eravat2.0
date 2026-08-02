/** Convert a decimal degree to DMS string, e.g. 22.7196 → `22°43'10.6" N`. */
export function toDms(decimal: number, kind: 'lat' | 'lng'): string {
    if (!Number.isFinite(decimal)) return '—';
    const absolute = Math.abs(decimal);
    const degrees = Math.floor(absolute);
    const minutesFloat = (absolute - degrees) * 60;
    const minutes = Math.floor(minutesFloat);
    const seconds = (minutesFloat - minutes) * 60;
    const hemi =
        kind === 'lat'
            ? decimal >= 0
                ? 'N'
                : 'S'
            : decimal >= 0
              ? 'E'
              : 'W';
    return `${degrees}°${String(minutes).padStart(2, '0')}'${seconds.toFixed(1)}" ${hemi}`;
}

export function formatLatLngDms(lat: number, lng: number): string {
    return `${toDms(lat, 'lat')}, ${toDms(lng, 'lng')}`;
}
