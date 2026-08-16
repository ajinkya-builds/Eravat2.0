-- Child-table SELECT was doubled (own-row + territory). Keep one policy that
-- defers to reports RLS via EXISTS. Cut per-row OR cost on embeds.
-- Unread bell path gets a partial index.

DROP POLICY IF EXISTS "Users can read own observations" ON public.observations;
DROP POLICY IF EXISTS "Users can read own conflict damages" ON public.conflict_damages;
DROP POLICY IF EXISTS "Users can read own report media" ON public.report_media;

CREATE INDEX IF NOT EXISTS idx_notifications_unread_user_created
  ON public.notifications (user_id, created_at DESC)
  WHERE COALESCE(is_read, false) = false;

ANALYZE public.reports;
ANALYZE public.observations;
ANALYZE public.notifications;
ANALYZE public.conflict_damages;
