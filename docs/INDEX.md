# Eravat 2.0 — Documentation Index

Welcome to the Eravat project docs. Every session's work is recorded here so
context is never lost between AI chat sessions.

## 📖 How to Use These Docs

**At the start of every new session:**

1. Read [`README.md`](./README.md) — full project architecture
2. Read the latest session log in [`sessions/`](./sessions/) — what was last
   worked on

**At the end of every session:**

- The AI agent should create a new file in `sessions/` with date + topic as the
  filename.

---

## 📁 Docs Structure

```
docs/
├── README.md                   ← Main architecture reference (always up to date)
├── INDEX.md                    ← This file
├── schema.md                   ← Database schema quick reference
├── SYNC_RUNBOOK.md             ← Sync troubleshooting playbook
└── sessions/
    ├── 2026-03-14-beat-nearest-boundary-fallback.md
    ├── 2026-03-14-sync-and-media-schema-drift-fix.md
    ├── 2026-03-14-phone-login-migration-and-total-elephants-fix.md  <-- NEW
    ├── 2026-02-21-database-setup-and-login.md
    ├── 2026-02-21-ui-ux-centralization.md
    ├── 2026-02-21-interactive-dashboard-map.md
    ├── 2026-02-21-mobile-ux-refinements.md
    ├── 2026-02-21-notifications-and-multi-select.md
    ├── 2026-02-21-observation-sync-fix.md
    ├── 2026-02-21-user-management-rbac.md
    ├── 2026-02-22-branding-logo-and-typography.md
    ├── 2026-02-23-git-merge-and-deploy.md
    └── 2026-02-24-login-fix-and-diagnostics.md
```

---

## 📅 Session History

| Date       | Topic                          | Key Outcomes                                                                                                             |
| ---------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| 2026-02-21 | Database Setup & First Login   | Discovered real schema, fixed Login.tsx, wired Supabase auth                                                             |
| 2026-02-21 | User Management & RBAC         | Created Edit/Delete user flows, built Edge Functions for strict Role-Based Access Control                                |
| 2026-02-21 | UI/UX Centralization & Cleanup | Unified App/Admin layouts, reused MapComponent to fix Dashboard map, removed legacy views                                |
| 2026-02-21 | Interactive Dashboard & Map    | Added Live Metrics, Recent Alerts feed, and layered color-coded Beat/Range/Division highlighting                         |
| 2026-02-21 | Mobile UX & Android            | Overhauled data collection stepper, added Counter components, and fixed native Android location permissions              |
| 2026-02-21 | Observation Sync Fix & UI      | Debugged persistence issues, added exit navigation, and refined Stepper UI alignment                                     |
| 2026-02-21 | Notification & Multi-Select    | Enriched notifications, added Territory History feed, and implemented multi-select arrays/multi-row sync                 |
| 2026-02-22 | Branding & UI Refinements      | Fixed corrupted logo file, implemented CSS scaling for Android icons, and added localized (Hindi/English) typography     |
| 2026-02-22 | Android, PWA & Deployment      | Fixed white screen by decapitating base path from main config, built native APK, and streamlined GitHub Pages deployment |
| 2026-02-23 | Git Restructure & Deploy       | Unified Yash/Ajinkya branches into master, resolved route conflicts, and deployed to production GH Pages                 |
| 2026-02-24 | Login Fix & Diagnostics        | Fixed Ajinkya's login by correcting a DB phone typo and added verbose frontend auth logging                              |
| 2026-03-14 | Sync + Media Schema Drift Fix  | Fixed photo storage-to-table sync blockers, added schema-drift-safe inserts, normalized arrays/enums, and reduced sync noise |
| 2026-03-14 | Phone Login & Elephants Fix    | Fixed country code phone matching in get_email_by_phone RPC, added total_elephants calculation in syncService, and resolved migration conflicts |
| 2026-03-14 | Beat Nearest-Boundary Fallback | Updated report beat auto-assignment to use nearest beat boundary when GPS point falls outside all beat polygons |

---

## 🔗 Quick Links

- **App:** http://localhost:5173 (dev)
- **Sync Runbook:** [`SYNC_RUNBOOK.md`](./SYNC_RUNBOOK.md)
- **Supabase Dashboard:**
  https://supabase.com/dashboard/project/mnytrlcmdpkfhrzrtesf
- **Supabase SQL Editor:**
  https://supabase.com/dashboard/project/mnytrlcmdpkfhrzrtesf/sql/new
- **Auth Users:**
  https://supabase.com/dashboard/project/mnytrlcmdpkfhrzrtesf/auth/users
