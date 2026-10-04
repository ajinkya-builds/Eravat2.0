# Screen coverage — UI feedback APK

Branch: `experiment/mobile-ui-feedback-apk`  
Version **2.1.18 / 20118** = **private UI experience-test APK for 1 user only**  
Package **`com.forestdept.eravat.uifeedback`** (launcher: **Eravat UI Lab**) — installs **beside** staging fleet `com.forestdept.eravat`, does not replace it.  
(not a staging ship; not from the Hathi Mitra feature work; channel `ui-feedback`)  
Backend / DB / translation strings: **unchanged**. Staging Settings → Update: **not published**.

Design prototypes (all routes): `docs/design/index.html` / `http://localhost:4177/`.

| Route | UI change in this APK |
|---|---|
| Shell (field) | Design pack chrome: BrandMark header, edge bottom nav, circular support FAB |
| `/login` | Unchanged flow (already mobile) |
| `/profile/complete-location` | Unchanged flow |
| `/` Dashboard | Light polish to match field home (mark brand, tile density) — same tiles/keys/flows |
| `/report` | Step bar + chips + sticky wizard footer + photo-slot polish — same step order |
| `/map` | Phone filter disclosure (`map_options`); shorter map |
| `/nearby` `/history` | Shared chrome only |
| `/villagers*` `/volunteers*` | Shared chrome; profile menu-row density where applicable |
| `/profile*` `/settings` `/privacy` `/help` `/faq` `/privacy-policy` | Shared chrome; settings segmented theme control |
| Notification bell | Mark-read control visible on phone (touch) |
| `/admin` Overview | ED Intelligence beat cards; filter disclosure on phone |
| `/admin/conflict` | KPI snap strip; pie without slice labels on chart |
| `/admin/live` | KPI snap strip; shorter map |
| `/admin/latest` | AdminDataTable cards |
| `/admin/user-stats` | AdminDataTable cards |
| `/admin/users` | Mobile cards |
| `/admin/villagers` | Mobile cards |
| `/admin/divisions` | Mobile cards |
| `/admin/observations` | **Mobile cards + always-visible actions + edit bottom sheet** |
| `/admin/map` | Shorter map; filter disclosure via MapComponent |
| `/admin/notifications` | AdminDataTable + denser mobile value clamp |
| `/admin/support` | Cards |
| `/admin/settings` | Stacked |
| Report calls modal | **Bottom sheet + mobile cards** (desktop table kept) |
| Admin shell | BrandMark header matching field chrome |
