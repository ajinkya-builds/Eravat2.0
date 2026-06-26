# Eravat 2.0 — Authentication Architecture (Proposal)

| Field | Value |
| --- | --- |
| Status | **Draft / Decision Pending** |
| Authored | 2026-05-13 |
| Supersedes (when accepted) | `ERAVAT_SOURCE_OF_TRUTH.md` §3.3 (current OTP-only model) |
| Target acceptance | TBD by Ajinkya |
| Scope | Server-side identity, SMS routing, offline-capable login on Android |

> **Read this before making changes.** This document is a proposal — it represents
> the recommended path forward but no implementation has started against it. The
> "Decisions Pending" section at the bottom lists the open questions that must be
> resolved before Increment 1 can begin.

---

## 1. TL;DR — the recommended decision

**Hybrid architecture.** Supabase stays as the server-side identity authority. A
native-feeling, offline-first PIN-unlock layer is added on the Android device that
wraps a long-lived Supabase session. Phone OTP is repositioned from the *daily
login* mechanism to the *enrollment + periodic re-verification* mechanism.

| Concern                              | Where it lives                                                  |
| ------------------------------------ | --------------------------------------------------------------- |
| User identity, RLS, authorization    | **Supabase Auth + Postgres RLS** (unchanged)                    |
| First-time enrollment (high-trust)   | **Phone OTP via Supabase Auth → MSG91 SMS Hook** (online req.)  |
| Day-to-day login (most-used path)    | **Local 6-digit PIN unlock** (works offline, on Android)        |
| Optional convenience layer           | **Biometric (fingerprint/face)** on top of PIN (Phase 2)        |
| Session token storage                | **Android Keystore + PIN-derived key wrapping** (defense-in-depth) |
| Periodic high-trust re-verification  | **Forced phone OTP every 14 days** when network returns         |
| Server-side revocation               | **`profiles.is_active=false` + JWT custom claim hook**           |

This is **not** "build everything natively." A pure-native rewrite would forfeit
the existing investment in Supabase RLS, triggers, RPCs, and admin tools — for
marginal benefit. The reframe is: **OTP is the right tool for *enrollment* and
*periodic re-verification* — not for *daily unlock*.**

---

## 2. Constraints driving the design

1. **Operational environment** — Android app used by forest officers in
   no-network and low-network areas (interior forest, watchtowers, patrol routes).
   Users must be able to log in and use the app *without* a network round-trip.
2. **Scale (current commitment)** — at least 100 SMS/day baseline,
   ~500 active users in year 1.
3. **Cost sensitivity** — external SMS gateway routes can be costly (e.g., US long-code routes cost ~₹6.90/SMS).
4. **India regulatory** — DLT (TRAI / TCCCPR-2018) registration is mandatory for
   enterprise SMS. Without DLT registration, real-world delivery is unreliable.
5. **Existing investment** — significant work has been done on Supabase Phone Auth:
   - `enforce_strict_otp_phone_format` trigger on `auth.users`
   - `auth.identities` provider='phone' fabrication trigger
   - `get_email_by_phone` SECURITY DEFINER RPC for pre-OTP validation
   - `normalize_phone_e164` helper
   - Dual login UI (password + OTP tabs) in `Login.tsx`
   - Phone-aware `AuthContext` with `signInWithPhoneOTP` / `verifyOTP` / `resendOTP`
6. **Existing offline pattern is mature** — Dexie cache + `syncService` queue
   already handle offline data collection and deferred sync. Only the *auth
   layer* assumes online.

---

## 3. Why not just keep Supabase Auth Phone OTP as the only login?

Three structural reasons it cannot be the daily-login mechanism:

1. **OTP requires network on both ends.** Even when SMS delivers over a 2G voice
   channel, the OTP submission step (`supabase.auth.verifyOtp`) is an HTTPS POST.
   A user at a watchtower with zero connectivity can receive an SMS but cannot
   complete login.
2. **OTP is expensive even at MSG91 prices.** 500 users × daily login × ₹0.15
   ≈ ₹75/day — not catastrophic, but unnecessary if PIN works.
