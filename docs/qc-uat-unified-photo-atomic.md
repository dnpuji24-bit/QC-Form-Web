# 11D.5c.3b.2b — Atomic QC/Actual/full-detail/photo ledger (isolated Firebase demo)

## Operator baseline
21 Nov 2026 Cloud Shell screenshot: 10/10 private Supabase UAT SDK adapter tests **with fake SDK** and 15/15 trusted photo stage tests **with mock store** succeeded, TypeScript exit 0. The screenshot is not evidence of a real Supabase upload.

## Implemented in this commit; emulator execution pending
- `src/qcUatVerifiedPhotoLedger.mjs` validates an exact SERVER-origin `verified-staged-only` proof against full operational Spray/Fertilizer request, UID, record/revision/job, Daily Plan, bucket, SHA-256, slot and HOLD ID, immutable deterministic reference, file MIME/size and canonical digest. Requires private UAT or mock trusted backend store. No browser-chosen arbitrary object path or signed/public URL.
- `createPlanningPhotoCommitService({adb,authAdmin,photoStore})` in `server/qc-photo-access/uat-planning-role-service.mjs` is strictly internal, demo emulator guarded, **NOT mounted on HTTP**, and uses the existing Auth ID-token verification and current QC Edit, selected Planning/master source and immutable source snapshot checks. It stages actual bytes via the injected store, rechecks token and source, and then invokes the established trusted full Spray/Fertilizer transaction.
- In that *one Firestore transaction*, existing canonical QC + Actual + immutable QC operational audit + full operational Spray/Fertilizer detail + full audit are written together with `qc_photo_manifests/{canonicalQcId}` and append-only `qc_photo_manifest_audit/{canonicalQcId}:{clientRevision}`. The full operational DTO/Actual remains lossless and material doses stay separate, including Fertilizer NK/DAP and shift carry-over provenance.
- First photo-inclusive commit is supported; exact retry reads and verifies both immutable photo ledger records and all old QC/full/Actual/audit pairs without duplicate writes. The old **photo-free** full services are now guarded against modifying a QC with a photo ledger, as is the scalar QC endpoint. This prevents silent loss or orphaning of accepted photo metadata.
- Corrections or photo replacement **after** first accepted photo commit are explicitly denied `PHOTO_CORRECTION_NOT_ENABLED`, rather than silently overwriting old references. A separate correction protocol with versioned retention/cleanup policy must be tested before enabling.
- Supabase Storage and Firestore are **not a distributed transaction**. If private staging succeeds but Firestore rejects (stale revision, role revoke, audit collision, source change), NO QC/Actual/full/audit/manifest is written. The staged private object remains uncommitted; it must be reconciled by a later run-scoped orphan procedure, never silently deleted. In this gate all storage is **mock in memory**, so no new live objects are created.
- New `scripts/test-qc-uat-unified-photo-ledger-contract.mjs`: 11 offline integrity/forgery checks.
- New `scripts/test-qc-uat-unified-photo-atomic.mjs`: 9 targeted real Firebase Auth+Firestore emulator tests (mock photo bytes) for both forms, independent Fertilizer components, exact retry, photo-free downgrade rejection, rejected correction, partial-failure atomicity, foreign token, same-token revocation, denied client writes.
- No new Supabase Edge Functions, secrets, RLS, bucket config, hosted UAT, photo browser submission, live production or Hosting deployment.

## One short Cloud Shell test
```bash
cd ~/QC-Form-Web
git pull --ff-only origin feature/firebase-auth-claims-supabase
npm run test:uat:photo-commit
```

Expected **only after operator execution**:
```text
SUCCESS: 11 immutable QC photo ledger contract checks passed (offline, no upload)
SUCCESS: 9 isolated atomic photo/QC/Actual emulator checks passed (MOCK photos, NO Supabase upload)
SUCCESS: 11 photo ledger contracts, 9 atomic photo emulator checks, and TypeScript passed (MOCK storage only)
```
The command runs only one focused Auth+Firestore emulator session, not the full regression suite. A failing assertion is a blocker; do not deploy or test live storage until fixed.

## Next release gates
11D.5c.3b.2c: explicit synthetic UAT Storage opt-in run (strict origin/bucket, hidden UAT-only server credential, random run path, immutable readback, *only* acknowledged-run cleanup, no uncontrolled bulk delete), with the new transactional service; photo-aware corrections/reconciliation and authenticated short-lived private photo reads; then guarded photo-inclusive browser submit and operational pilot. Existing `qc-photo-upload-uat`/`qc-photo-sign-uat` functions are **not** directly compatible with unified demo identity; do not loosen checks to reuse them. Production `form-qc-unm` unchanged.
