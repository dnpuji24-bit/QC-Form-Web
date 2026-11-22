# QC Form Web — source of truth and deployment routing

## Active application

- **Canonical source:** `feature/firebase-auth-claims-supabase` (React, Firebase Auth/Firestore, private Supabase QC photos).
- **LIVE:** `https://form-qc-unm.web.app/react/`.
- **Preview mirror:** `react-test` Firebase Hosting channel of the same project.
- **Legacy root:** `/` serves `public/index.html` and `public/app.js`. It is not the current React QC UI.
- **Older React migration branch:** `migrate/react-typescript-vite`. Do not use it for operational QC fixes.
- **Default branch `main`:** keeps repository scaffolding and the preview refresh workflow. PR #5 is a historic migration PR, not the release source.

## Publish safety

Changes to QC UI, reports, editing, and workflow UI must be made against `feature/firebase-auth-claims-supabase`.
The production workflow installs packages, runs regression/typecheck/build, emits `/react/release.json` with the real checkout SHA and version, and publishes **one build** to LIVE and then to `react-test`. A weekly default-branch workflow refreshes `react-test` from the **same source branch**, not the older React branch.

These channels use the **same production backend**; preview is not isolated UAT. Do not save or delete real QC data when visually comparing preview and LIVE.

## How to identify the code actually running

1. Open the intended URL ending with `/react/`.
2. Go to **QC > Pengaturan > Versi Aplikasi QC**.
3. Verify the commit and channel label against `/react/release.json` on that exact origin.
4. Confirm the GitHub Actions run with that commit finished successfully before interpreting UI/PDF test results.
5. If it differs, refresh without clearing local QC drafts, and inspect the site's Service Worker. Never delete site data to force an update.

## Current component map

| Area | Primary code |
| --- | --- |
| QC Data / preview report | `src/App.tsx` |
| Native browser PDF (A4 / long tables) | `src/qcNativeReportPrint.ts` |
| Fertilizer edit/input | `src/FertilizerForm.tsx` |
| Spray edit/input | `src/SprayForm.tsx` |
| Private photo signed reading | `src/useOperationalReportPhotos.ts` |
| Master/plan portal routes | `src/PortalRouter.tsx` |
| Appearance and QC reports | `src/field-ui.css` |
| Version indicator | `src/qcReleaseInfo.tsx` |
| Production deployment | `.github/workflows/qc-production-hosting.yml` |
| Weekly preview maintenance (default branch) | `.github/workflows/keep-react-preview.yml` |

Changing only the wrong branch or the legacy root will not update the operational React QC app.
