import { supabase } from '../supabase';

export interface Notification {
  id: string;
  user_id: string;
  report_id: string | null;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  notification_type?: 'general' | 'proximity' | 'chain_of_command';
}

export class NotificationService {
  /**
   * Fetches the latest notifications for the current user.
   */
  static async getNotifications(limit: number = 20): Promise<Notification[]> {
    try {
      const { data: sessionData } = await supabase.auth.getUser();
      const userId = sessionData.user?.id;
      if (!userId) return [];

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        throw error;
      }

      return (data as Notification[]) || [];
    } catch {
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
    } catch {
      return false;
    }
  }

  /**
   * Marks specific notifications as read.
   */
  static async markAllAsRead(notificationIds: string[]): Promise<boolean> {
    if (!notificationIds.length) return true;
    
    try {
      const { data, error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .in('id', notificationIds)
        .select();

      if (error) {
        throw error;
      }
      return data && data.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Marks every unread notification for the current user as read
   * (not only the ones currently loaded in the bell dropdown).
   */
  static async markAllUnreadForCurrentUser(): Promise<boolean> {
    try {
      const { data: sessionData } = await supabase.auth.getUser();
      const userId = sessionData.user?.id;
      if (!userId) return false;

      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', userId)
        .eq('is_read', false);

      if (error) throw error;
      return true;
    } catch {
      return false;
    }
  }

  /** Unread badge count independent of the dropdown page size. */
  static async getUnreadCount(): Promise<number> {
    try {
      const { data: sessionData } = await supabase.auth.getUser();
      const userId = sessionData.user?.id;
      if (!userId) return 0;

      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false);

      if (error) throw error;
      return count ?? 0;
    } catch {
      return 0;
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
