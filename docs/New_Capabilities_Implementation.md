# Eravat 2.0 — Proposed Changes: Implementation Planning Document

> **Prepared:** 2026-05-13 | **Status:** Planning / Pre-Implementation  
> **Scope:** Three distinct change proposals, grounded in the current Eravat 2.0 codebase.

---

## Change 1: Authentication Method Overhaul

### 1. Analysis of Current State / Problem

The current login system (`eravat-app/src/pages/Login.tsx`) supports two modes:

- **Password mode** — resolves phone → email via the `get_email_by_phone` RPC, then authenticates with `supabase.auth.signInWithPassword`.
- **OTP mode** — sends a 6-digit code via Supabase's built-in phone auth, which is backed by **Twilio SMS**.
- **MFA** — optional TOTP second factor via Supabase MFA.

**Problems being addressed:**

1. **Twilio cost** — Twilio charges are in USD (₹8–12+ per OTP SMS at current rates), which adds up at scale across hundreds of field logins per day.
2. **Connectivity** — OTP delivery requires a live cellular signal. Beat guards operate in dense MP forest cover where 2G/3G is intermittent. An SMS OTP that never arrives is a hard login blocker.
3. **DLT (Distributed Ledger Technology) compliance** — India's TRAI (Telecom Regulatory Authority of India) mandates that every organization sending commercial or transactional SMS to Indian phone numbers must register on a DLT platform. Without DLT compliance, SMS delivery is blocked at the carrier level.

---

### 2. Proposed Solution

A three-layer approach: **replace the OTP carrier**, **add offline-capable biometric auth for Android**, and **achieve DLT compliance**.

#### 2A. Replace Twilio with an India-native, DLT-compliant SMS provider

Supabase supports a **Custom SMS Provider** webhook — you point Supabase phone auth at your own Edge Function, which forwards the OTP to any carrier. This means no Supabase vendor lock-in for the SMS layer.

**Recommended provider: MSG91**

| Factor | Detail |
|---|---|
| Cost | ₹0.15–0.25 per transactional SMS (vs ₹8–12 for Twilio) |
| DLT | Handles DLT Principal Entity registration and template approval as part of onboarding |
| Supabase fit | REST API, easy to call from a Deno Edge Function |
| Reliability | India-optimized routing; direct carrier peering with Airtel, Jio, Vodafone |
| Language | Supports Hindi/Marathi SMS templates — matches app's i18n strategy |

**Runner-up: Exotel**

Exotel is preferred if phone calls are also needed (relevant to Change 2). It supports both SMS OTP and outbound voice, giving one vendor for two features.

**Runner-up: Fast2SMS** (for dev/testing)

₹0.05–0.10/SMS; good for internal testing before moving to MSG91 for production. Not suitable as the sole production provider due to lower reliability guarantees.

#### 2B. Android Biometric Authentication (Offline-Capable)

The Capacitor build target makes native Android biometric authentication viable without any additional backend cost.

**Recommended approach:** Biometric as a secondary unlock after first login

- On first login (phone + password), the app stores the Supabase session token securely in the **Android Keystore** (encrypted storage tied to the device hardware).
- On subsequent logins, the user is prompted with a **BiometricPrompt** (fingerprint, face, or device PIN as fallback).
- If biometric passes, the stored session is decrypted and restored — no network call needed.
- If the stored session is expired, biometric falls back to password login and re-stores the new session after success.

**Why this solves the connectivity problem:** The biometric check is entirely local. A Beat Guard who has logged in before can re-authenticate in zero signal.

**Plugin:** `@capacitor-community/biometric-auth` wraps Android's `androidx.biometric.BiometricPrompt` API. It supports:

- Fingerprint
- Face recognition
- Fallback to device PIN/pattern/password

This plugin integrates directly into the existing Capacitor setup (JDK 21, `npx cap sync` workflow documented in `docs/README.md`).

#### 2C. DLT Compliance Framework

"DLT compliance" in the Indian context means compliance with **TRAI's DLT regulatory framework** — not blockchain DLT. TRAI mandated in 2021 that all commercial messaging must pass through operator-run DLT platforms before delivery.

---

### 3. Implementation Steps

#### Phase 1 — MSG91 Integration (replaces Twilio)

1. **Register with MSG91** at `msg91.com`. Create account under the Forest Department's entity name.
2. **DLT Registration** (see Section 7 for detail) — this must be completed before SMS delivery works at scale.
3. **Create a Supabase Edge Function** `send-otp-sms` that:
   - Receives the `phone` and `otp` from Supabase's custom SMS provider webhook.
   - Calls the MSG91 OTP API with the DLT-registered template and sender ID.
   - Returns `200 OK` to Supabase on success.
