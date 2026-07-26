# send-push-notifications (legacy, remote-only)

This function exists as **ACTIVE** on production (`mnytrlcmdpkfhrzrtesf`) but
could not be downloaded into the repo (eszip decode failure with current CLI).

Canonical push delivery in-repo is [`../send-push`](../send-push).

**Reconcile action (manual):** In the Dashboard, confirm nothing still invokes
`send-push-notifications`. If only `send-push` is wired from `pg_net` /
triggers, delete the orphan remote function to avoid drift.
