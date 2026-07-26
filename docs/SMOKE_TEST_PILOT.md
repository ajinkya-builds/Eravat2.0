# Pilot device smoke test — Eravat 2.0.0

Use signed APK: `backups/Eravat-2.0.0-release.apk` (or CI release artifact).

**Before install:** uninstall any previous debug Eravat APK (different signature).

## Accounts (OTP `123456`)

See [GO_LIVE_OPS.md](./GO_LIVE_OPS.md) for the phone table.

## Checklist

- [ ] Fresh install opens with Eravat icon (not Capacitor “C”)
- [ ] Login with enrolled phone → OTP → set 4-digit PIN
- [ ] Unenrolled phone is rejected (no silent SMS attempt that hangs)
- [ ] Create report online with GPS → appears in History
- [ ] Airplane mode → create report + photo → reconnect → Sync succeeds
- [ ] Deny location → manual lat/lng works
- [ ] Kill app → reopen → PIN unlock works
- [ ] Admin phone can open `/admin`
- [ ] Beat guard cannot open `/admin`

## Brief pilots on known gaps

- Push notifications off
- Biometrics toggle is non-functional
- Photo compression setting is display-only
- Hindi / Marathi incomplete (English fallback)
