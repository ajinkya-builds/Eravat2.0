# send-push-notifications (removed)

This legacy Edge Function existed only on production and had no in-repo source.
Canonical delivery is [`../send-push`](../send-push).

It was deleted from production (`mnytrlcmdpkfhrzrtesf`) on 2026-08-20 after
confirming `push_dispatch_config.send_push_url` and notification triggers call
`/functions/v1/send-push` only.
