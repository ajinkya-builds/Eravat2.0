-- Security: Create audit_log table for tracking admin operations.

CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  action text NOT NULL,
  target_table text NOT NULL,
  target_id text,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Index for querying by user and time
CREATE INDEX idx_audit_log_user_id ON public.audit_log (user_id);
CREATE INDEX idx_audit_log_created_at ON public.audit_log (created_at DESC);
CREATE INDEX idx_audit_log_target ON public.audit_log (target_table, target_id);

-- RLS: Only admins can read audit logs; service role can insert
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read audit logs"
  ON public.audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'ccf')
    )
  );

CREATE POLICY "Authenticated users can insert audit entries"
  ON public.audit_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can manage audit logs"
  ON public.audit_log FOR ALL
  USING (auth.role() = 'service_role');
