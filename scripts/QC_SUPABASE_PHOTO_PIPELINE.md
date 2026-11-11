# QC Supabase photo pipeline — experimental integration

**Status: development branch only; not a production migration.**
The first independent test has already proved Firebase JWT upload/private read in `qc-photos-test`. This change adds a reusable queue for QC main, HOLD and scan photos, with Firestore references.

## Architecture
- Existing login: Firebase Auth (`form-qc-unm`), with Supabase third-party auth.
- Photo bytes: private Supabase Storage bucket `qc-photos-test` under `<firebaseUID>/qc/<qcRecordId>/<uuid>.<ext>`.
- Photo metadata: `qc_records/{id}.supabasePhotoRefs` using a Firestore transaction (only after the record is confirmed and its `clientRevision` matches).
- Offline photos: browser IndexedDB database `qc-photo-uploads-v1`, object store `photos`; stored before upload attempts.
- Retries: an upload is immutable (upsert=false); a `409` is followed by authenticated GET to distinguish success-after-timeout; the same object path is reused.
- Reads: `readPrivateQcPhoto(ref)` returns a temporary blob URL. Caller must call `URL.revokeObjectURL(url)` when finished.

## Feature flag (disabled by default)
```dotenv
VITE_QC_SUPABASE_PHOTO_DUAL_WRITE_TEST=false
```
Keep **false** for normal QC. When **true**, `saveRecordFirestoreFirst` additionally queues photos for Supabase and tries to upload them after Firestore confirmation, while the **legacy Apps Script/Drive/Spreadsheet pipeline continues unchanged**. This is an intentional dual-write experiment, **NOT** the cutover, and may cause duplicate storage costs. Do not enable on the production build.

`src/qcSupabasePhotos.ts` exposes:
- `queueQcRecordPhotos(record)`
- `flushQcPhotoQueue()`
- `qcPhotoQueueStatus()`
- `readPrivateQcPhoto(ref)`

The existing `src/offline.ts` uses the queue only when the feature flag is enabled. In offline mode the jobs persist locally, but photo upload requires a valid Firebase session and network access.

## Remaining acceptance tests BEFORE integrating into real QC
1. Run `npm run build` on this branch; resolve TypeScript failures before tests.
2. Test main, HOLD and fertilizer scan photos on **throwaway QC records** only (never real operational records), with Firebase Auth.
3. Confirm that `qc_records/{id}.supabasePhotoRefs` is written and the referenced image can be read privately.
4. Disable network during upload and verify retry without duplicate files.
5. Edit a QC record during upload; a stale `clientRevision` must not attach the old photo.
6. Verify Firestore rules reject unauthorized metadata changes and Supabase RLS rejects another Firebase UID.
7. Test browser storage limit and multiple tabs; evaluate cleanup/repair of orphaned objects.
8. Replace legacy `syncRecord`/`finalizeRecord` with a **separate Firestore-only state machine**, migrate admin/master/log dependencies, implement photo display and reconciliation in reports, and only then enable Supabase for production.

## Known limitations
- `supabasePhotoRefs` is a prototype field in the existing `qc_records`; legacy Apps Script mirror may overwrite it. Therefore the feature is **preview-only**. Production should use carefully scoped immutable photo metadata with security rules and revision strategy.
- Existing Google Drive photo URLs remain unchanged; this module does not delete or move historical photos.
- Folder-owner RLS does not yet reflect QC roles/assignment or active status. Firebase custom claim `role: authenticated` is needed for each authorized tester, but is **not** sufficient authorization for production.
- No production cutover, auth bulk updates, Security Rules deployment, or main-branch changes are performed here.
