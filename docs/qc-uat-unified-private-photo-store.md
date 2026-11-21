# 11D.5c.3b.2a — Dedicated private Supabase QC photo storage adapter (unified UAT)

## Verified baseline
The operator's 21 November Cloud Shell screenshots confirm 10/10 then 11/11 focused full Spray/Fertilizer browser cases and TypeScript passed. These cases include format-preserving JPEG, PNG and WebP compression, transparent PNG/WebP, and SHA-256-after-compression. **No photo was uploaded**.

Supabase project `qc-form-uat` (`tcmtqgbpafwciaflgsaa`) was inspected read-only. Storage bucket `qc-photos-uat` is private, file limit 2,097,152 bytes, allowed MIME exactly `image/jpeg`, `image/png`, `image/webp`. Existing UAT Edge Functions `qc-photo-upload-uat` and `qc-photo-sign-uat` were not touched because they use older Firebase identity rules incompatible with the unified demo.

## Committed scope; runtime test pending
- `server/qc-photo-access/uat-unified-private-photo-store.mjs` is a Node-only Supabase Storage adapter. It uses fixed `tcmtqgbpafwciaflgsaa.supabase.co`, private `qc-photos-uat`, an explicit `synthetic-only` opt-in, server secret and the existing loopback Firebase Auth+Firestore unified demo guard. All paths are restricted to `uat-<actor>/qc/qc-v2-uat-<random32hex>-<shortnonce>/<slotHash>_<sha256>.(jpg|png|webp)`; MIME, size, hash and private bucket policy are verified.
- Writes are immutable (`upsert:false`) and always compared to downloaded bytes. Exact replay reuses identical objects, including ambiguous success after an upload timeout. Conflicting bytes fail closed. Failed writes leave explicit run-scoped touched paths for *later manual reconciliation*; no broad deletion, public URL, signed URL, new bucket, RLS change or production resources.
- Existing `createTrustedPhotoStage` accepts this explicitly guarded UAT adapter in addition to its in-memory mock, preserving auth/source verification. It returns only `verified-staged-only`, NOT a Firestore QC/Actual/photo receipt.
- `scripts/test-qc-uat-unified-private-photo-store.mjs`: 10 short, credential-free, **fake SDK** cases (scope, policy, MIME, replay, byte readback, simulated timeout, revocation). Existing 15 trusted mock stage regressions and TS run alongside.
- No actual Supabase UAT write or browser upload was performed. No photo-inclusive Firestore transaction, sign/read UI, production deployment or blanket cleanup was added.

## One short Cloud Shell test (does not contact Supabase)
```bash
cd ~/QC-Form-Web
git pull --ff-only origin feature/firebase-auth-claims-supabase
npm run test:uat:photo-storage
```
Expected if passed:
```text
SUCCESS: 10 strict private Supabase UAT object adapter checks passed (FAKE SDK, no live upload or QC commit)
SUCCESS: 15 trusted photo byte readback, identity and source preflight checks passed (MOCK storage, no QC commit)
```
and TypeScript code 0.

## Next stage 11D.5c.3b.2b
Atomic **Firestore** transaction must commit the full QC + Actual + immutable full-detail audit + verified photo manifest together, with revisions/source and same-token permission revalidation. Supabase Storage and Firestore cannot share a single native transaction, so a staged/uncommitted photo stays an explicit orphan until retry/reconciliation, and no UI save success may be claimed prematurely. Then run an explicitly operator-authorized real UAT Storage smoke with a hidden UAT-only credential, synthetic random run paths and bounded cleanup. Enable browser upload only after the cross-system UAT tests pass; leave `form-qc-unm` production unchanged.
