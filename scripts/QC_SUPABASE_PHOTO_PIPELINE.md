# Supabase Photo Queue — isolated QA before QC cutover

## Implemented in feature/firebase-auth-claims-supabase

- `src/SupabasePhotoTest.tsx` has an independent Firebase-login + direct Supabase photo upload and private-read check.
- `src/supabasePhotoQueueTest.ts` has a **separate IndexedDB-backed queue** for test photos, retaining the exact immutable object path across retries.
- Queue paths are `qc-photos-test/<firebaseUID>/queue-tests/<uuid>.<ext>`, so they do not mix with live QC or production photos.
- The upload uses the Firebase JWT with Supabase publishable key. `409` on retry is accepted only after an authenticated GET verifies the object exists.
- The queue deletes an item only after an authenticated private read succeeds.
- No Firestore document, Actual Plan, Spreadsheet, Drive file, or production QC record is written during this isolated test.
- The earlier `src/qcSupabasePhotos.ts` contains preliminary QC photo and Firestore metadata logic, but its integration flag is now hard-disabled in code (`supabaseQcPhotoPreviewEnabled = false`) until a Firestore Emulator test route has been implemented and reviewed.

## How to test

1. Pull this branch and run `npm run build`; resolve compile failures before continuing.
2. Keep `.env.local` with `VITE_ENABLE_SUPABASE_PHOTO_TEST=true`, your `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Do not add a service-role key.
3. Run `npm run dev -- --host 0.0.0.0`, then open the **actual Vite port**, usually 5173 or 5174, at `/react/?supabase-photo-test=1`.
4. Log in using the Firebase account with custom claim `role=authenticated`.
5. Select a small, non-sensitive test image (JPEG/PNG/WebP, max 2 MB).
6. Click **1. Simpan Foto ke Antrean Lokal** and verify the pending count increases.
7. With internet temporarily unavailable, click **2. Kirim / Retry Antrean**; count must remain unchanged.
8. Restore network and retry; upload and private read should succeed, and pending count must decrease.
9. Refresh the page midway between queue and upload: the item must still be present (IndexedDB persistence).
10. Check Supabase Storage `qc-photos-test` for the new object in your UID's `queue-tests/` path.
11. Attempt another user's path only from a controlled test account after adding their Firebase claim; expect rejection.

**Note:** Turning off browser network can also interrupt Firebase token refresh. If you receive an authentication/network error instead of an offline result, restore connectivity and retry.

## Next steps — do not skip

- Add a Firestore Emulator environment with isolated QC records; do not run preliminary metadata code against `form-qc-unm` default database.
- Refactor full QC photo references into a separate, properly authorized store or scoped update path so legacy Apps Script cannot overwrite them.
- Implement status separation: QC Draft/Ready/Synced vs photo Queued/Uploaded/Failed.
- Confirm photo preview in QC reports and export; keep existing Drive historical images viewable.
- Security review: current RLS is only per Firebase UID, not operational role or active permission. Set up robust cross-role access before production.
- Migrate remaining Apps Script/Spreadsheet dependencies before performing a cutover.

**Production:** No main-branch commits, Firebase Rules deploy, Firestore writes, Supabase bucket/policy changes, or cutover are included in this set of QA code changes.
