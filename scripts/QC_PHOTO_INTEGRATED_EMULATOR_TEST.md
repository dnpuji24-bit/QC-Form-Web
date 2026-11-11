# QC photo — integrated emulator test

This is the missing **integration** check after separate 10 + 42 + 24 + 9 tests. It ties together the same Firestore metadata path used by the QC viewer and server signer.

## How to run

```bash
cd ~/QC-Form-Web
git pull origin feature/firebase-auth-claims-supabase
bash scripts/run-qc-photo-integrated-emulator.sh
npm run build
```

Expected (not yet verified): `SUCCESS: 8 integrated QC photo checks passed (emulator + mock storage; no production writes).`

The run creates a simulated Spraying QC with a Firebase uploader, a Manager assigned Data QC `view`, and another account assigned `none`. It stores dummy photo bytes in memory (mock Supabase), then a Firebase Client SDK writes metadata into local Firestore Emulator. The Manager lists and reads the metadata, and a mocked trusted backend reads the **same emulator documents**, authorizes the Manager and issues a fake signed URL. The `none` user is denied. Finally, role access is revoked and both Firestore client reads and backend signing deny.

## What this deliberately does not do

- Does **not** upload a real photo to Supabase or create a real QC record in `form-qc-unm`.
- Does **not** deploy server, rules or change production.
- Does **not** test the browser's actual IndexedDB queue and upload. The QC uploader remains disabled by `supabaseQcPhotoPreviewEnabled=false` until dedicated testing/staging wiring and final end-to-end checks are ready.
- Does **not** prove signed URLs work on another account until backend is deployed with server-only secrets in a trusted test environment.
- Does **not** alter the Apps Script/Spreadsheet operational path.

## Critical next implementation gates (no new audits)

1. Resolve client save → enqueue integration and live Firestore permission policy, using a dedicated testing path. Never enable dual-write blindly against production.
2. Deploy the dedicated photo signing backend to **a protected testing service** with server-only secrets; configure HTTPS CORS origin and rate limits. Do not reveal tokens in logs.
3. Perform real 2-account read proof (View yes, None no), then integrate QC UI upload and report/Excel export with legacy Drive fallback.
4. Replace Apps Script/Spreadsheet paths after QC, dashboard, corrections and export are validated against Firestore. No shortcut that drops data.
