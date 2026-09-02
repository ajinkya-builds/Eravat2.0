import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { AppUpdate } from '../plugins/AppUpdate';
import { clearStaleAppCaches, markPendingCacheClear } from '../lib/appCacheCleanup';
import { track } from '../lib/analytics';
import { logger } from '../lib/logger';

export type UpdateManifest = {
  versionCode: number;
  versionName: string;
  apkUrl: string;
  releasedAt?: string;
  notes?: string;
  changes?: string[];
  channel?: string;
  minVersionCode?: number;
};

export type UpdateCheckResult =
  | { status: 'up_to_date'; current: number; latest: number; versionName: string }
  | { status: 'available'; current: number; latest: number; versionName: string; manifest: UpdateManifest }
  | { status: 'unsupported' }
  | { status: 'error'; message: string };

const APK_FILENAME = 'eravat-update.apk';

/** Staging public manifest on Supabase Storage (overridable). */
export function defaultUpdateManifestUrl(): string {
  const fromEnv = (import.meta.env.VITE_UPDATE_MANIFEST_URL as string | undefined)?.trim();
  if (fromEnv) return fromEnv;
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '');
  if (supabaseUrl) {
    return `${supabaseUrl}/storage/v1/object/public/app-updates/staging/latest.json`;
  }
  return '';
}

export async function fetchUpdateManifest(url = defaultUpdateManifestUrl()): Promise<UpdateManifest> {
  if (!url) throw new Error('Update manifest URL is not configured');
  const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Could not fetch update info (${res.status})`);
  const data = (await res.json()) as UpdateManifest;
  if (!data?.versionCode || !data?.apkUrl) {
    throw new Error('Update manifest is incomplete');
  }
  return data;
}

export async function checkForAppUpdate(): Promise<UpdateCheckResult> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return { status: 'unsupported' };
  }
  try {
    const info = await AppUpdate.getAppInfo();
    const manifest = await fetchUpdateManifest();
    if (manifest.versionCode > info.versionCode) {
      return {
        status: 'available',
        current: info.versionCode,
        latest: manifest.versionCode,
        versionName: manifest.versionName,
        manifest,
      };
    }
    return {
      status: 'up_to_date',
      current: info.versionCode,
      latest: manifest.versionCode,
      versionName: info.versionName,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('AppUpdate', 'check failed', { message });
    return { status: 'error', message };
  }
}

export type InstallProgress = {
  phase: 'permission' | 'download' | 'cleanup' | 'install';
  progress?: number;
};

/**
 * Download the latest APK, clear stale web caches, and open the Android installer.
 * Preserves auth session + Dexie offline queues.
 */
export async function downloadAndInstallUpdate(
  manifest: UpdateManifest,
  onProgress?: (p: InstallProgress) => void,
): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    throw new Error('Updates are only available on the Android app');
  }

  onProgress?.({ phase: 'permission' });
  const { allowed } = await AppUpdate.canInstallPackages();
  if (!allowed) {
    await AppUpdate.openInstallPermissionSettings();
    throw new Error('install_permission_required');
  }

  onProgress?.({ phase: 'download', progress: 0 });
  track('app.update_download_started', {
    version_code: manifest.versionCode,
    version_name: manifest.versionName,
  });

  try {
    await Filesystem.deleteFile({ path: APK_FILENAME, directory: Directory.Cache }).catch(() => undefined);
  } catch {
    /* ignore */
  }

  const download = await Filesystem.downloadFile({
    url: manifest.apkUrl,
    path: APK_FILENAME,
    directory: Directory.Cache,
    progress: true,
  });

  const path = download.path;
  if (!path) throw new Error('Download did not return a file path');

  onProgress?.({ phase: 'cleanup' });
  markPendingCacheClear();
  await clearStaleAppCaches();

  onProgress?.({ phase: 'install' });
  track('app.update_install_started', { version_code: manifest.versionCode });
  await AppUpdate.installApk({ path });
}