3. **OTP latency is wrong for daily UX.** Forest officers may open the app
   5–10× per shift. A 5–20 second SMS round-trip per open is workflow-hostile.

---

## 4. The three-layer auth model

```text
┌──────────────────────────────────────────────────────────────────────┐
│ LAYER 1 — Enrollment (online, infrequent)                            │
│ Goal: prove phone ownership → bind device → set up offline credential│
│ Frequency: first login + every 14 days + on PIN reset                │
│                                                                      │
│   User enters phone                                                  │
│      ↓                                                               │
│   Supabase signInWithOtp({phone, channel:'sms'})                     │
│      ↓                                                               │
│   Send SMS Hook → MSG91 (DLT-registered) → user's phone              │
│      ↓                                                               │
│   User enters OTP → verifyOtp → Supabase session issued              │
│      ↓                                                               │
│   App: "Set a 6-digit PIN to unlock the app offline"                 │
│      ↓                                                               │
│   PIN hashed (Argon2id); refresh_token wrapped with PIN-derived KEK  │
│   then wrapped again with Android Keystore key → stored              │
└──────────────────────────────────────────────────────────────────────┘
                                ↓
┌──────────────────────────────────────────────────────────────────────┐
│ LAYER 2 — Unlock (offline-capable, frequent)                         │
│ Goal: gate app access against the device-local credential            │
│ Frequency: every app open / wake from background                     │
│                                                                      │
│   User enters PIN                                                    │
│      ↓                                                               │
│   App: derive KEK from PIN+salt (Argon2id)                           │
│      ↓                                                               │
│   App: AES-GCM decrypt wrapped refresh_token using KEK               │
│      ↓ (success ⇒ PIN correct)                                       │
│   App reads from Dexie cache — app is usable                         │
│      ↓ (background, if network)                                      │
│   supabase.auth.refreshSession() → new JWT → re-wrap → store         │
└──────────────────────────────────────────────────────────────────────┘
                                ↓
┌──────────────────────────────────────────────────────────────────────┐
│ LAYER 3 — Server reconciliation (online, opportunistic)              │
│ Goal: revoke disabled users, refresh JWTs, sync queued data          │
│ Frequency: any time network is available                             │
│                                                                      │
│   When network returns:                                              │
│      ↓                                                               │
│   supabase.auth.refreshSession() → triggers custom_access_token      │
│   hook → checks profiles.is_active → if false, refresh denied        │
│      ↓                                                               │
│   On denial: wipe wrapped credentials → force Layer 1 re-enrollment  │
│      ↓                                                               │
│   On success: syncService flushes queued reports (existing flow)     │
└──────────────────────────────────────────────────────────────────────┘
```

**Key invariant:** every layer can degrade gracefully when the layer above it is
unreachable. Layer 2 doesn't need Layer 3 to function for up to 14 days. Layer 1
is only needed at boundaries (first enrollment, periodic re-verification, PIN
reset).

---

## 5. Component design — device side (Android / Capacitor)

### 5.1 PIN storage — hardware-backed double wrap

Don't store the PIN. Don't store a hash you can directly verify. Use the PIN as a
key derivation input, then verify by attempting decryption.

```text
At PIN setup:
  salt        := crypto.randomBytes(16)
  KEK         := Argon2id(PIN, salt, memory=64MB, parallelism=2, iterations=3)
  iv_session  := crypto.randomBytes(12)
  wrapped_rt  := AES-GCM-encrypt(refresh_token, KEK, iv_session)
                      // ← if decrypt of wrapped_rt fails later,
                      //   PIN was wrong (no separate hash needed)

Stored on device (each value Keystore-wrapped at rest):
  salt, iv_session, wrapped_rt, failed_count, locked_until, last_refresh_at,
  last_otp_verified_at
```

**Why this beats "hash the PIN, compare":**

- A PIN-hash-compare scheme leaks "PIN correct/wrong" before any payload is
  touched. An extracted device storage lets an attacker brute-force the PIN in
  milliseconds (a 6-digit PIN has 1M possibilities; Argon2id slows it but
  remains tractable offline).
