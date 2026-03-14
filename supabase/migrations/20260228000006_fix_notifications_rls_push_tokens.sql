-- Fix: Replace self-referencing admin RLS policy on notifications table
-- with get_my_role() to prevent infinite recursion.
-- Also creates push_tokens table for native push notification support.

-- ══════════════════════════════════════════════════════════════════════
-- 1. Fix notifications admin RLS policy (infinite recursion bug)
-- ══════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Admins can Manage All Notifications" ON public.notifications;

CREATE POLICY "Admins can Manage All Notifications" ON public.notifications
    FOR ALL USING (public.get_my_role() IN ('admin', 'ccf'));

-- Also add service role policy (was missing)
DROP POLICY IF EXISTS "Service role can manage all notifications" ON public.notifications;

CREATE POLICY "Service role can manage all notifications" ON public.notifications
    FOR ALL USING (auth.role() = 'service_role');

-- ══════════════════════════════════════════════════════════════════════
-- 2. Create push_tokens table for native push notifications
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.push_tokens (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    token text NOT NULL,
    platform text NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    UNIQUE(user_id, token)
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON public.push_tokens(user_id);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to make migration idempotent
DROP POLICY IF EXISTS "Users can read own push tokens" ON public.push_tokens;
DROP POLICY IF EXISTS "Users can insert own push tokens" ON public.push_tokens;
DROP POLICY IF EXISTS "Users can update own push tokens" ON public.push_tokens;
DROP POLICY IF EXISTS "Users can delete own push tokens" ON public.push_tokens;
DROP POLICY IF EXISTS "Service role can manage all push tokens" ON public.push_tokens;

-- Users can manage their own tokens
CREATE POLICY "Users can read own push tokens"
    ON public.push_tokens FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own push tokens"
    ON public.push_tokens FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own push tokens"
    ON public.push_tokens FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own push tokens"
    ON public.push_tokens FOR DELETE
    USING (auth.uid() = user_id);

-- Service role can manage all tokens (for cleanup / edge functions)
CREATE POLICY "Service role can manage all push tokens"
    ON public.push_tokens FOR ALL
    USING (auth.role() = 'service_role');

-- ══════════════════════════════════════════════════════════════════════
-- 3. Trigger to send push notifications via Edge Function
-- ══════════════════════════════════════════════════════════════════════
-- Uses pg_net extension (available on Supabase hosted) to call the
-- send-push Edge Function asynchronously when a notification is created.

CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.send_push_on_notification()
RETURNS TRIGGER AS $$
BEGIN
    -- Call the send-push Edge Function asynchronously via pg_net
    -- The Edge Function URL is constructed from the Supabase project URL
    -- stored in app.settings.supabase_url (set once by admin)
    PERFORM extensions.http_post(
        url := current_setting('app.settings.supabase_url', true) || '/functions/v1/send-push',
        body := jsonb_build_object(
            'notification_id', NEW.id,
            'user_id', NEW.user_id,
            'title', NEW.title,
            'message', NEW.message,
            'report_id', NEW.report_id
        ),
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        )
    );
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Never block notification creation if push delivery fails.
    -- pg_net might not be configured or Edge Function might not be deployed yet.
    RAISE WARNING 'send_push_on_notification failed: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_send_push_on_notification ON public.notifications;

CREATE TRIGGER trigger_send_push_on_notification
AFTER INSERT ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION public.send_push_on_notification();
