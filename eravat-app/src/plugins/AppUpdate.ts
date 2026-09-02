import { registerPlugin } from '@capacitor/core';

export type AppUpdateInfo = {
  versionName: string;
  versionCode: number;
  packageName: string;
};

export interface AppUpdatePlugin {
  getAppInfo(): Promise<AppUpdateInfo>;
  canInstallPackages(): Promise<{ allowed: boolean }>;
  openInstallPermissionSettings(): Promise<void>;
  installApk(options: { path: string }): Promise<void>;
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
  }),
});
