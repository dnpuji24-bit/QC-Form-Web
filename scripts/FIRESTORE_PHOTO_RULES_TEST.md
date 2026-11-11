# QC Photo Metadata — Firestore Client Security Rules (Emulator only)

This stage adds **emulator-only** client security rules and test cases for the proposed separate collection `qc_photo_metadata/{recordId}/photos/{photoId}`.

No production `firestore.rules` or `form-qc-unm` database configuration is altered or deployed. The test uses project `demo-qc-photo-test` and local-only emulator `127.0.0.1:8085`. It never needs Firebase production credentials.

## Run in Cloud Shell

```bash
cd ~/QC-Form-Web
git pull origin feature/firebase-auth-claims-supabase
npm install --no-save --package-lock=false firebase-admin @firebase/rules-unit-testing
bash scripts/run-photo-rules-emulator.sh
```

This uses the existing dedicated `scripts/firebase.photo-emulator.json` and rules in `scripts/firestore.photo-emulator.rules`. `npx firebase-tools emulators:exec` starts and stops the emulator automatically. Java must be installed. Do NOT run `firebase deploy`.

Expected result: `SUCCESS: 36 Firestore Client Security Rules checks passed (emulator only).` Count is derived from test cases; look for `Script exited successfully (code 0)` too. If a test fails, send the **error log only** (no credentials or tokens). The earlier Admin SDK metadata tests can be rerun with `bash scripts/run-photo-metadata-emulator.sh`.

## Test policy design (dynamic role permissions)

The earlier failed run was NOT a valid Security Rules test. The emulator config pointed to `scripts/scripts/firestore.photo-emulator.rules`, which did not exist, causing the emulator to permit all reads/writes by default. The configuration now references `firestore.photo-emulator.rules` relative to the config in `scripts/`, and the runner checks that both files exist.

- Every signed-in user needs `users/{uid}.active=true`.
- Owner has permanent full access (consistent with the current Owner UI).
- For all other roles, **Data QC** permission `role_access/{role}.permissions.qc_records` controls whether photo metadata can be read: `view` and `edit` allow; `none` blocks.
- The `qc_spraying` or `qc_fertilizer` permission controls creation of photo metadata: **Edit** allows; View or None blocks. A user must also be the uploader and the original QC record owner.
- Mandor remain scoped to their own QC records and correct form type even with permissions.
- The suite changes Admin's Data QC permission to None and restores it, and changes a Mandor's Spraying permission from Edit to View and back. It verifies the rules respond to permission changes without new deployments.
- Photo ID, record revision, private bucket and UID path are strictly checked.
- UPDATE and DELETE of metadata remain denied to all roles: corrections will need an audited privileged workflow.
- Missing role permission documents/keys deny access rather than granting default access.

## Security limitations (must resolve before production)

1. Emulator uses synthetic test QC documents with `ownerUid`. Many existing live QC records may **lack this field**, so do not copy/paste these rules to production unchanged.
2. The Firestore rule validates the *shape and ownership* of a Supabase object reference, but **cannot prove the object exists in Supabase**. The client should verify authenticated read and a trusted backend verification design should be considered before a high-trust rollout.
3. Supabase Storage RLS currently restricts private file READ to the file uploader's Firebase UID only. Therefore Owner/Admin/Asisten may be allowed to **read metadata** in Firestore but will not necessarily be able to **read the image bytes**. This needs a carefully audited team-access design.
4. The rules-only test does not exercise network loss, real Supabase uploads, QC export/rendering, or the legacy Apps Script mirroring flow.
5. No production role_access permission integration has been shipped. This is a prototype role matrix only. Role permission maps, disabled accounts, editing and revision change must be supported in final policy.
6. For HOLD, migrate from an unstable array index to a stable hold identifier before linking images to final QC records.

## Next implementation stage
- Make a scoped metadata repository that does not rely on whole-record `qc_records` rewrites.
- Run the client rules tests on Cloud Shell and resolve failures.
- Add an authenticated photo display and fallback to historical Google Drive URLs.
- Build Firestore-only QC save state and photo upload state separately; migrate only after end-to-end review.
