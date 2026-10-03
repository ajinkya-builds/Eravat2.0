import { Capacitor } from '@capacitor/core';
import { track, type AnalyticsProps } from './analytics';
import { APP_VERSION_META } from '../version.meta';
import {
    getConnectivitySnapshot,
    type ConnectivitySnapshot,
} from './offlineSession';

/**
 * Extremely detailed GPS / location telemetry for field debugging.
 * All events share `acquire_id` so a single attempt can be reconstructed in PostHog.
 * Coords are rounded (~11 m) — never raw high-precision dumps.
 */

export type GeoPath = 'get_current' | 'watch' | 'native' | 'unknown';

export type GeoDialogKind =
    | 'location_accuracy'
    | 'permission'
    | 'provider_settings'
    | 'banner'
    | 'unknown';

let acquireSeq = 0;
let cachedConnectivity: ConnectivitySnapshot | null = null;
let connectivityFetchedAt = 0;

export function newGeoAcquireId(prefix = 'acq'): string {
    acquireSeq += 1;
    return `${prefix}_${Date.now().toString(36)}_${acquireSeq.toString(36)}`;
}

function uaSnippet(): string {
    if (typeof navigator === 'undefined') return 'unknown';
    return String(navigator.userAgent || '').slice(0, 160);
}

function inferDeviceFamily(ua: string): string {
    const u = ua.toLowerCase();
    if (u.includes('oneplus')) return 'oneplus';
    if (u.includes('samsung') || u.includes('sm-')) return 'samsung';
    if (u.includes('xiaomi') || u.includes('redmi') || u.includes('poco')) return 'xiaomi';
    if (u.includes('vivo')) return 'vivo';
    if (u.includes('oppo')) return 'oppo';
    if (u.includes('realme')) return 'realme';
    if (u.includes('pixel')) return 'pixel';
    if (u.includes('motorola') || u.includes('moto ')) return 'motorola';
    if (u.includes('huawei')) return 'huawei';
    if (u.includes('android')) return 'android_other';
    return 'unknown';
}

/** Refresh Capacitor Network + navigator snapshot for geo events (≤2s cache). */
export async function refreshGeoConnectivity(): Promise<ConnectivitySnapshot> {
    cachedConnectivity = await getConnectivitySnapshot();
    connectivityFetchedAt = Date.now();
    return cachedConnectivity;
}

function connectivityProps(): AnalyticsProps {
    const snap = cachedConnectivity;
    const navigatorOnline = typeof navigator !== 'undefined' ? navigator.onLine !== false : true;
    return {
        // Legacy field — keep for existing PostHog insights.
        online: snap ? !snap.offlineForGeo : navigatorOnline,
        navigator_online: snap?.navigatorOnline ?? navigatorOnline,
        network_connected: snap?.networkConnected,
        offline_for_geo: snap?.offlineForGeo ?? !navigatorOnline,
        connectivity_age_ms: snap ? Date.now() - connectivityFetchedAt : undefined,
    };
}

export function geoBaseProps(extra?: AnalyticsProps): AnalyticsProps {
    const ua = uaSnippet();
    return {
        app_version: APP_VERSION_META.versionName,
        app_version_code: APP_VERSION_META.versionCode,
        capacitor_platform: Capacitor.getPlatform(),
        is_native: Capacitor.isNativePlatform(),
        device_family: inferDeviceFamily(ua),
        ua_snippet: ua,
        ...connectivityProps(),
        ...extra,
    };
}

export function roundCoord(value: number | null | undefined): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    return Math.round(value * 1e4) / 1e4;
}

export function accuracyBucket(meters: number | null | undefined): string {
    if (typeof meters !== 'number' || !Number.isFinite(meters)) return 'unknown';
    if (meters <= 20) return '0_20';
    if (meters <= 50) return '21_50';
    if (meters <= 100) return '51_100';
    if (meters <= 300) return '101_300';
    if (meters <= 500) return '301_500';
    if (meters <= 1000) return '501_1000';
    return '1000_plus';
}

export function trackGeo(event: string, props?: AnalyticsProps): void {
    track(event, geoBaseProps(props));
}

export type GeoReadingProps = {
    acquire_id: string;
    path: GeoPath;
    source: string;
    accuracy_m?: number | null;
    lat?: number | null;
    lng?: number | null;
    age_ms?: number | null;
    provider?: string | null;
    accepted?: boolean;
    reason?: string;
    offline?: boolean;
    reading_n?: number;
    path_elapsed_ms?: number;
};

export function trackGeoReading(props: GeoReadingProps): void {
    const accuracy = props.accuracy_m ?? null;
    trackGeo('geo.reading', {
        acquire_id: props.acquire_id,
        path: props.path,
        location_source: props.source,
        accuracy_m: typeof accuracy === 'number' && Number.isFinite(accuracy) ? Math.round(accuracy) : undefined,
        accuracy_bucket: accuracyBucket(accuracy),
        lat_r4: roundCoord(props.lat),
        lng_r4: roundCoord(props.lng),
        age_ms: props.age_ms ?? undefined,
        provider: props.provider ? String(props.provider).slice(0, 32) : undefined,
        accepted: props.accepted,
        reason: props.reason,
        offline: props.offline,
        reading_n: props.reading_n,
        path_elapsed_ms: props.path_elapsed_ms,
    });
}

export function trackGeoDialog(props: {
    phase: 'shown' | 'result';
    dialog_kind: GeoDialogKind;
    source: string;
    enabled?: boolean;
    ensure_elapsed_ms?: number;
    error?: string;
}): void {
    trackGeo(props.phase === 'shown' ? 'geo.location_prompt_shown' : 'geo.location_prompt_result', {
        dialog_kind: props.dialog_kind,
        source: props.source,
        enabled: props.enabled,
        ensure_elapsed_ms: props.ensure_elapsed_ms,
        error: props.error,
    });
}
