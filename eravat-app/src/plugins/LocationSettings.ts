import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export type LocationState = {
  enabled: boolean;
};

export type NativeLastKnown = {
  latitude?: number;
  longitude?: number;
  accuracy?: number | null;
  timestamp?: number;
};

export interface LocationSettingsPlugin {
  isEnabled(): Promise<LocationState>;
  ensureEnabled(): Promise<LocationState>;
  getLastKnown(): Promise<NativeLastKnown>;
  addListener(
    eventName: 'locationStateChange',
    listenerFunc: (state: LocationState) => void,
  ): Promise<PluginListenerHandle>;
}

const webStub: LocationSettingsPlugin = {
  async isEnabled() {
    return { enabled: true };
  },
  async ensureEnabled() {
    return { enabled: true };
  },
  async getLastKnown() {
    return {};
  },
  async addListener() {
    return { remove: async () => undefined };
  },
};

export const LocationSettings = registerPlugin<LocationSettingsPlugin>('LocationSettings', {
  web: () => webStub,
});
