# Eravat mobile UI — design pack

## Goals

1. **Cohesive** field + Command Center (same tokens / card language).
2. **Command Center**: fix Android horizontal scroll / dense tables (main work).
3. **Field (incl. homepage)**: light polish only — keep current experience & tile layout.
4. **Copy locked**: existing `en` / `hi` / `mr` keys in `translations.ts` — do not rewrite words.
5. **Backend unchanged**.

## Open

```bash
npx --yes serve docs/design -p 4177
```

- [index.html](./index.html) — gallery  
- [PATTERNS.md](./PATTERNS.md) — scope + i18n rules  
- [field-mobile/screens/dashboard.html](./field-mobile/screens/dashboard.html) — homepage aligned to production copy/layout  
- [command-center-mobile/](./command-center-mobile/) — primary phone UX prototypes  

## Implement later

UI-only React changes; every string via `t('existing.key')` with HI/MR already present.
