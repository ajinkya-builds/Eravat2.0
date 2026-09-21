import { registerPlugin } from '@capacitor/core';

export type AppUpdateInfo = {
  versionName: string;
  versionCode: number;
  packageName: string;
};

export type DownloadsSaveResult = {
  fileName: string;
  folder: string;
  uri?: string;
  path?: string;
};

export interface AppUpdatePlugin {
  getAppInfo(): Promise<AppUpdateInfo>;
  canInstallPackages(): Promise<{ allowed: boolean }>;
  openInstallPermissionSettings(): Promise<void>;
  installApk(options: { path: string }): Promise<void>;
  /** Copy APK into public Downloads so it survives uninstall. */
  saveApkToDownloads(options: { path: string; fileName?: string }): Promise<DownloadsSaveResult>;
  /** Open system uninstall confirmation for this app. */
  openUninstall(): Promise<void>;
  /** Best-effort open of the Downloads / Files UI. */
  openDownloads(): Promise<void>;
}

export const AppUpdate = registerPlugin<AppUpdatePlugin>('AppUpdate', {
  web: () => ({
    async getAppInfo() {
      return {
        versionName: import.meta.env.VITE_APP_VERSION || '2.0.0-web',
        versionCode: Number(import.meta.env.VITE_APP_VERSION_CODE || 0),
        packageName: 'web',
      };
    },
    async canInstallPackages() {
      return { allowed: false };
    },
    async openInstallPermissionSettings() {
      /* no-op on web */
    },
    async installApk() {
      throw new Error('APK install is only available on Android');
    },
    async saveApkToDownloads() {
      throw new Error('saveApkToDownloads is only available on Android');
    },
    async openUninstall() {
      throw new Error('openUninstall is only available on Android');
    },
    async openDownloads() {
      throw new Error('openDownloads is only available on Android');
    },
  }),
});