4. **Configure Supabase** → Authentication → Phone → Custom SMS Provider → point to the `send-otp-sms` function URL.
5. **Update `VITE_SUPABASE_*` secrets** — no client-side changes needed; the OTP flow in `Login.tsx` remains identical from the user's perspective.
6. Test with a live SIM on Airtel and Jio (the two dominant carriers in MP).

#### Phase 2 — Biometric Auth for Android

1. Add the plugin: `npm install @capacitor-community/biometric-auth` in `eravat-app/`.
2. Run `npx cap sync android` to link the native plugin.
3. Add `USE_BIOMETRIC` permission to `AndroidManifest.xml`.
4. Create `eravat-app/src/services/BiometricAuthService.ts`:
   - `isAvailable()` — checks device support and enrollment.
   - `storeSession(sessionJSON: string)` — encrypts and stores in Keystore via the plugin's secure storage.
   - `retrieveSession()` — biometric prompt → decrypt → return session.
   - `clearSession()` — on explicit logout.
5. Integrate into `eravat-app/src/contexts/AuthContext.tsx`:
   - After successful password login, call `BiometricAuthService.storeSession()` (with user consent prompt).
   - On app open, call `BiometricAuthService.retrieveSession()` first; if it returns a valid session, skip the login screen.
6. Add a "Use Biometric" toggle in `eravat-app/src/pages/profile/AppSettings.tsx` so users can opt out.

#### Phase 3 — MSG91 Fallback to Voice OTP

MSG91 also supports **Voice OTP** — it calls the user's phone and reads the code aloud. This is the fallback when SMS fails in low-signal areas. Configure this in the Edge Function: if the SMS API returns a failed delivery status, retry via MSG91's voice OTP endpoint.

---

### 4. Integration Points

| Component | Change |
|---|---|
| `supabase/functions/send-otp-sms/` | New Edge Function — MSG91 bridge |
| Supabase Dashboard → Auth → Phone | Point to new Edge Function URL |
| `AuthContext.tsx` | Add biometric session restore on app init |
| `Login.tsx` | Add biometric button (conditionally rendered if `BiometricAuthService.isAvailable()`) |
| `AppSettings.tsx` | Toggle for biometric opt-in |
| `AndroidManifest.xml` | `USE_BIOMETRIC` permission |
| `capacitor.config.ts` | No changes needed — plugin auto-links |

The existing OTP verification UI in `Login.tsx` remains fully intact. The change is purely in the SMS delivery layer, transparent to the frontend.

---

### 5. Cost Considerations

| Item | Current (Twilio) | Proposed (MSG91) |
|---|---|---|
| OTP SMS per message | ~₹10–12 | ~₹0.20 |
| Voice OTP fallback | Not available | ~₹0.50/call |
| DLT registration fee | One-time ₹5,900 (varies by platform) | Same — shared cost |
| Biometric auth | — | ₹0 (OS feature) |

At 100 OTP logins/day: Twilio ≈ ₹36,000/month vs MSG91 ≈ ₹600/month. **~98% cost reduction.**

---

### 6. Risks and Mitigation

| Risk | Likelihood | Mitigation |
|---|---|---|
| DLT approval delay (can take 2–4 weeks) | High | Start registration immediately; use Twilio as temporary fallback during transition |
| Biometric not enrolled on older devices | Medium | Always fall back to password mode gracefully; BiometricPrompt handles this natively |
| MSG91 delivery failure in remote areas | Low | Voice OTP fallback; password mode always available |
| Android Keystore reset on factory reset / ROM flash | Low | Treat as a new device; prompt password login and re-enroll biometric |
| MSG91 API downtime | Low | Keep Twilio configured as a secondary provider in the Edge Function |

---

### 7. DLT Compliance (TRAI India Framework)

**What DLT means here:** India's Telecom Regulatory Authority (TRAI) runs a distributed ledger system to track and authorize all commercial SMS. Without registration, carrier-level filters block delivery. This affects OTP SMS sent to villagers and forest staff alike.

**Registration steps:**

1. **Choose a DLT Platform** — register on any one of the telecom operator platforms; it syndicates across all carriers:
   - **Airtel DLT** (`airtel.in/business/dlt`) — recommended as Airtel has best MP forest coverage
   - **Jio TrueConnect** (`trueconnect.jio.com`)
   - **Vodafone Idea DLT** (`vilpower.in`)
   - **BSNL DLT** — relevant for government entities; BSNL has government pricing

