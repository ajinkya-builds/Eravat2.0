# Manual smoke checklist (Eravat 2.0)

> **Superseded by** [`GO_LIVE_CERTIFICATION.md`](./GO_LIVE_CERTIFICATION.md) for go-live validation.
> Run automation: `cd eravat-app && npm run test:certify:quick`

Base URL (staging): https://eravat.netlify.app  
Base URL (local): `http://localhost:5173/Eravat2.0/`

## Credentials (UAT OTP)

Use `Go live Prep - Staging/generated/uat-testers/uat-testers-otp-manifest.json` — OTP pattern `48` + last 4 digits of phone.

| Role | Example phone | OTP |
|------|---------------|-----|
| Beat guard | 9752458789 | 488789 |
| Admin | 9545893779 | 483779 |

## Flows

- [ ] Login (OTP) → dashboard
- [ ] Dashboard → Report Activity (step 1 visible)
- [ ] Map loads
- [ ] Profile → Edit profile
- [ ] Settings → theme + language
- [ ] Admin login → `/admin` command center
- [ ] Admin → Users, Divisions, Observations
- [ ] Logout

Results are appended to `E2E_RUN_LOG.md` after automated runs.
