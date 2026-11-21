# 11D.5c.3b.2c — Real private Supabase UAT + atomic QC photo ledger emulator gate

## Verified starting point (21 Nov 2026)
The operator's Cloud Shell screenshot confirms `npm run test:uat:photo-commit` passes 11 immutable ledger contracts, 9 isolated Auth/Firestore emulator checks, and TypeScript. Storage in that test is MOCK; **no live Supabase upload is evidenced**.

Read-only Supabase inventory: `qc-form-uat` (`tcmtqgbpafwciaflgsaa`) has private bucket `qc-photos-uat`, maximum 2 MiB, allowlist `image/jpeg`, `image/png`, `image/webp`. Existing `qc-photo-upload-uat`/`qc-photo-sign-uat` Edge Functions bind to a different Firebase identity project and cannot be invoked in the unified demo. No configuration or RLS edits are necessary for this gate.

## New candidate code (operator execution pending)
- `scripts/test-qc-uat-unified-photo-real-storage.mjs` is a copy of the previously proven 9 atomic Firebase emulator scenarios, but explicitly uses `createUnifiedPrivatePhotoStore` with the actual private UAT Supabase SDK and **unique 128-bit random run scope**. Firebase Auth and Firestore remain local demo emulators; no real Firebase project is used.
- Photos are tiny synthetic PNGs; four unique objects: Spray main, Fertilizer main+scan, and one intentionally staged-but-uncommitted photo after a simulated Firestore audit collision. Each uploaded photo is read back and checked by SHA-256; exact retries do not overwrite objects.
- Scenarios verify atomic QC/Actual/full DTO/photo manifest/audit, independent Fertilizer NK/DAP, no silent photo-free downgrade, rejected revision correction, audit-collision rollback, forged user, same-token role revocation and denied direct Firestore writes.
- The backend never opens an HTTP route, never invokes a historical UAT Edge Function, never publishes a photo URL, and never touches `form-qc-unm` production. A server-only `sb_secret_` UAT key is required in a hidden terminal prompt, never bundled into React or committed.
- Only after **all nine checks pass**, cleanup enumerates the exact four **acknowledged** synthetic run-scoped paths, compares each private folder's listing to the precise expected names, removes only those paths, and verifies empty run folders. Any failed/ambiguous run leaves objects untouched for deliberate manual review; it does not delete unknown files.
- Existing `npm run test:uat:photo-commit` remains entirely mock/offline and unchanged.

## Single Cloud Shell command (requires explicit operator opt-in)
```bash
cd ~/QC-Form-Web
git pull --ff-only origin feature/firebase-auth-claims-supabase
bash server/qc-photo-access/run-unified-photo-real-storage.sh
```

The runner first checks 11 ledger contracts, 12 fake-SDK private storage adapter guards, and TypeScript without network writes. If those pass, it asks for `QC-UAT-ATOMIC` and a **hidden** `sb_secret_` key belonging to **Supabase UAT project qc-form-uat only**.

Never paste secret, Firebase tokens, signed URLs or photo paths into chat, screenshots, GitHub or source files. Use a fresh terminal without exported secrets. The script will stop if the server dependencies are unavailable, rather than using an unpinned installation. The existing server `package.json` specifies pinned versions for the Supabase SDK and Firebase Admin.

## Expected success (only after the operator runs it)
```text
PASS: 9 isolated Firebase emulator atomic photo/QC/Actual checks used REAL private Supabase UAT bytes
PASS: 4 acknowledged synthetic UAT objects removed, exact run directories empty
SUCCESS: REAL Supabase UAT + emulator QC/Actual/manifest integration and scoped cleanup passed
```

Any assertion, credential or cleanup failure is a blocker; do not deploy. If a run fails after upload, use the printed synthetic run ID to review just that run under `qc-photos-uat`. No global delete or automatic re-run.

## Not yet delivered
No production upload, authenticated short-lived private photo viewer in the unified UI, live hosted UAT portal, photo-aware corrections after first commit, orphan reconciliation service, JPEG/WebP **atomic** live receipts, or full end-user photo submission. Supabase and Firestore are not a distributed transaction. Subsequent gates must test these separately, then authorize operational pilot; production `form-qc-unm` remains unchanged.

## First live gate failure and conservative correction (21 Nov 2026)

The operator ran the new gate; 11 ledger checks, 10 then-current fake-SDK adapter checks and TypeScript succeeded. The first real Spray test stopped at `PHOTO_UAT_DOWNLOAD_FAILED` before any upload. Correlated Supabase gateway logs recorded a GET with HTTP **400** for a missing synthetic run-scoped object; read-only SQL confirmed **zero** objects with failed run ID `89d8c99f2317ee21be97047edebb3875`. No production data was changed and no cleanup was required.

Fix in `uat-unified-private-photo-store.mjs`: for each immutable path, attempt `upload(..., { upsert:false })` **first**; then download and verify exact bytes and SHA. On an expected duplicate or uncertain 5xx timeout, read back and accept only if bytes match. Fail closed for HTTP 401/403 and unrelated 400s; never change bucket policies or use a public URL. This avoids relying on inconsistent 400-versus-404 missing-object download responses. Since retries may issue another no-upsert upload request, the fake SDK regression now verifies **one stored object / no overwrite**, rather than one network upload attempt. Added cases cover missing GET 400 and denied/invalid uploads; 12 offline adapter checks are now expected. These changes are **not yet confirmed by another operator live run**.

Rerun the same command above on the feature branch. If any real test fails, report the error and the synthetic run ID **without** secrets or full object paths. Do not automatically delete run-scoped objects or deploy hosted UAT.

## Verified operator rerun — 21 Nov 2026 (11D.5c.3b.2c PASSED)

After the upload-first correction, the operator's Cloud Shell screenshot shows successful real Supabase UAT + Firebase emulator verification: **9 isolated atomic checks**, **4 acknowledged synthetic objects removed**, exact run directories empty, CLI **exit code 0**. Read-only Storage metadata additionally confirms zero objects for the successful run `d492409687b2d670a36efcaedff246cd`. The prior expected result above is now achieved, but only within the synthetic UAT boundary. No production deployment, user-facing signed read or hosted form submission is implied. Continue at [11D.5c.3b.2d — private photo read authorization](qc-uat-unified-photo-private-read.md).