2. **Principal Entity (PE) Registration** — register the Forest Department as the sending organization. Requires:
   - PAN / GST number of the Department
   - Business proof (government entity letter)
   - Authorized signatory details
   - Fee: ₹5,900 (one-time, refundable on platforms like Airtel)

3. **Header (Sender ID) Registration** — register the 6-character alphanumeric Sender ID that will appear on SMS (e.g., `ERAVAT` or `MPFORS`). Government entities can apply for a whitelisted Sender ID.

4. **Template Registration** — every OTP message body must be pre-approved. Register templates such as:
   - `Your Eravat OTP is {#var#}. Valid for 10 minutes. Do not share.`
   - Templates are approved within 2–7 business days.

5. **MSG91 DLT Assistance** — MSG91 has a dedicated DLT onboarding team that handles steps 1–4 on behalf of clients. This is their differentiator vs Twilio (which requires self-managed DLT).

**Organizations for compliance guidance:**
- **TRAI (Telecom Regulatory Authority of India)** — `trai.gov.in` — the regulatory body itself
- **COAI (Cellular Operators Association of India)** — industry body; publishes DLT compliance guides
- **MSG91 DLT Team** — practical implementation partner
- **C-DOT (Centre for Development of Telematics)** — government body overseeing telecom tech; relevant for BSNL DLT integration

---

## Change 2: Elephant Sighting Notifications for Villagers

### 1. Analysis of Current State / Problem

The existing notification system (`eravat-app/src/services/NotificationService.ts`) is in-app only: Supabase triggers insert rows into the `notifications` table → real-time subscription in the app surfaces them as bell-icon alerts for **Forest Department staff** (Range Officers, DFOs).

**Villagers are not in the system at all.** They have no app, no Supabase account, and no reliable internet. The only reliable communication channel for rural villagers in forested MP regions is a **phone call**.

The requirement: any villager within 5km of an elephant sighting should receive a phone call alert within minutes of the report being logged.

---

### 2. Proposed Solution

**Architecture overview:**

```
Beat Guard files report (offline/online)
        ↓
SyncService syncs to Supabase (reports + observations)
        ↓
PostgreSQL Trigger on observations INSERT
        ↓
pg_net: HTTP POST → Supabase Edge Function `notify-villagers`
        ↓
Edge Function: ST_DWithin query → fetch villagers within 5km
        ↓
Exotel API: Outbound call per villager (TTS in Hindi/Marathi)
        ↓
Fallback: SMS if call unanswered/failed
        ↓
call_log table: record attempt + status
```

**Recommended telephony provider: Exotel**

| Factor | Detail |
|---|---|
| Pricing | ₹0.40–0.60/minute for outbound calls; ₹0.15–0.25/SMS |
| India coverage | Direct carrier peering; excellent rural India coverage |
| TTS | Built-in text-to-speech in Hindi and English |
| API | REST API, simple to call from Deno Edge Functions |
| Compliance | DLT-compliant for SMS; voice calls don't require DLT registration |
| Multi-language | Supports regional IVR recordings (upload pre-recorded audio) |

**Why voice calls over SMS:** Many rural villagers in MP are not SMS-literate but will answer and understand a spoken alert. Pre-recorded audio in local dialect is more effective than text.

---

### 3. Implementation Steps

#### Step 1 — Villagers Table

```sql
CREATE TABLE villagers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name      text NOT NULL,
  last_name       text,
  phone           text NOT NULL UNIQUE,
  location        geography(POINT, 4326),   -- home/village GPS point
  village_name    text,
  beat_id         uuid REFERENCES geo_beats(id),
  added_by        uuid REFERENCES profiles(id),  -- the beat guard
  is_active       boolean DEFAULT true,
  preferred_lang  text DEFAULT 'hi',             -- 'hi' Hindi, 'mr' Marathi, 'en' English
  created_at      timestamptz DEFAULT now()
);
```

#### Step 2 — Call Log Table

```sql
CREATE TABLE villager_call_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id       uuid REFERENCES reports(id),
  villager_id     uuid REFERENCES villagers(id),
  phone           text NOT NULL,
  call_status     text,   -- 'initiated', 'answered', 'no_answer', 'failed'
  sms_fallback    boolean DEFAULT false,
  attempted_at    timestamptz DEFAULT now(),
  exotel_call_sid text    -- for tracking in Exotel dashboard
);
```

#### Step 3 — Supabase Edge Function: `notify-villagers`

This function does the heavy lifting:

