# Eravat 2.0 DevOps Summary & UAT Architecture

This file summarizes the DevOps modifications made during this session to establish a 100% automated, free-tier UAT environment alongside the existing production environment.

## 🏗️ Architecture Design

```mermaid
graph TD
    subgraph GitHub Repository [GitHub: ajinkya-builds/Eravat2.0]
        main[main branch]
        uat[uat branch]
    end

    subgraph GitHub Actions Pipelines
        action_prod[Deploy Production App & APK]
        action_stage[Build UAT App & APK]
    end

    subgraph Hosting / Frontend
        stage_web[UAT Web App<br>Netlify: eravat]
        prod_web[Production Web App<br>GitHub Pages]
    end

    subgraph Testing & Emulator
        stage_emulator[Appetize.io UAT Emulator]
        prod_emulator[Appetize.io Production Emulator]
    end

    subgraph Databases [Supabase Databases]
        stage_db[UAT Database<br>Ref: ttjtyvxfiqhjdngkgdkf]
        prod_db[Production Database<br>Ref: mnytrlcmdpkfhrzrtesf]
    end

    uat -->|Auto-deploys via Netlify CD| stage_web
    uat -->|Triggers CI| action_stage
    action_stage -->|Builds & Uploads Debug APK| stage_emulator
    
    main -->|Deploys to GH Pages| prod_web
    main -->|Triggers CI| action_prod
    action_prod -->|Builds & Uploads Debug APK| prod_emulator

    stage_web -->|Reads/Writes| stage_db
    stage_emulator -->|Reads/Writes| stage_db

    prod_web -->|Reads/Writes| prod_db
    prod_emulator -->|Reads/Writes| prod_db
```

---

## 🔑 Environment Mappings & Settings

### 1. Databases (Supabase)
* **Production Database**:
  * Project Ref: `mnytrlcmdpkfhrzrtesf`
  * Region: `ap-south-1` (Mumbai)
* **UAT Database**:
  * Project Ref: `ttjtyvxfiqhjdngkgdkf`
  * Region: `ap-south-1` (Mumbai)
  * Restored with Eravat 2.0 production database schema, row data (reports, observations, profiles), and auth users.

### 2. Web Hosting
* **Production Web (GitHub Pages)**:
  * URL: [ajinkya-builds.github.io/Eravat2.0](https://ajinkya-builds.github.io/Eravat2.0)
  * Target Branch: `main`
* **UAT Web (Netlify)**:
  * URL: [eravat.netlify.app](https://eravat.netlify.app)
  * Target branch: `uat` once GitHub branch `staging` is renamed. Until that rename, Netlify still follows `staging`.
  * Project ID: `699fa7d6-25a0-4fd9-98d6-6ae366ae1869`
  * Environment variables configured on Netlify:
    * `VITE_SUPABASE_URL`: `https://ttjtyvxfiqhjdngkgdkf.supabase.co`
    * `VITE_SUPABASE_PUBLISHABLE_KEY`: (UAT publishable key)

### 3. GitHub Secrets
The following secrets are configured in the GitHub repository to run CI/CD pipelines successfully. UAT workflows accept `UAT_*` names and still fall back to the existing `STAGE_*` / `SUPABASE_STAGING_DB_PASSWORD` secrets, which point at the UAT project.
* `APPETIZE_API_TOKEN`: Used to upload APKs to Appetize.io.
* `STAGE_VITE_SUPABASE_URL` (alias `UAT_VITE_SUPABASE_URL`): `https://ttjtyvxfiqhjdngkgdkf.supabase.co` (UAT Supabase URL)
* `STAGE_VITE_SUPABASE_PUBLISHABLE_KEY` (alias `UAT_VITE_SUPABASE_PUBLISHABLE_KEY`): (UAT publishable key)
* `STAGE_SUPABASE_SERVICE_ROLE` (alias `UAT_SUPABASE_SERVICE_ROLE`): UAT service role, used to publish the in-app APK
* `SUPABASE_STAGING_DB_PASSWORD` (alias `SUPABASE_UAT_DB_PASSWORD`): UAT database password for nightly backups
* `VITE_SUPABASE_URL`: `https://mnytrlcmdpkfhrzrtesf.supabase.co` (Production Supabase URL)
* `VITE_SUPABASE_PUBLISHABLE_KEY`: (Production publishable key)

---

## 📱 Appetize Emulator Links

* **UAT Emulator URL**: [Launch UAT Emulator](https://appetize.io/app/rthbx63kdvramzsyvwmxthkqd4)
* **Production Emulator URL**: [Launch Production Emulator](https://appetize.io/app/sokxjzw5umd3iff73m4c35lj7y) (updated 2026-07-26 — prior keys may be stale; each CI upload can mint a new publicKey)

---

## 🔍 Troubleshooting UAT Issues

If UAT is not loading or auth/data flows are failing, here are the key areas to investigate:

1. **Authentication (Supabase GoTrue):**
   * Since users were imported from the production database, auth passwords should match production credentials.
   * Check if the user email has been confirmed in the UAT Supabase Auth dashboard (`ttjtyvxfiqhjdngkgdkf`). If not, confirm them manually or disable email confirmation in Supabase Auth settings.

2. **Network/CORS Configuration on UAT Supabase:**
   * Go to Supabase UAT Project -> API Settings.
   * Ensure `CORS Allowed Origins` allows `https://eravat.netlify.app` and `localhost` (for emulator/local testing).

3. **Netlify Redirects/Headers:**
   * Single Page Applications (React/Vite) require redirects configured for client-side routing. Check if accessing a sub-page (e.g. `/dashboard` directly) causes a 404. If so, a `_redirects` file needs to be present in Netlify's publish folder with `/* /index.html 200`.

4. **Appetize Emulator Build API Version:**
   * The UAT emulator loads the debug APK built via GitHub Actions. If there are crashes, fetch the emulator console logs from the Appetize dashboard.
