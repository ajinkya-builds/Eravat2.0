# Session Log — 2026-03-14 — Phone Login Fix (Rahul Kumar)

## Context

Rahul Kumar (DFO, Kanha Core) reported a login failure when using his phone number `9385379265`. The browser console showed a `400 (Bad Request)` error during the `signInWithPassword` call in `AuthContext.tsx`.

## Investigation

1.  **RPC Analysis**: The `get_email_by_phone` RPC was inspected. It was found to be performing an exact digit-match after stripping non-digits.
2.  **Database Check**: Rahul Kumar's profile showed his phone was stored as `+91-9385379265`. Digits: `919385379265` (12 digits).
3.  **Result**: The 10-digit input `9385379265` failed to match the 12-digit stored number.
4.  **Security Audit**: A previous security migration (`20260228000000`) had incorrectly revoked the `anon` grant for this RPC. Since login happens from an unauthenticated state, the RPC was inaccessible to the login flow.

## Root Causes

1.  **Normalization Mismatch**: RPC did not account for country code prefixes in the database.
2.  **Auth Permissions**: Anonymous (unauthenticated) users could not call the phone-to-email resolution RPC.

## Fixes Applied

### Database (Supabase Remote)

The `get_email_by_phone` function was updated with the following logic:
- Input is stripped to digits.
- Both input and stored phone numbers are truncated to their **last 10 digits** before comparison.
- `GRANT EXECUTE ON FUNCTION public.get_email_by_phone(text) TO anon` was restored.

### Local Migration

- Created `supabase/migrations/20260314180000_fix_phone_rpc_country_code.sql` to keep local environments in sync.

### Documentation Updates

- Updated `docs/ERAVAT_SOURCE_OF_TRUTH.md` under Resolved Bugs.
- Created this session log.

## Verification

- **Remote SQL Test**: `SELECT public.get_email_by_phone('9385379265')` now correctly returns `rahul.kumar71@eravat-test.com`.
- **Grant Test**: Verified `anon` role can execute the function.

## Next Steps

- Ensure the user tests with the correct password (default test password: `Test123!@#`).
- Monitor for any other phone formatting edge cases.