```typescript
// supabase/functions/notify-villagers/index.ts (pseudocode)

serve(async (req) => {
  const { report_id, observation_id } = await req.json();

  // 1. Fetch the report's location and elephant count
  const { data: report } = await adminClient
    .from('reports')
    .select('location, observations(male_count, female_count, calf_count, unknown_count, total_elephants)')
    .eq('id', report_id)
    .single();

  // 2. Find all active villagers within 5km using PostGIS
  const { data: villagers } = await adminClient.rpc('villagers_within_radius', {
    center_point: report.location,
    radius_meters: 5000
  });

  // 3. For each villager, place an Exotel call
  for (const villager of villagers) {
    await placeExotelCall(villager, report);
    await logCallAttempt(report_id, villager);
  }
});
```

**The geospatial RPC:**

```sql
CREATE OR REPLACE FUNCTION villagers_within_radius(center_point geography, radius_meters float)
RETURNS TABLE(id uuid, phone text, first_name text, preferred_lang text) AS $$
  SELECT id, phone, first_name, preferred_lang
  FROM villagers
  WHERE is_active = true
    AND ST_DWithin(location, center_point, radius_meters);
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

#### Step 4 — PostgreSQL Trigger (fires on observation sync)

```sql
CREATE OR REPLACE FUNCTION trigger_villager_notifications()
RETURNS trigger AS $$
BEGIN
  -- Only fire for direct sightings, not indirect signs
  IF NEW.type = 'direct_sighting' THEN
    PERFORM pg_net.http_post(
      url := current_setting('app.notify_villagers_url'),
      body := json_build_object('report_id', NEW.report_id, 'observation_id', NEW.id)::text,
      headers := json_build_object('Authorization', 'Bearer ' || current_setting('app.service_key'))::text
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_observation_insert
  AFTER INSERT ON observations
  FOR EACH ROW EXECUTE FUNCTION trigger_villager_notifications();
```

The `pg_net` extension is available in Supabase by default and fires the HTTP request asynchronously — it does not block the sync write.

#### Step 5 — Exotel TTS Message

Register a TTS call flow in Exotel using their App Builder:

- Hindi script: *"सावधान! आपके गाँव के ५ किलोमीटर के अंदर हाथी देखे गए हैं। कृपया सुरक्षित स्थान पर रहें।"*
- English: *"Alert! Elephants have been spotted within 5 kilometres of your village. Please stay safe and indoors."*

#### Step 6 — SMS Fallback

If Exotel reports `no_answer` or `failed` on the call status webhook, the Edge Function sends an SMS via MSG91 (already set up from Change 1) with a short text alert.

---

### 4. Integration Points

| Component | Role |
|---|---|
| `villagers` table | New Supabase table; PostGIS-indexed on `location` |
| `villager_call_log` table | Audit trail of all call attempts |
| `observations` trigger | Fires `pg_net` POST on `direct_sighting` INSERT |
| `notify-villagers` Edge Function | Geospatial query + Exotel API calls |
| `villagers_within_radius` RPC | Reusable PostGIS proximity function |
| Exotel account | Telephony provider; registered with the Forest Department entity |
| MSG91 (from Change 1) | SMS fallback for unanswered calls |
| `AdminObservations.tsx` | Optionally: add a "Calls triggered" count column in the admin table |

The existing sync flow (`eravat-app/src/services/syncService.ts`) does not need changes — the trigger fires automatically on every `observations` INSERT, including synced offline reports.

---

### 5. Cost Considerations

**Call costs (Exotel):** Assuming a sighting triggers calls to an average of 10 villagers, at ₹0.50/min with a 30-second average call:

- ₹0.25 per villager per sighting
- 10 villagers × ₹0.25 = ₹2.50 per sighting event
- At 5 sightings/day = ₹12.50/day ≈ **₹375/month**

**SMS fallback (MSG91):** ₹0.20 × ~20% no-answer rate × 10 villagers × 5 sightings = ~₹1/day.

**Total estimated telephony cost: ~₹400–600/month.** This is operationally very affordable for a Forest Department deployment.

**One-time costs:**
- Exotel account setup and IVR recording (in-house or professional): ₹5,000–15,000
- Pre-recorded audio files in Hindi/Marathi from a professional voice artist: ₹3,000–8,000

---

### 6. Risks and Mitigation

| Risk | Likelihood | Mitigation |
|---|---|---|
| Villager phone switched off / out of range | High | Log as `no_answer`; no SMS fallback for switched-off phones (unavoidable) |
| Same sighting triggers multiple call waves (duplicate observations) | Medium | Debounce in the Edge Function: check `villager_call_log` for same `report_id` + `villager_id` within 30 minutes before calling |
| pg_net trigger fires before sync is fully committed | Low | Trigger is `AFTER INSERT`, not `BEFORE`; atomically safe |
| Exotel API rate limits | Low | Exotel supports concurrent calls; add a short queue/delay for large villager lists (>50) |
| Villager location data is stale | Medium | Beat guards should be able to update villager location (covered in Change 3) |
| False positives for indirect sighting types | Mitigated | Trigger only fires for `type = 'direct_sighting'`, not `indirect_sign` or `conflict_loss` |

---

## Change 3: Beat Guard Villager Addition Capability

### 1. Analysis of Current State / Problem

Currently, only **admins** can create users via the `create-user` Edge Function (`supabase/functions/create-user/index.ts`). There is no concept of a "villager" in the system — the `profiles` table only covers Forest Department staff.

Villagers need to exist in the system as **non-auth entities** (they have no app login, only a phone number for alerts). Beat guards know their local villages and residents better than any admin, so they are the natural point of data entry.

**Problem:** Beat guards need a simple mobile-first UI to register village residents with their phone number and location, scoped strictly to their own beat.

---

### 2. Proposed Solution

A **lightweight villager registration flow** embedded directly into the Beat Guard's Dashboard, using the `villagers` table from Change 2. Beat guards never create Supabase auth users — they insert rows into the `villagers` table only, which is permissioned by RLS to their beat assignment.

---

### 3. Implementation Steps

#### Step 1 — RLS Policies for `villagers` Table

```sql
-- Beat guards can INSERT villagers within their beat
CREATE POLICY "beat_guard_insert_villagers" ON villagers
  FOR INSERT WITH CHECK (
    beat_id IN (
      SELECT beat_id FROM user_region_assignments
      WHERE user_id = auth.uid()
    )
    AND auth.jwt() ->> 'role' = 'beat_guard'
  );

-- Beat guards can VIEW villagers in their beat
CREATE POLICY "beat_guard_select_villagers" ON villagers
  FOR SELECT USING (
    beat_id IN (
      SELECT beat_id FROM user_region_assignments
      WHERE user_id = auth.uid()
    )
  );

-- Range officers can view all villagers in their range
CREATE POLICY "range_officer_select_villagers" ON villagers
  FOR SELECT USING (
    beat_id IN (
      SELECT gb.id FROM geo_beats gb
      JOIN user_region_assignments ura ON ura.range_id = gb.range_id
      WHERE ura.user_id = auth.uid()
    )
  );

-- Admins have full access
CREATE POLICY "admin_all_villagers" ON villagers
  FOR ALL USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );
