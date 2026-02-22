# Eravat 2.0 — Documentation Index

Welcome to the Eravat project docs. Every session's work is recorded here so context is never lost between AI chat sessions.

## 📖 How to Use These Docs

**At the start of every new session:**
1. Read [`README.md`](./README.md) — full project architecture
2. Read the latest session log in [`sessions/`](./sessions/) — what was last worked on

**At the end of every session:**
- The AI agent should create a new file in `sessions/` with date + topic as the filename.

---

## 📁 Docs Structure

```
docs/
├── README.md                   ← Main architecture reference (always up to date)
├── INDEX.md                    ← This file
├── schema.md                   ← Database schema quick reference
└── sessions/
    ├── 2026-02-21-database-setup-and-login.md
    ├── 2026-02-21-ui-ux-centralization.md
    ├── 2026-02-21-interactive-dashboard-map.md
    ├── 2026-02-21-mobile-ux-refinements.md
    ├── 2026-02-21-notifications-and-multi-select.md  <-- NEW
    ├── 2026-02-21-observation-sync-fix.md
    ├── 2026-02-21-user-management-rbac.md
    └── 2026-02-22-branding-logo-and-typography.md
```

---

## 📅 Session History

| Date | Topic | Key Outcomes |
|---|---|---|
| 2026-02-21 | Database Setup & First Login | Discovered real schema, fixed Login.tsx, wired Supabase auth |
| 2026-02-21 | User Management & RBAC | Created Edit/Delete user flows, built Edge Functions for strict Role-Based Access Control |
| 2026-02-21 | UI/UX Centralization & Cleanup | Unified App/Admin layouts, reused MapComponent to fix Dashboard map, removed legacy views |
| 2026-02-21 | Interactive Dashboard & Map | Added Live Metrics, Recent Alerts feed, and layered color-coded Beat/Range/Division highlighting |
| 2026-02-21 | Mobile UX & Android | Overhauled data collection stepper, added Counter components, and fixed native Android location permissions |
| 2026-02-21 | Observation Sync Fix & UI | Debugged persistence issues, added exit navigation, and refined Stepper UI alignment |
| 2026-02-21 | Notifications & Multi-Select | Enriched notifications, added Territory History feed, and implemented multi-select arrays/multi-row sync |
| 2026-02-22 | Branding & UI Refinements | Fixed corrupted logo file, implemented CSS scaling for Android icons, and added localized (Hindi/English) typography |

---

## 🔗 Quick Links

- **App:** http://localhost:5173 (dev)
- **Supabase Dashboard:** https://supabase.com/dashboard/project/mnytrlcmdpkfhrzrtesf
- **Supabase SQL Editor:** https://supabase.com/dashboard/project/mnytrlcmdpkfhrzrtesf/sql/new
- **Auth Users:** https://supabase.com/dashboard/project/mnytrlcmdpkfhrzrtesf/auth/users
