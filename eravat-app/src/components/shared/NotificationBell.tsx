import { useState, useEffect, useRef } from 'react';
import { Bell, Check, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { NotificationService, type Notification } from '../../services/NotificationService';
import { useAuth } from '../../contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '../../lib/utils';
import { useLanguage } from '../../contexts/LanguageContext';

export function NotificationBell() {
    const { profile, user } = useAuth();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const { t } = useLanguage();

    useEffect(() => {
        if (!profile || !user) return;

        // Load initial notifications
        const loadNotifications = async () => {
            const data = await NotificationService.getNotifications(20);
            setNotifications(data);
            setUnreadCount(data.filter(n => !n.is_read).length);
        };

        loadNotifications();

        // Subscribe to new notifications
        const channel = NotificationService.subscribeToNotifications(user.id, (payload) => {
            console.log('New notification received:', payload);
            setNotifications(prev => {
                const newNotification = payload.new as Notification;
                // avoid duplicates
                if (prev.find(n => n.id === newNotification.id)) return prev;
                const updated = [newNotification, ...prev].slice(0, 20); // Keep last 20
                setUnreadCount(updated.filter(n => !n.is_read).length);
                return updated;
            });
        });

        return () => {
            // Clean up subscription
            channel.unsubscribe();
        };
    }, [profile, user]);

    useEffect(() => {
        // Close dropdown on click outside
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    const handleMarkAsRead = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const success = await NotificationService.markAsRead(id);
        if (success) {
            setNotifications(prev =>
                prev.map(n => n.id === id ? { ...n, is_read: true } : n)
            );
            setUnreadCount(prev => Math.max(0, prev - 1));
        }
    };

    const handleMarkAllAsRead = async () => {
        if (!user) return;
        const success = await NotificationService.markAllAsRead(user.id);
        if (success) {
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
            setUnreadCount(0);
        }
    };

    const handleNotificationClick = (notification: Notification) => {
        if (!notification.is_read) {
            // Create a synthetic event
            const fakeEvent = { stopPropagation: () => { } } as unknown as React.MouseEvent;
            handleMarkAsRead(notification.id, fakeEvent);
        }
        setIsOpen(false);

        // If report_id exists, we could navigate to a detail view
        // if (notification.report_id) {
        //   navigate(`/reports/${notification.report_id}`);
        // }
    };

    return (
        <div className="relative z-50" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2 rounded-full hover:bg-muted/50 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
                <Bell size={24} className="text-foreground" />
                {unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-destructive rounded-full border-2 border-background animate-pulse" />
                )}
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="absolute right-0 mt-2 w-80 max-h-[80vh] sm:w-96 glass-card border border-border/50 rounded-2xl shadow-xl overflow-hidden flex flex-col"
                    >
                        <div className="p-4 border-b border-border/30 flex justify-between items-center bg-background/80 backdrop-blur-md sticky top-0 z-10">
                            <h3 className="font-bold text-foreground flex items-center gap-2">
                                {t('nb_notifications')}
                                {unreadCount > 0 && (
                                    <span className="bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full font-medium">
                                        {unreadCount} {t('nb_new')}
                                    </span>
                                )}
                            </h3>
                            {unreadCount > 0 && (
                                <button
                                    onClick={handleMarkAllAsRead}
                                    className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
                                >
                                    {t('nb_mark_all_read')}
                                </button>
                            )}
                        </div>

                        <div className="overflow-y-auto overflow-x-hidden flex-1 no-scrollbar bg-background/60">
                            {notifications.length === 0 ? (
                                <div className="p-8 text-center flex flex-col items-center justify-center text-muted-foreground opacity-60">
                                    <Bell size={32} className="mb-3 opacity-50" />
                                    <p className="text-sm font-medium">{t('nb_no_notifications')}</p>
                                    <p className="text-xs mt-1">{t('nb_all_caught_up')}</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-border/20">
                                    {notifications.map((notif) => (
                                        <div
                                            key={notif.id}
                                            onClick={() => handleNotificationClick(notif)}
                                            className={cn(
                                                "p-4 hover:bg-muted/40 transition-colors cursor-pointer group flex gap-3 relative",
                                                !notif.is_read ? "bg-primary/5" : ""
                                            )}
                                        >
                                            {/* Unread indicator strip */}
                                            {!notif.is_read && (
                                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-r-full" />
                                            )}

                                            <div className={cn(
                                                "p-2 rounded-xl h-fit shrink-0 mt-0.5",
                                                !notif.is_read ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                                            )}>
                                                <Info size={18} />
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-start gap-2 mb-0.5">
                                                    <h4 className={cn(
                                                        "text-sm font-semibold truncate text-foreground",
                                                        !notif.is_read ? "" : "text-foreground/80"
                                                    )}>
                                                        {notif.title}
                                                    </h4>
                                                    <span className="text-[10px] whitespace-nowrap text-muted-foreground/80 font-medium pt-0.5 shrink-0">
                                                        {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
                                                    </span>
                                                </div>
                                                <p className={cn(
                                                    "text-xs leading-relaxed line-clamp-2",
                                                    !notif.is_read ? "text-muted-foreground" : "text-muted-foreground/60"
                                                )}>
                                                    {notif.message}
                                                </p>
                                            </div>

                                            {/* Explicit mark as read button that appears on hover */}
                                            {!notif.is_read && (
                                                <div className="shrink-0 flex items-center">
                                                    <button
                                                        onClick={(e) => handleMarkAsRead(notif.id, e)}
                                                        className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                                                        title="Mark as read"
                                                    >
                                                        <Check size={16} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Bottom fading edge */}
                        <div className="h-4 bg-gradient-to-t from-background to-transparent absolute bottom-0 left-0 right-0 pointer-events-none" />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
