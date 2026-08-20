-- In-app "Report an issue" inbox. Field users insert a note from any screen;
-- Command Center leadership (admin / ccf / dfo) can read all rows and mark resolved.
-- Login-page (anon) reports are allowed with user_id null.

CREATE TABLE public.support_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  notes text NOT NULL,
  page_path text,
  app_env text,
  app_version text,
  role text,
  phone text,
  display_name text,
  user_agent text,
  locale text,
  is_online boolean,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT support_issues_notes_len CHECK (char_length(notes) BETWEEN 3 AND 2000)
);

COMMENT ON TABLE public.support_issues IS
  'User-submitted issue notes from the in-app Report an issue control.';

CREATE INDEX support_issues_created_at_idx ON public.support_issues (created_at DESC);
CREATE INDEX support_issues_status_created_idx ON public.support_issues (status, created_at DESC);
CREATE INDEX support_issues_user_id_idx ON public.support_issues (user_id);

ALTER TABLE public.support_issues ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.support_issues_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_phone text;
  v_first text;
  v_last text;
  v_recent int;
BEGIN
  NEW.notes := btrim(COALESCE(NEW.notes, ''));
  IF char_length(NEW.notes) < 3 THEN
    RAISE EXCEPTION 'notes_required' USING ERRCODE = '22023';
  END IF;
  IF char_length(NEW.notes) > 2000 THEN
    RAISE EXCEPTION 'notes_too_long' USING ERRCODE = '22023';
  END IF;

  NEW.page_path := left(btrim(COALESCE(NEW.page_path, '')), 300);
  NEW.app_env := left(btrim(COALESCE(NEW.app_env, '')), 20);
  NEW.app_version := left(btrim(COALESCE(NEW.app_version, '')), 40);
  NEW.user_agent := left(btrim(COALESCE(NEW.user_agent, '')), 400);
  NEW.locale := left(btrim(COALESCE(NEW.locale, '')), 8);

  IF auth.uid() IS NOT NULL THEN
    NEW.user_id := auth.uid();
    SELECT p.role::text, p.phone, p.first_name, p.last_name
      INTO v_role, v_phone, v_first, v_last
    FROM public.profiles p
    WHERE p.id = auth.uid();
    NEW.role := v_role;
    NEW.phone := v_phone;
    NEW.display_name := btrim(concat_ws(' ', v_first, v_last));

    SELECT count(*)::int INTO v_recent
    FROM public.support_issues
    WHERE user_id = auth.uid()
      AND created_at > now() - interval '10 minutes';
    IF v_recent >= 5 THEN
      RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    NEW.user_id := NULL;
    NEW.role := NULL;
    NEW.display_name := NULL;
    NEW.phone := left(btrim(COALESCE(NEW.phone, '')), 20);
    IF NEW.phone = '' THEN NEW.phone := NULL; END IF;

    SELECT count(*)::int INTO v_recent
    FROM public.support_issues
    WHERE user_id IS NULL
      AND created_at > now() - interval '10 minutes';
    IF v_recent >= 20 THEN
      RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  NEW.status := 'open';
  NEW.resolved_at := NULL;
  NEW.resolved_by := NULL;
  RETURN NEW;
END;
$$;

CREATE TRIGGER support_issues_before_insert
  BEFORE INSERT ON public.support_issues
  FOR EACH ROW
  EXECUTE FUNCTION public.support_issues_before_insert();

CREATE OR REPLACE FUNCTION public.support_issues_before_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_lead_villagers() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  NEW.notes := OLD.notes;
  NEW.user_id := OLD.user_id;
  NEW.page_path := OLD.page_path;
  NEW.app_env := OLD.app_env;
  NEW.app_version := OLD.app_version;
  NEW.role := OLD.role;
  NEW.phone := OLD.phone;
  NEW.display_name := OLD.display_name;
  NEW.user_agent := OLD.user_agent;
  NEW.locale := OLD.locale;
  NEW.is_online := OLD.is_online;
  NEW.created_at := OLD.created_at;
  IF NEW.status = 'resolved' AND OLD.status IS DISTINCT FROM 'resolved' THEN
    NEW.resolved_at := now();
    NEW.resolved_by := auth.uid();
  ELSIF NEW.status = 'open' THEN
    NEW.resolved_at := NULL;
    NEW.resolved_by := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER support_issues_before_update
  BEFORE UPDATE ON public.support_issues
  FOR EACH ROW
  EXECUTE FUNCTION public.support_issues_before_update();

CREATE POLICY support_issues_insert_authenticated
  ON public.support_issues
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY support_issues_insert_anon
  ON public.support_issues
  FOR INSERT
  TO anon
  WITH CHECK (user_id IS NULL);

CREATE POLICY support_issues_select_own
  ON public.support_issues
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY support_issues_select_leadership
  ON public.support_issues
  FOR SELECT
  TO authenticated
  USING (public.can_lead_villagers());

CREATE POLICY support_issues_update_leadership
  ON public.support_issues
  FOR UPDATE
  TO authenticated
  USING (public.can_lead_villagers())
  WITH CHECK (public.can_lead_villagers());

REVOKE ALL ON public.support_issues FROM PUBLIC;
REVOKE ALL ON public.support_issues FROM anon;
REVOKE ALL ON public.support_issues FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.support_issues TO authenticated;
GRANT INSERT ON public.support_issues TO anon;
