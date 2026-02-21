# Session Log: 2026-02-21 — User Creation, Edit, Delete & RBAC

**Session Date:** 21 February 2026  
**Focus:** Building out full personnel management with Role-Based Access Control (RBAC)  

---

## 🎯 Goals for This Session

1. Fix the initial User Creation flow (`create-user` Edge Function returning 401).
2. Implement Edit & Delete capabilities for users in the admin panel.
3. Enforce strict RBAC rules for managing personnel based on the caller's role.

---

## ✅ What Was Accomplished

### 1. Fixed `create-user` Deployment
- **Problem:** The Edge Function was returning a `401 Invalid JWT` because the runtime environment was rejecting the frontend's valid session token.
- **Fix:** Deployed the function using `npx supabase functions deploy create-user --no-verify-jwt`. This delegates JWT verification to the function's code itself (via `supabase.auth.getUser()`), which was already implemented properly.
- **Result:** Admin users can successfully create new personnel, assign roles, and assign territory.

### 2. Implemented RBAC Edge Functions
- **Problem:** Mutations on `auth.users` require the Service Role Key. Client-side RLS cannot secure this.
- **Fix:** Built a unified RBAC configuration and injected it into three Edge Functions.
  - `create-user`: Updated to check if the caller can create the requested role.
  - `update-user`: Created to safely allow updating passwords, names, roles, and geography.
  - `delete-user`: Created to safely delete a user's geography, profile, and auth record.
- **RBAC Rules Implemented:**
  - **Admin & CCF**: Full access to manage all roles.
  - **DFO**: Can manage Range Officers and Beat Guards.
  - **Range Officer & RRT**: Can ONLY manage Beat Guards.
  - **Beat Guard, Volunteer, etc**: Cannot manage anyone.

### 3. Upgraded `AdminUsers.tsx`
- **Register Button Visibility**: Hidden entirely if the logged-in user lacks permissions to create anyone.
- **Row-Level Actions**: Added Edit & Delete icons to the personnel list. These render conditionally depending on if the logged-in user outranks the target user (using the same RBAC mapping).
- **Edit Modal**: Allows safely editing a user's details without forcing an email/password flow.
- **Delete Modal**: Built a red-zone confirmation prompt to delete personnel.

---

## 📋 File & Architecture Updates

| Component | Change Summary |
|---|---|
| `supabase/functions/_shared/rbac.ts` | **NEW** — Centralized dictionary mapping Roles to allowed manageable downstream Roles. |
| `supabase/functions/create-user/` | **UPDATED** — Uses `canManageRole`. |
| `supabase/functions/update-user/` | **NEW** — Safely handles delta updates to `auth.users`, `profiles`, and `user_region_assignments`. |
| `supabase/functions/delete-user/` | **NEW** — Completely wipes the user from all 3 tables safely. |
| `src/pages/admin/AdminUsers.tsx` | **UPDATED** — Fully integrates the new Edge Functions and responsive UI Modals. |

---

## 🔮 What's Left / Next Actions

- The personnel foundation is fully built.
- Move focus to **Reporting workflows**, **offline sync reliability**, or adding RLS policies to `profiles` and `conflict_damages` to lock down client-level queries.
