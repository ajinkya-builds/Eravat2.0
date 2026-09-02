/**
 * App version helpers. Source of truth: eravat-app/version.json
 * (synced into version.meta.ts via `npm run version:sync`).
 */
import { APP_VERSION_META } from '../version.meta';

export type AppVersionMeta = {
  versionName: string;
  versionCode: number;
  channel: string;
  releasedAt: string;
  changes: readonly string[];
};

export const APP_VERSION: AppVersionMeta = {
  versionName: APP_VERSION_META.versionName,
  versionCode: APP_VERSION_META.versionCode,
  channel: APP_VERSION_META.channel,
  releasedAt: APP_VERSION_META.releasedAt,
  changes: [...APP_VERSION_META.changes],
};

export function formatAppVersionLabel(
  meta: Pick<AppVersionMeta, 'versionName' | 'versionCode'> = APP_VERSION,
): string {
  return `${meta.versionName} (${meta.versionCode})`;
}

export function changelogSummary(meta: AppVersionMeta = APP_VERSION, limit = 8): string {
  return meta.changes.slice(0, limit).map((c) => `• ${c}`).join('\n');
}
