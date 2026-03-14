import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';

export class PushNotificationService {
  /**
   * Registers the device for push notifications.
   * Only works on native platforms.
   */
  static async register(userId: string): Promise<void> {
    if (Capacitor.getPlatform() === 'web') {
      console.log('[PushNotificationService] Push notifications are not supported on web. Skipping registration for user:', userId);
      return;
    }

    try {
      let permStatus = await PushNotifications.checkPermissions();

      if (permStatus.receive === 'prompt') {
        permStatus = await PushNotifications.requestPermissions();
      }

      if (permStatus.receive !== 'granted') {
        throw new Error('User denied permissions!');
      }

      await PushNotifications.register();
      console.log('[PushNotificationService] Push notifications registered successfully for user:', userId);
    } catch (err) {
      console.error('[PushNotificationService] Error during push notification registration:', err);
    }
  }

  /**
   * Unregisters the device from push notifications.
   */
  static async unregister(userId: string): Promise<void> {
    if (Capacitor.getPlatform() === 'web') {
        console.log('[PushNotificationService] Push notifications are not supported on web. skipping unregistration for user:', userId);
      return;
    }

    try {
      await PushNotifications.removeAllListeners();
      console.log('[PushNotificationService] Push notifications unregistered successfully for user:', userId);
    } catch (err) {
      console.error('[PushNotificationService] Error during push notification unregistration:', err);
    }
  }
}