```

#### Step 2 — "Add Villager" UI Page

New file: `eravat-app/src/pages/AddVillager.tsx`

**Information captured:**

| Field | Required | Notes |
|---|---|---|
| First Name | Yes | Text input |
| Last Name | No | Text input |
| Village Name | Yes | Free text; helps with manual identification |
| Phone Number | Yes | 10-digit Indian mobile, validated for uniqueness |
| Preferred Language | Yes | Dropdown: Hindi / Marathi / English (for call TTS) |
| Location (GPS) | Recommended | Uses `useGeolocation` hook; beat guard can capture on-site or skip |

**Beat ID:** Automatically populated from the Beat Guard's `user_region_assignments` — the user never chooses this manually.

#### Step 3 — Multi-Step Form Flow

Mirrors the existing `ReportStepper` pattern for UX consistency:

```
Step 1: Basic Info
  ├── First Name (required)
  ├── Last Name (optional)
  └── Village Name (required)

Step 2: Contact
  ├── Phone (+91 prefix locked, 10-digit input)
  └── Preferred language for alerts

Step 3: Location
  ├── [Capture GPS Location] button → useGeolocation hook
  ├── Display captured coordinates on mini-map
  └── [Skip] option (location can be added later)

Step 4: Confirm & Submit
  ├── Summary card of entered data
  ├── Beat name auto-displayed (read-only)
  └── [Register Villager] button
