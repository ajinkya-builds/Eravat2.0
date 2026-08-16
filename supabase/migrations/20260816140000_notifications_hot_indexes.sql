-- Hot-path indexes for 50 concurrent sessions: user bell + admin log + villager queue FKs.

CREATE INDEX IF NOT EXISTS idx_notifications_user_created_at
  ON public.notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_created_at
  ON public.notifications (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_villager_alert_events_villager_id
  ON public.villager_alert_events (villager_id);

ANALYZE public.notifications;
