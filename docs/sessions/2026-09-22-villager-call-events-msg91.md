# Session: Villager call-alert infra (MSG91-ready)

**Date:** 2026-09-22  
**Target:** Staging (`ttjtyvxfiqhjdngkgdkf`) — additive so 2.1.8 APK keeps working  
**Live dialing:** Not enabled (no MSG91_AUTHKEY)

## What shipped

1. **Table** `villager_call_events` — per-report / per-villager voice attempt with MSG91-aligned statuses.
2. **Trigger dual-write** — `notify_villagers_on_report` still inserts `villager_alert_events` (`sms_queued`) and now also queues `villager_call_events` (`queued`) within 5 km.
3. **RPC** `get_report_villager_calls(report_id)` — admin list (name, village, phone, status).
4. **Mapper** `map_msg91_voice_status(raw)` — MSG91 webhook/log strings → our statuses.
5. **Edge stubs** — `msg91-voice-webhook` (status updates), `msg91-voice-dispatch` (no-op until secrets).
6. **Admin UI** — Observations → **Calls** button opens the list modal.

## Status model (MSG91 Voice Call Logs + webhook)

| Our `call_status` | MSG91 meaning | Admin label |
|---|---|---|
| `queued` | (ours) geo-matched, not dialed | Queued (not dialed yet) |
| `triggered` | Queued (API accepted) | Successfully triggered |
| `ringing` | Ringing | Ringing |
| `completed` | Completed / Answered / delivered | Received (answered) |
| `no_answer` | No-Answer / ringing timeout | Not received (no answer) |
| `busy` | Busy | Busy |
| `cancelled` | Cancelled | Cancelled |
| `failed` | Failed / Balance / congestion / … | Failed (+ `failure_reason`) |
| `skipped` | (ours) not dialed | Skipped |

Refs: [Voice Call Logs - Status Explanation](https://msg91.com/help/voice/voice-call-logs-status-explanation), [Voice webhook reports](https://msg91.com/help/webhook-new/how-to-receive-voice-call-reports-via-webhook).

## 2.1.8 safety

- No changes to `villager_alert_events.channel` check or default.
- New table / RPC / columns only; old app never queries them.
- SMS queue e2e assertions remain valid.

## Later (when configuring MSG91)

1. Set secrets: `MSG91_AUTHKEY`, `MSG91_VOICE_WEBHOOK_SECRET`, optional `MSG91_VOICE_DISPATCH_SECRET`.
2. Deploy webhook URL to MSG91 Voice → Webhook → Report Received.
3. Implement dial in `msg91-voice-dispatch` (Voice SMS or IVR); on success set `triggered` + `msg91_uuid` / `msg91_crqid`.
4. Webhook updates ringing / completed / no_answer / failed.

## Migration

`supabase/migrations/20260922160000_villager_call_events_msg91.sql`

**Applied remotely (2026-09-22):**
- Staging `ttjtyvxfiqhjdngkgdkf` — table + RPCs + trigger dual-write; **3052** backfilled `queued` rows; edge functions `msg91-voice-webhook` / `msg91-voice-dispatch` ACTIVE (`verify_jwt=false`)
- Prod `mnytrlcmdpkfhrzrtesf` — same schema/functions; 0 call rows (no prior alert backfill); edge functions ACTIVE