- By making the PIN the *key* to the only thing worth stealing (the refresh
  token), brute force returns decrypted garbage when the guess is wrong — with
  no oracle telling the attacker "warmer/colder." Combined with the Android
  Keystore's hardware-backed outer wrap, an attacker would need to: extract the
  device storage **AND** extract the Keystore key (kernel-level exploit on
  modern Android) **AND** brute-force the PIN.

### 5.2 Android Keystore integration via Capacitor

Recommended community plugins (Capacitor 8.x is in use):

| Capability                 | Recommended plugin                                  |
| -------------------------- | --------------------------------------------------- |
| Secure storage (Keystore)  | `@capacitor-community/secure-storage`               |
| Biometric prompt           | `@aparajita/capacitor-biometric-auth` (Phase 2)     |
| Argon2id (PIN KDF)         | `argon2-browser` (WASM, runs in Capacitor WebView)  |
| AES-GCM                    | WebCrypto `crypto.subtle` (native in WebView)       |

If a strict hardware-backed Argon2 (vs WASM) becomes a requirement, write a
small custom Capacitor plugin in Kotlin (~100 LOC). Defer until v1 of PIN
unlock has shipped and we have field UX data.

### 5.3 Lockout policy

| Failed PIN attempts | Action                                                |
| ------------------- | ----------------------------------------------------- |
| 1–4                 | Show "try again"                                       |
| 5                   | 30-second lockout, error toast                         |
| 6–9                 | 5-minute lockout                                       |
| 10                  | 30-minute lockout, "Reset PIN by phone OTP" prominent  |
| 15                  | Wipe wrapped refresh token → force Layer 1 re-enrollment |

Lockout counter must persist across app restart (otherwise trivial to bypass by
closing and reopening).

### 5.4 Forced re-verification window

```text
At enrollment:     last_otp_verified_at = now()
At every unlock:   if (now - last_otp_verified_at) > 14 days:
                       show "Connect to internet and verify your phone to continue"
                       block PIN unlock until OTP completes
                   else:
                       PIN unlock proceeds
```

**Default: 14 days.** Tunable per role via a JWT claim (`max_offline_days`):

- `dfo`, `admin` → 7 days (more privilege → shorter window)
- `field_officer` → 14 days
- `beat_guard` → 30 days

The next OTP success extends the window. Inability to come online within the
window = polite-but-firm forced re-enrollment on next app open.

### 5.5 Session refresh strategy

```text
Layer 2 unlock succeeds → app reads from Dexie cache (works offline)
                                    ↓
                          Network detected?
                              ↓        ↓
                            YES       NO
                              ↓        ↓
   supabase.auth.refreshSession()   Queue any writes via syncService
                ↓                       (existing flow)
   New JWT (1 hr) issued
                ↓
   Re-wrap refresh_token with current PIN-derived KEK
                ↓
   Update last_refresh_at, last_otp_verified_at (if hook returned OK)
```

Refresh-token rotation is enabled in `supabase/config.toml`. Each refresh issues
a new refresh token; the device must persist the new one. If the device crashes
mid-rotation, fall back to the previous one (Supabase has
`refresh_token_reuse_interval = 10` configured already).

---

## 6. Component design — server side (Supabase)

### 6.1 Enable the custom access token hook

`supabase/config.toml` lines 206–208 currently have the scaffold commented out:

```toml
# [auth.hook.custom_access_token]
# enabled = true
# uri = "pg-functions://<database>/<schema>/<hook_name>"
```

Enable it and point at a Postgres function:

```sql
-- supabase/migrations/<timestamp>_auth_access_token_hook.sql
CREATE OR REPLACE FUNCTION public.auth_access_token_hook(event jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  user_id uuid := (event->'user_id')::uuid;
  claims  jsonb := event->'claims';
  profile record;
BEGIN
  SELECT is_active, role, max_offline_days, region_id
    INTO profile
    FROM public.profiles
   WHERE id = user_id;

  IF NOT FOUND OR profile.is_active = false THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message',   'account_disabled'
      )
    );
  END IF;

  claims := jsonb_set(claims, '{user_role}',        to_jsonb(profile.role));
  claims := jsonb_set(claims, '{max_offline_days}', to_jsonb(COALESCE(profile.max_offline_days, 14)));
  claims := jsonb_set(claims, '{region_id}',        to_jsonb(profile.region_id));

  RETURN jsonb_build_object('claims', claims);
END;
$$;

GRANT EXECUTE ON FUNCTION public.auth_access_token_hook(jsonb) TO supabase_auth_admin;
```

