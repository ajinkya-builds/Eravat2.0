# Screen coverage — UI feedback APK

Branch: `experiment/mobile-ui-feedback-apk`  
Backend / DB / translation strings: **unchanged**. Staging update channel: **not published**.

| Route | UI change in this APK |
|---|---|
| `/login` | Unchanged (already mobile) |
| `/profile/complete-location` | Unchanged |
| `/` Dashboard | Unchanged layout/copy (shared map height polish if opened elsewhere) |
| `/report` | Unchanged flow |
| `/map` | Shorter map on phone; slightly tighter padding |
| `/nearby` `/history` | Unchanged |
| `/villagers*` `/volunteers*` | Unchanged |
| `/profile*` `/settings` `/privacy` `/help` `/faq` `/privacy-policy` | Unchanged |
| Notification bell | Mark-read control visible on phone (touch) |
| `/admin` Overview | ED Intelligence beat cards on phone |
| `/admin/conflict` | KPI snap strip; pie without slice labels on chart |
| `/admin/live` | KPI snap strip; shorter map |
| `/admin/latest` | Already AdminDataTable cards |
| `/admin/user-stats` | Already AdminDataTable cards |
| `/admin/users` | Already mobile cards |
| `/admin/villagers` | Already mobile cards |
| `/admin/divisions` | Already mobile cards |
| `/admin/observations` | **Mobile cards + always-visible actions + edit bottom sheet** |
| `/admin/map` | Shorter map; no double padding |
| `/admin/notifications` | AdminDataTable + denser mobile value clamp |
| `/admin/support` | Already cards |
| `/admin/settings` | Unchanged (already stacked) |
| Report calls modal | **Bottom sheet + mobile cards** (desktop table kept) |

Design prototypes (all routes): `docs/design/index.html`.
