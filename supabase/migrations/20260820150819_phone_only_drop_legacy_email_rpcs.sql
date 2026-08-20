-- Phone+OTP only: drop leftover email lookup and unused staging RLS event helper.
-- Auth.users.email is a GoTrue system column (cannot drop). Identities are already
-- provider=phone on both environments; this removes public RPCs that leaked or
-- depended on email.

DROP FUNCTION IF EXISTS public.get_email_by_phone(text);

DROP EVENT TRIGGER IF EXISTS ensure_rls;
DROP FUNCTION IF EXISTS public.rls_auto_enable();

COMMENT ON FUNCTION public.check_phone_registered(text) IS
  'Checks if a phone number belongs to an active profile. Phone+OTP only; does not read or return auth.users.email.';