```

#### Step 4 — Validation

- **Phone uniqueness:** Before insert, query `villagers` table for existing phone (last 10 digits, same normalization logic as the existing `get_email_by_phone` RPC pattern).
- **Phone format:** Strip non-numeric, validate 10 digits, same pattern as `Login.tsx` OTP input.
- **Beat scope:** RLS enforces this at the database level; the UI also pre-fills and disables the beat field.
- **Offline handling:** If the beat guard is offline, queue the villager record in Dexie (same `sync_status = 'pending'` pattern as reports) and sync when online.

#### Step 5 — Route and Navigation

Add to `eravat-app/src/App.tsx`:

```tsx
<Route path="/add-villager" element={
  <ProtectedRoute allowedRoles={['beat_guard', 'range_officer', 'admin']}>
    <AddVillager />
  </ProtectedRoute>
} />
```

Add a **"Manage Villagers"** card to the Beat Guard's Dashboard view (hidden from other roles or shown read-only).

#### Step 6 — Dexie (Offline) Schema Extension

Extend `eravat-app/src/db.ts` with a `villagers` local table:

```typescript
villagers: '++id, phone, beat_id, sync_status, created_at'
```

Extend `syncService.ts` with a `syncPendingVillagers()` method that upserts records from local Dexie to the Supabase `villagers` table when connectivity is restored.

#### Step 7 — Villager List View

A read-only list within the Beat Guard's profile area showing all villagers they've registered:
- Name, village, phone (masked: `XXXXXX4447`), registration date
- Edit button (update location, phone, language preference)
- Deactivate toggle (soft-delete via `is_active = false`)

---

### 4. Integration Points

| Component | Role |
|---|---|
| `villagers` table + RLS | Supabase data layer; beat-scoped by default |
| `AddVillager.tsx` | New page, mirrors ReportStepper UX |
| `App.tsx` | New protected route for `/add-villager` |
| `Dashboard.tsx` | "Manage Villagers" card, visible to beat_guard role |
| `db.ts` | Dexie `villagers` table for offline queue |
| `syncService.ts` | `syncPendingVillagers()` method |
| `useGeolocation` hook | Reused from `eravat-app/src/hooks/useGeolocation.ts` |
| `ProtectedRoute.tsx` | Role gate: `beat_guard`, `range_officer`, `admin` |

---

### 5. Cost Considerations

- **Zero additional infrastructure cost** — the `villagers` table sits in the existing Supabase project.
- **Supabase row limits** — the free tier supports up to 500MB database; with ~50 bytes/villager row, 1 million villagers ≈ 50MB. Not a concern at current scale.
- **Development effort only** — an estimated 3–5 development days to build and test the full flow including offline sync.

---

### 6. Risks and Mitigation

| Risk | Likelihood | Mitigation |
|---|---|---|
| Duplicate phone entries across beats | Medium | UNIQUE constraint on `villagers.phone`; show a user-friendly "Already registered" error |
| Beat guard registers villager in wrong beat | Low | Beat ID is auto-filled from their assignment; RLS blocks cross-beat inserts |
| Villager location captured incorrectly (GPS drift in forest) | Medium | Location is optional at registration; edit is always available |
| Beat guard offline when adding villager | High (by design) | Dexie offline queue with `sync_status = 'pending'`; exact same pattern as reports |
| Privacy concern — storing villager phone numbers | Medium | Phones are stored for emergency alert purposes only; no RLS exposes them outside the beat hierarchy; phone is masked in any list views |

---

---

## Change 4: Admin Dashboard Redesign

> **Status:** Implemented (2026-05-13) — parked pending review  
> **Constraint:** Zero database schema changes; all data derived from existing tables.

### 1. Overview

Replaced the single monolithic admin dashboard with **five dedicated pages**, accessible via a restructured sidebar. The existing management pages (Users, Divisions, Observations, Settings) were preserved untouched.

---

### 2. Files Changed

#### `eravat-app/src/layouts/admin/AdminLayout.tsx` — Sidebar restructure

- Added two sidebar sections: **DASHBOARDS** and **MANAGE**
- DASHBOARDS links: General (`/admin/general`), Conflict (`/admin/conflict`), Live Dashboard (`/admin/live`), Latest Entries (`/admin/latest`), User Stats (`/admin/user-stats`)
- MANAGE links: Users, Divisions, Observations, Settings (all existing, unchanged)
- Extracted `NavButton` sub-component for DRY rendering
- New lucide-react icons: `AlertTriangle`, `Clock`, `BarChart2`
- Section labels rendered as `text-[10px] tracking-widest text-muted-foreground/60`

#### `eravat-app/src/App.tsx` — Route additions

- Removed `AdminDashboard` import
- Added imports for all 5 new pages
- `/admin` index now redirects to `/admin/general`
- 5 new routes: `general`, `conflict`, `live`, `latest`, `user-stats`

---

### 3. New Pages

#### `eravat-app/src/pages/admin/AdminGeneral.tsx`

General overview dashboard.

**Filters:** Division dropdown + Start/End date pickers + Apply button

**KPI Cards (7):**
| Card | Source | Note |
|---|---|---|
| Total Sightings | `observations` count | — |
| Total Damages | `conflict_damages` count | — |
| Human Death | — | ⚠ Schema gap — shows 0 |
| Human Injury | — | ⚠ Schema gap — shows 0 |
| Crop Damage | `conflict_loss_details` contains 'crop' | — |
| Grain Damage | — | ⚠ Schema gap — shows 0 |
| House Damage | `conflict_damages.category = 'property'` | — |

**Bar Chart:** Monthly Sightings vs Damages (Recharts `BarChart`), grouped by `MMM yy` format

**Division Table:** Name | Sightings/Calls | Officials | Villagers | App Users  
- Beat filter: fetch range IDs for division → beat IDs → `beat_id IN(...)`  
- Notifications count approximated from `notifications` table  
- Officials = `profiles` with role in `OFFICIAL_ROLES` constant  
- Villagers = `profiles` with `role = 'volunteer'` (proxy)

**Map:** Existing `MapComponent` (Leaflet/wkx); KML toggle is UI scaffolding only (no functional KML overlay yet)

---

#### `eravat-app/src/pages/admin/AdminConflict.tsx`

Conflict-specific analytics.

**Filters:** Same division + date filter bar as General

**KPI Cards (5):** Human Death ⚠, Human Injury ⚠, Crop Damage, Grain Damage ⚠, House Damage

**Pie Chart:** Damage Types Distribution (Recharts `PieChart`)  
- Derives from both `conflict_loss_details` (text[]) and `conflict_damages.category`  
- `LOSS_COLORS` map keyed by loss type string  
- Custom label renderer showing percentage

**Line Chart:** Monthly Damage Trends — separate lines for crop, livestock, property, fencing, other

**Query filter:** `.eq('observations.type', 'conflict_loss')`

**Map:** Same Leaflet map with KML toggle scaffolding

---

#### `eravat-app/src/pages/admin/AdminLive.tsx`

Live sighting feed with time-range filtering.

**Filters:**  
- Division dropdown  
- Time range radio pills: Today | 3 Days | 7 Days | 30 Days | 60 Days | 90 Days | 180 Days

**KPI Cards (6):** Total Warnings (notification count), Warning Recipients (distinct user_ids), Crop Damage, Property Damage, Human Injury ⚠, Human Death ⚠

**Sighting Table** (paginated, `PAGE_SIZE = 20`):  
| Column | Source |
|---|---|
| Division | `geo_beats → geo_ranges → geo_divisions` |
| Reported By | `profiles.full_name` + `profiles.phone` |
| Created By ⚠ | Same as reporter (no separate field in schema) |
| Sighted By ⚠ | Same as reporter (no separate field in schema) |
| Sighting Time | `reports.device_timestamp` |
| Uploaded Time | `reports.created_at` |
| Damage | `conflict_damages.category` |
| Warning Recipients | Count from `notifications` for that `report_id` |

**Pagination:** `ChevronLeft` / `ChevronRight` with page info

**Two fetches:** Paginated reports for table + all reports for KPI sub-counts

---

#### `eravat-app/src/pages/admin/AdminLatestEntries.tsx`

Most recent report per division, color-coded by staleness.

**No filters**

**Data strategy:** Fetch latest 1000 reports `ORDER BY device_timestamp DESC`, group client-side using `Map<divisionId, entry>` keeping only the first (latest) occurrence per division. Divisions with no reports included as empty rows.

**Row color coding:**
| Color | Condition | Tailwind |
|---|---|---|
| Green | Reported today (`isToday`) | `bg-emerald-500/8 border-l-4 border-l-emerald-500` |
| Yellow | ≤ 30 days (`differenceInDays ≤ 30`) | `bg-amber-500/8 border-l-4 border-l-amber-400` |
| Red | > 30 days | `bg-destructive/6 border-l-4 border-l-destructive/60` |

**Age badge:** `ageBadge()` renders "Today" / "Xd ago" pill next to datetime

**Location:** Parses `reports.location` (PostGIS WKB hex) using `wkx.Geometry.parse(Buffer.from(hex, 'hex'))` → extracts `.x` (lng) / `.y` (lat) → Google Maps URL

**Roaming Reason:** Approximated by `roamingReason()` function:
- `direct_sighting` → "Direct Sighting"
- `indirect_sign` → first item in `indirect_sign_details`, or "Indirect Sign"
- `conflict_loss` → first item in `conflict_loss_details`, or "Conflict / Loss"
- ⚠ Schema banner displayed explaining approximation

**No. of Elephants:** `observations.total_elephants` (shown only when > 0)

**Columns:** Division Name | Reported Date & Time | Location | No. of Elephants | Roaming Reason ⚠ | Damage

---

#### `eravat-app/src/pages/admin/AdminUserStats.tsx`

User management and statistics.

**Search bar:** Name (≥ 3 chars) or mobile number (≥ 5 digits) — shows hint text when query too short  
**Division filter:** Dropdown (All Divisions / per division)

**KPI Cards (6):**
| Card | Source | Note |
|---|---|---|
| Total Users | All `profiles` rows | — |
| Total Officials | `profiles` where `role IN (OFFICIAL_ROLES)` | — |
| Total Villagers | `profiles` where `role = 'volunteer'` | ⚠ Proxy — no villagers table yet |
| Active Users | `profiles` where `is_active = true` | — |
| Unverified Requests | `profiles` where `is_active = false` | — |
| Dormant Users | `is_active = true AND updated_at < 90 days ago` | ⚠ Approximation |

**Tab switcher:** Users | Officials | Villagers — filters the table in-place, no re-fetch

**Table columns:** ID (8-char truncated) | Name | Mobile | District/Division | Village (geo_beats.name proxy) | Role badge | Created At | Delete action

**Role badges:** Color-coded pills per role (`ROLE_BADGE` map): admin → purple, ccf → blue, dfo → indigo, beat_guard → lime, volunteer → emerald, etc.

**Delete action:** `window.confirm` → `profiles.delete().eq('id', userId)` → optimistic row removal from state

**Pagination:** Sliding window of 5 page buttons; shows "X–Y of Z users" range info

**Village column:** Derived from `user_region_assignments → geo_beats.name` (closest available proxy for village-level location)

---

### 4. Schema Gaps Flagged (⚠)

These KPIs appear in the spec but have no supporting schema column. All display as `0` with a ⚠ badge:

| KPI | Missing Schema |
|---|---|
| Human Death | No column in any table |
| Human Injury | No column in any table |
| Grain Damage | No column (`conflict_loss_details` text[] has 'No loss', 'crop', etc. but no 'grain') |
| Roaming Reason | No dedicated column; approximated from obs type + detail arrays |
| Created By / Sighted By | Both map to the single `reports.reporter_id`; no separate "sighted by" field |
| Total Villagers | No `villagers` table yet; uses `role='volunteer'` in profiles as proxy |
| Dormant Users | No `last_active_at` column; approximated from `updated_at` |

A schema migration (covered in Changes 2 & 3 above) would resolve the villagers gap. The remaining KPIs require new columns on `observations` or `profiles`.

---

### 5. Known Limitations / Future Work

- **KML overlay** — "Show KML" toggle is UI scaffolding only. `MapComponent` (Leaflet) does not yet support KML layers. Requires `leaflet-omnivore` or equivalent.
- **"View Affected Villagers"** link in Live Dashboard — links to a modal/page that does not yet exist. Requires the `villagers` table from Change 2.
- **Delete user** in User Stats — deletes the `profiles` row only; the corresponding `auth.users` entry is not removed (requires calling the `delete-user` Edge Function or Supabase Admin API).
- **Google Maps API** — Location links open Google Maps URLs directly (no API key needed for basic `?q=lat,lng` links). If a proper embedded map is needed, `VITE_GOOGLE_MAPS_API_KEY` must be added.

---

## Summary Matrix

| | Change 1: Auth Overhaul | Change 2: Villager Calls | Change 3: Beat Guard Addition |
|---|---|---|---|
| **New tables** | None | `villagers`, `villager_call_log` | `villagers` (shared with Ch. 2) |
| **New Edge Functions** | `send-otp-sms` | `notify-villagers` | None (direct Supabase insert) |
| **New SQL triggers** | Existing phone triggers (update only) | `on_observation_insert` | None |
| **Frontend pages** | Minor: biometric button in Login | Admin: call log view | `AddVillager.tsx` |
| **Offline support** | Yes (biometric) | N/A (server-side) | Yes (Dexie queue) |
| **External vendors** | MSG91 (+ Exotel fallback) | Exotel + MSG91 | None |
| **Est. monthly cost** | ₹600 (SMS) | ₹400–600 (calls) | ₹0 |
| **Regulatory** | DLT registration (TRAI) | Exotel account (no DLT for voice) | None |
| **Development effort** | 5–7 days | 7–10 days | 3–5 days |