This delivers:

- **Centralized revocation** — flipping `is_active=false` causes the next refresh
  to fail. Devices forced back to Layer 1 within 14 days regardless of network
  pattern.
- **Role propagation into the JWT** — no extra DB round-trip needed on every
  request to know if the user is `admin` vs `beat_guard`.
- **Per-role offline window** — the device reads `max_offline_days` from its own
  JWT and self-enforces.

### 6.2 New tables

```sql
-- Device registry: which devices belong to which user
CREATE TABLE public.user_devices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id       text NOT NULL,
  platform        text NOT NULL,             -- 'android' | 'ios' | 'web'
  app_version     text,
  os_version      text,
  enrolled_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  revoked_at      timestamptz,
  UNIQUE (user_id, device_id)
);

CREATE INDEX ix_user_devices_user_id ON public.user_devices(user_id);

-- OTP / auth audit (compliance + forensics)
CREATE TABLE public.otp_audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  phone_hash      text NOT NULL,
  device_id       text,
  action          text NOT NULL CHECK (action IN
                    ('otp_requested', 'otp_verified', 'otp_failed',
                     'pin_set',       'pin_changed',  'pin_locked_out',
                     'session_refreshed', 'session_revoked')),
  ip_address      inet,
  user_agent      text,
  metadata        jsonb,
  occurred_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_otp_audit_phone_hash ON public.otp_audit_log(phone_hash);
CREATE INDEX ix_otp_audit_user_time  ON public.otp_audit_log(user_id, occurred_at DESC);
```

Rationale:

- **`user_devices`** gives admins a "remote-wipe" lever — set `revoked_at` on a
  stolen device, the next refresh on that device fails (device_id check is
  added to the access-token hook).
- **`otp_audit_log`** for Forest Department compliance and post-incident
  forensics ("when did this user last verify?").

### 6.3 Profile schema additions

```sql
ALTER TABLE public.profiles
  ADD COLUMN max_offline_days smallint NOT NULL DEFAULT 14
    CHECK (max_offline_days BETWEEN 1 AND 90),
  ADD COLUMN pin_required     boolean  NOT NULL DEFAULT true,
  ADD COLUMN pin_min_length   smallint NOT NULL DEFAULT 6
    CHECK (pin_min_length BETWEEN 4 AND 12);
```

Lets admin policy drive device behaviour without app updates.

### 6.4 Send SMS hook (replaces external SMS gateways)

```text
supabase/functions/send-sms-hook/index.ts
  Receives:    { user, sms: { phone, otp, template } }
  Calls:       MSG91 Send SMS API (DLT template + variables)
  Logs to:     otp_audit_log (action='otp_requested')
  Returns:     200 OK to Supabase Auth
```

~80 lines of Deno/TypeScript. MSG91 API key + DLT template ID live in
Supabase Edge Function secrets.

---

## 7. Why not pure-native (Kotlin) auth?

Worth examining to validate the hybrid choice. A pure-native flow would mean:

- A Kotlin Android module owns SMS sending (direct to MSG91) and OTP verification.
- Kotlin owns session minting via custom JWT issuance.
- The Capacitor WebView receives a JWT injected from the native side.

**Gains:**

- Marginally lower token-operation latency.
- Native Android SMS Auto-fill (the "OTP fills automatically when SMS arrives"
  UX). This is a real win.

**Losses:**

