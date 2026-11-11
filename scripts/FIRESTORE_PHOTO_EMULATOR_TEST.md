# Firestore Emulator — QC photo metadata (no production writes)

This test is **isolated from the Firebase project `form-qc-unm`**. It uses Firebase project ID `demo-qc-photo-test`, the local Firestore Emulator at `127.0.0.1:8085`, and an intentionally restrictive emulator rules file. It never requests a Firebase production service-account key.

## Run in Google Cloud Shell
From `~/QC-Form-Web` on `feature/firebase-auth-claims-supabase`:
```bash
git pull origin feature/firebase-auth-claims-supabase
npm install --no-save firebase-admin
java -version
bash scripts/run-photo-metadata-emulator.sh
```
The runner invokes `npx --yes firebase-tools emulators:exec`. Firebase Emulator needs Java. If it reports a Java version requirement, install/update a suitable JDK before rerunning. **Do not run `firebase deploy`** for this test. No paid Firebase plan is needed.

The Node test refuses to start unless all three match:
- `GCLOUD_PROJECT=demo-qc-photo-test`
- `FIREBASE_PROJECT_ID=demo-qc-photo-test`
- `FIRESTORE_EMULATOR_HOST=127.0.0.1:<port>` (or localhost)

## What the test checks
- Create throwaway QC record only in the emulator
- Attach main, HOLD, and Scan Report Supabase *metadata* references to separate collection `qc_photo_metadata/<recordId>/photos/<photoId>`
- Retry same `photoId` without duplicating metadata
- Refuse same photo ID pointing to a different object
- Refuse cross-user references and paths not owned by the Firebase UID
- Refuse stale revisions, including after QC is edited
- Keep legacy Drive URL and QC save state unchanged

The script outputs `SUCCESS: 10 Firestore Emulator metadata checks passed; no production writes.` upon success. Neither Supabase upload nor Firestore Security Rules authorization is exercised here: the test uses Admin SDK inside the emulator, which bypasses rules. Follow-up tests must use the client SDK with mocked authentication to validate new production-ready Security Rules.

## Reason for separate collection
Legacy Apps Script sometimes writes whole QC documents back to Firestore. To avoid losing photo references, this prototype stores refs in a separate collection. It is only a design/test; do not grant browsers write access to `qc_photo_metadata` or deploy new rules without review. In production, metadata writes must be authorized, bound to QC ownership, and protected against forged object paths; an uploaded file should be verified via authenticated Supabase access.

## Current boundaries
The separate `src/supabasePhotoQueueTest.ts` uses a real Supabase *test bucket* for upload/retry testing but never writes QC data. The preliminary QC dual-write in `src/qcSupabasePhotos.ts` is hard-disabled. Production `main`, Firestore `(default)`, Firebase Security Rules, Apps Script, Google Drive, and Spreadsheet are untouched.
