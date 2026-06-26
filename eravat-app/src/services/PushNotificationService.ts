import { PushNotifications, type Token, type RegistrationError } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../supabase';

let listenersAttached = false;
let activeUserId: string | null = null;

async function persistToken(userId: string, token: Token): Promise<void> {
  const platform = Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
  const { error } = await supabase.from('push_tokens').upsert(
    {
      user_id: userId,
      token: token.value,
      platform,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,token' },
  );

  if (error) {
    console.error('[PushNotificationService] Failed to persist push token:', error);
  }
}

async function attachListeners(userId: string): Promise<void> {
  if (listenersAttached && activeUserId === userId) {
    return;
  }

  if (listenersAttached) {
    await PushNotifications.removeAllListeners();
    listenersAttached = false;
  }

  activeUserId = userId;

  await PushNotifications.addListener('registration', (token) => {
    if (!activeUserId) return;
    void persistToken(activeUserId, token);
  });

  await PushNotifications.addListener('registrationError', (error: RegistrationError) => {
    console.error('[PushNotificationService] Registration error:', error);
  });

  listenersAttached = true;
}

export class PushNotificationService {
  /**
   * Registers the device for push notifications and stores the FCM token.
   * Only works on native platforms.
   */
  static async register(userId: string): Promise<void> {
    if (Capacitor.getPlatform() === 'web') {
      if (import.meta.env.DEV) {
        console.log('[PushNotificationService] Push notifications are not supported on web. Skipping registration for user:', userId);
      }
      return;
    }

    if (import.meta.env.VITE_DISABLE_PUSH_NOTIFICATIONS === 'true') {
      console.log('[PushNotificationService] Push notifications are disabled (missing google-services.json). Skipping registration.');
      return;
    }

    try {
      await attachListeners(userId);

      let permStatus = await PushNotifications.checkPermissions();

      if (permStatus.receive === 'prompt') {
        permStatus = await PushNotifications.requestPermissions();
      }

      if (permStatus.receive !== 'granted') {
        throw new Error('User denied permissions!');
      }

      await PushNotifications.register();
    } catch (err) {
      console.error('[PushNotificationService] Error during push notification registration:', err);
    }
  }

  /**
   * Unregisters the device from push notifications and removes stored tokens.
   */
  static async unregister(userId: string): Promise<void> {
    if (Capacitor.getPlatform() === 'web') {
      return;
    }

    try {
      const { error } = await supabase.from('push_tokens').delete().eq('user_id', userId);
      if (error) {
        console.error('[PushNotificationService] Failed to delete push tokens:', error);
      }

      await PushNotifications.removeAllListeners();
      listenersAttached = false;
      activeUserId = null;
    } catch (err) {
      console.error('[PushNotificationService] Error during push notification unregistration:', err);
    }
  }
}
