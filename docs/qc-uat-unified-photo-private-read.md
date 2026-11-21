# 11D.5c.3b.2d — Private QC photo read authorization and 60-second signed URL (synthetic UAT)

## Verified prior checkpoint — 21 November 2026

Operator Cloud Shell screenshot for synthetic run `d492409687b2d670a36efcaedff246cd` confirms **9/9** emulator atomic photo/QC/Actual checks using **real private Supabase UAT bytes**, four acknowledged synthetic objects removed, exact run directories empty and CLI exit 0. The database is still Firebase Auth+Firestore **demo emulators**; this is not a production deployment. Existing CORS/IPv6 hub and logging port warnings were nonfatal.

## Candidate work in this stage (not yet run by operator)

- New server-only `uat-unified-private-photo-read.mjs` authorizes `{recordId,photoId}` from **existing committed QC**; user cannot provide an arbitrary Storage path, bucket, SHA, owner, signed URL or role.
- Read requires current Firebase ID token verified with revocation checking, an active synthetic identity and up-to-date role permission. It reuses the Owner-managed permission contract and the existing `canReadOperationalPhoto` rule, including QC Records view/edit for authorized users, and QC form edit for the uploader where applicable.
- Requires `qc_records`, the matching full Spray/Fertilizer form, `qc_photo_manifests` and **immutable revision audit** to agree on canonical IDs, owner, revision, job, form type, slot and path. Rejects uncommitted or orphaned objects. No global list or user-selected path.
- Signed URLs only use fixed private bucket `qc-photos-uat`, fixed Supabase UAT origin, immutable object path and TTL **60 seconds**. The server returns a bearer URL only after fresh Auth/role/ledger validation; never log the URL or UAT secret.
- New **11 offline read contracts** test owner/viewer/denials, out-of-ledger IDs, mismatched audit, Spray vs Fertilizer scan, paths and fake SDK 60-second signer. No live Supabase, Firebase or credentials.
- Existing atomic + Storage live gate adds an **opt-in separate read mode** (original `--uat-real-emulator` unchanged). In the new mode, six extra checks exercise private signed GET of synthetic Spray and Fertilizer photos, role revocation on the same token, forged IDs, tampered audits, orphan denial, and revoked owner permission. Total expected **15** isolated emulator/real-Storage checks.
- The same 4 synthetic objects are uploaded under a new random run ID and, if **all** checks pass, removed via strict acknowledged-run-only cleanup. Failed/ambiguous runs keep their objects for scoped review. No mass cleanup and no RLS/bucket/Edge Function changes.
- **Not wired to web/Hosting/production**; no background service is running. JPEG/PNG/WebP remain allowed in the bucket, but this focused live read gate uses tiny PNG only.

## Cloud Shell — one command to run next

```bash
cd ~/QC-Form-Web
git switch feature/firebase-auth-claims-supabase
git pull --ff-only origin feature/firebase-auth-claims-supabase
bash server/qc-photo-access/run-unified-photo-private-read.sh
```

Offline guards are run first. Next, type `QC-UAT-PRIVATE-READ` when prompted and enter **only the qc-form-uat Supabase `sb_secret_`** through the hidden local terminal input. Never paste keys, Firebase tokens, full object paths or signed URLs into chat, screenshots, logs or source code. The test is restricted to dedicated UAT Supabase and the local demo Firebase emulators.

Expected only **after** operator verifies:

```text
SUCCESS: 11 private signed-photo authorization contracts passed (OFFLINE, NO upload)
PASS: 15 isolated Firebase emulator atomic photo/QC/Actual + private signing checks used REAL private Supabase UAT bytes
PASS: 4 acknowledged synthetic UAT objects removed, exact run directories empty
SUCCESS: REAL private UAT signed photo read, role revocation, audit binding and scoped cleanup passed
```

A failing assertion or cleanup error is a blocker; do not deploy. Signed URLs are bearer credentials and a 60-second expiration does **not** instantly revoke URLs already issued on role change. The tested guarantee is that **new** URLs are denied after current authorization is revoked.

## Remaining gates

1. Reconcile orphaned objects, including partial failures and interrupted cleanup, with exact run-scoped retention and audit rules; no automatic deletion of unconfirmed content.
2. Add photo-aware versioned corrections while retaining immutable photo history (old photo-free submit must stay denied on photo-ledger records).
3. Connect authenticated short-lived private preview and photo-inclusive submit to the real UAT browser, test separate user accounts and all JPEG/PNG/WebP formats.
4. Review operational permissions and Hosting/production cutover separately. No changes to `form-qc-unm` production or Google Cloud Billing in this stage.
