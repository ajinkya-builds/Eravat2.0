import { supabase } from '../supabase';

export interface Notification {
  id: string;
  user_id: string;
  report_id: string | null;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export class NotificationService {
  /**
   * Fetches the latest notifications for the current user.
   */
  static async getNotifications(limit: number = 20): Promise<Notification[]> {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        throw error;
      }

      return (data as Notification[]) || [];
    } catch (e) {
      console.error("Error fetching notifications:", e);
      return [];
    }
  }

  /**
   * Marks a single notification as read.
   */
  static async markAsRead(notificationId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);

      if (error) {
        throw error;
      }
      return true;
    } catch (e) {
      console.error("Error marking notification as read:", e);
      return false;
    }
  }

  /**
   * Marks all unread notifications for a user as read.
   */
  static async markAllAsRead(userId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', userId)
        .eq('is_read', false);

      if (error) {
        throw error;
      }
      return true;
    } catch (e) {
      console.error("Error marking all notifications as read:", e);
      return false;
    }
  }

  /**
   * Subscribes to real-time notification inserts for the current user.
   */
  static subscribeToNotifications(userId: string, callback: (payload: any) => void) {
    return supabase
      .channel(`public:notifications:user_id=eq.${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`
        },
        callback
      )
      .subscribe();
  }
}