- Re-implement: RLS-friendly JWT signing (must match Supabase's HS256/RS256),
  user lifecycle, password reset, MFA TOTP (already enabled), admin invite flows
  in the `create-user`/`delete-user` Edge Functions.
- The `auth.identities` provider='phone' triggers become irrelevant — replaced
  by a custom auth backend.
- Two auth systems to keep in sync (web admin dashboard via Supabase + Android
  via native) → drift, bugs, security gaps.

**Decision: hybrid wins decisively.** SMS auto-fill is achievable via a
third-party Capacitor plugin regardless of which auth backend is used.
Reconsider only if Supabase Auth is outgrown for unrelated reasons
(e.g. external SAML/SSO integration).

---

## 8. Cost projection at target scale

Assumes 500 active users, 100 SMS/day enrollment baseline, 14-day re-auth cycle.

| Scenario                              |    SMS/month | Staging (Test OTP) |    MSG91 (DLT) |
| ------------------------------------- | -----------: | -----------------: | -------------: |
| Today (every login = OTP)             |     ~15,000 |              Free  | ~$22 (₹1,830) |
| With PIN (enrollment + 14-day reauth) |     ~1,500 |              Free  | ~$2.20         |
| Steady state, year 2                  |     ~2,000 |              Free  | ~$3            |

The PIN-first architecture also delivers an ~80% reduction in user-visible login
friction and unblocks the no-network use case entirely. The cost win is a bonus.

---

## 9. Migration plan (4 increments, each independently shippable)

### Increment 1 — India SMS routing fix (1–2 weeks; ~80% calendar = DLT wait)

- Sign up for MSG91 → submit DLT registration (5–7 day operator approval).
- Write `supabase/functions/send-sms-hook/index.ts` (~80 LOC).
- Enable Supabase Auth Send SMS Hook in the Dashboard.
- Cut over — Supabase Auth still owns OTP; just delivered via MSG91.
- **Zero code change in `eravat-app/`. Zero DB change.** Pure infra swap.
- Result: 30× cheaper, DLT-compliant. End users see no change.

### Increment 2 — Server-side groundwork (1 week)

- Enable `auth.hook.custom_access_token` in `config.toml`.
- Create `auth_access_token_hook()` SQL function.
- Create `user_devices` and `otp_audit_log` tables with RLS.
- Add `max_offline_days`, `pin_required`, `pin_min_length` columns to `profiles`.
- **Consolidate the two `supabase/migrations/` folders** (currently:
  `/supabase/migrations/` and `/eravat-app/supabase/migrations/`). Pick the
  root folder as the source of truth.
- Result: server is ready for offline-aware clients. No client change yet — the
  JWT just carries extra claims that aren't consumed.

### Increment 3 — PIN unlock layer in the Android app (2–3 weeks)

- Install `@capacitor-community/secure-storage`, `argon2-browser`.
- New routes/components:
  - `PinSetupScreen` — after successful OTP, mandatory before app entry on Android.
  - `PinUnlockScreen` — default landing on app open if wrapped credentials exist.
  - `PinResetFlow` — triggers re-OTP.
- Refactor `AuthContext`:
  - `signInWithPhoneOTP` / `verifyOTP` flow unchanged (still online-only).
  - Add `setupPin(pin)` — runs after `verifyOTP` success; stores wrapped refresh token.
  - Add `unlockWithPin(pin)` — decrypts wrapped refresh token, sets Supabase session.
  - Add `lockApp()` — clears in-memory session but keeps wrapped credentials.
- On app open: if wrapped credentials exist → show PIN unlock; if not → OTP flow.
- Platform-gate: PIN flow Android-only initially. Web admin keeps OTP/password.
- Result: end users get offline-capable login. Web admins unaffected.

### Increment 4 — Operational polish (1 week)

- Admin: device list + "revoke device" button (sets `user_devices.revoked_at`).
- Admin: force-reset-PIN button (clears wrapped credentials, triggers re-OTP).
- Telemetry: dashboard metric for "% users on PIN", "median offline streak."
- Update `docs/ERAVAT_SOURCE_OF_TRUTH.md` §3.3 with the new model.
- Update `docs/SYNC_RUNBOOK.md` with PIN-lockout and forced-reauth scenarios.

**Total:** ~6 weeks elapsed; ~3 weeks of actual implementation time.

---

## 10. Threat model

| Threat                              | Mitigation                                                                                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lost phone, unlocked screen          | Android lock screen is first barrier; PIN is second; refresh token wrapped with PIN-derived key. Attacker still needs the PIN.                                            |
| Lost phone, screen-locked            | Effectively safe — full-disk encryption + Keystore + PIN. Brute force requires kernel-level exploit.                                                                       |
| Stolen credentials database          | Stored values are doubly encrypted (PIN-KEK then Keystore-wrapped). Cleartext refresh token is never on disk.                                                              |
| Disgruntled ex-employee retains app  | Admin sets `is_active=false`. Next refresh (≤24 h) fails. Device forced back to OTP within 14 days regardless.                                                             |
| Brute-force PIN                      | Lockout + Argon2id KDF + 10-attempt wipe. A 6-digit PIN has 6 bits effective entropy after lockout, but lockout blocks online brute force and offline still defeats Keystore. |
| Token replay                         | Refresh-token rotation. Short JWT TTL (1 hr).                                                                                                                              |
| Server-side compromise               | Existing RLS + new hook means a leaked DB doesn't include device-side wrapped tokens. JWT signing keys would need to leak separately — Supabase manages those.             |
| Network MitM on OTP                  | TLS pins via Capacitor config. Short-lived OTPs (Supabase default).                                                                                                        |
| **SIM swap** (residual real-world risk) | India SIM-swap fraud is common. Mitigations: (1) admin marks recently-SIM-swapped numbers as "additional verification required"; (2) PIN re-entry on high-risk actions; (3) verification of registration logs. |

---

## 11. Decisions pending (fill in before Increment 1 starts)

- [ ] **Re-verification window default.** 14 days proposed for `field_officer`.
      Acceptable, or change to 7 / 21 / 30?
- [ ] **Per-role overrides.** Should `dfo` and `admin` get a stricter (7-day)
      window? Should `beat_guard` get more leeway (30 days)?
- [ ] **PIN reset by admin vs self-service-only.** If a user forgets their PIN,
      can an admin trigger a reset (audit-logged) or strictly self-service via OTP?
- [ ] **Web admin auth.** Add Passkeys / WebAuthn for the web `/admin/*` routes
      as a security upgrade — or keep password + TOTP MFA as is?
- [ ] **SMS auto-fill on Android.** Worth ~3 days of plugin work in Increment 3?
- [ ] **Multiple devices per user.** Allow one officer to enroll on two devices
      (e.g. phone + dept tablet) — yes/no? If yes, PIN is per-device; admin sees
      all enrolled devices.
- [ ] **MSG91 DLT registration details.** Header name candidates? Suggest
      `ERAVAT`. Principal Entity = "Forest Department, Madhya Pradesh" — confirm.
- [ ] **PIN length default.** 6 digits proposed. Acceptable, or 4 / 8?
- [ ] **SMS Gateway post-migration.** Transition staging/production to DLT-compliant gateway when needed.
- [ ] **Failed-attempt wipe threshold.** 15 failures proposed (full
      re-enrollment). Acceptable, or stricter (10) / looser (20)?

---

## 12. References

- Current OTP architecture: `docs/ERAVAT_SOURCE_OF_TRUTH.md` §3.3
- Sync model (pairs with offline auth): `docs/SYNC_RUNBOOK.md`
- Current Supabase config: `supabase/config.toml`
- Phone OTP DB triggers:
  - `supabase/migrations/20260315000000_otp_phone_auth_helpers.sql`
  - `eravat-app/supabase/migrations/20260315000001_enforce_strict_otp_phone_format.sql`
- Current AuthContext code: `eravat-app/src/contexts/AuthContext.tsx`
- Login UI: `eravat-app/src/pages/Login.tsx`

---

## 13. Change log

| Date       | Author                    | Change                                                |
| ---------- | ------------------------- | ----------------------------------------------------- |
| 2026-05-13 | Ajinkya + AI architecture session | Initial draft (after audit revealed cost + DLT + offline gaps) |
