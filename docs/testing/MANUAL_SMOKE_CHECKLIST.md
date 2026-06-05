# Manual smoke checklist (Eravat 2.0)

Base URL (local): `http://localhost:5173/Eravat2.0/`

## Credentials (E2E)

| Role | Phone | Password |
|------|-------|----------|
| Beat guard | 8899776655 | pass123 |
| Admin | 9988775566 | P@ss123 |

## Flows

- [ ] Login (password) → dashboard
- [ ] Dashboard → Report Activity (step 1 visible)
- [ ] Map loads
- [ ] Profile → Edit profile
- [ ] Settings → theme + language
- [ ] Admin login → `/admin` command center
- [ ] Admin → Users, Divisions, Observations
- [ ] Logout

Results are appended to `E2E_RUN_LOG.md` after automated runs.
