# 11D.5c.3b.1 — Trusted photo preflight: immutable mock readback and fresh source checks

## Proven baseline (operator Cloud Shell, 21 Nov 2026)
The 11D.5c.3a **10 isolated photo preflight contracts**, **9 focused React QC browser checks** and **TypeScript** all passed, exit 0. Local React photo staging remains blocked from saving QC when unuploaded photos exist. The production app and hosted UAT are still unchanged.

## Real Supabase UAT resource audit (read-only)
Confirmed current Supabase project `qc-form-uat` (`tcmtqgbpafwciaflgsaa`) has private bucket `qc-photos-uat`, 2 MiB file limit and allowed JPEG/PNG/WebP. Existing active `qc-photo-upload-uat` and `qc-photo-sign-uat` Edge Functions **are NOT drop-in compatible** with the unified synthetic UAT: their shared configuration binds to Firebase project `daily-plan-and-report-unm`, database `dailyplan` and its service identity, whereas the unified lab uses `demo-qc-uat-unified-role-planning` with loopback Firestore/Auth emulators. The older functions also expect production-like `users`, QC record and photo reservation collections and different role semantics. Do not call these functions directly from this demo or relax Firebase token checks to connect them. No Supabase Edge Function, bucket, DB schema, policy or secret has been changed.

## Code authored, operator test pending
- New `server/qc-photo-access/uat-unified-photo-trusted-stage.mjs` builds on existing `src/qcOperationalPhotoManifest.mjs` and the **full** Spray/Fertilizer envelope validator `src/qcUatUnifiedFullQcTransport.mjs`, keeping materials, holds and source/executor separate.
- Required dependencies include `authenticatedUid(rawToken)` and `readSource(rawToken,sourceRequest)`. This ensures the mock candidate has an explicit hook for real current-user identity and **current QC Edit + frozen Planning source** permission rather than trusting browser-supplied UID or source. Test doubles in the offline test are **not** real Firebase authorization.
- The staged request accepts ONLY `{sourceRequest,request,photos}`; `request` is exactly the existing full QC photo-free commit input. Raw photo changes are an independent list. The full record remains unchanged and compatible with existing QC/Actual/audit canonical transaction.
- Initial scope: 1–4 explicit `replace` photo changes, up to 2 MiB each / 6 MiB combined, main and HOLD for Spray/Fertilizer, scan **file slot** only for Fertilizer (no scanner/OCR feature). The HOLD ID must belong to the actual form's numbered HOLD rows. Strict image magic headers, canonical base64, MIME, no client object paths and safe synthetic UID/record/revision/job IDs.
- Deterministic reference path and SHA-256 per slot/byte via existing operational manifest. Server-side injected storage `putImmutable` performs no overwrite; **readback** verifies exact bytes and hash. Fresh user identity and Planning source are rechecked after all staging. A revoked token or moved source fails closed, leaving an explicit unreferenced staged object for later cleanup workflow.
- Returns `verified-staged-only` receipt and digest. **This is NOT a Firestore receipt, not an uploaded QC, not a private signed URL and not durable server storage**; it must not be accepted for a QC commit until an atomic trusted transaction is implemented and independently tested. Object store from `createMemoryPhotoObjectStore()` is **in-memory mock only** and names its bucket `qc-photos-uat-mock` to avoid misleading users about Supabase.
- New `scripts/test-qc-uat-unified-photo-trusted-stage.mjs` contains 15 offline positive/adversarial tests: replay, HOLD binding, foreign UID, source/revision/foreman alteration, invalid MIME and payloads, altered readback, mid-flight revocation/source change, duplicate slots, scan restriction and staged-only status.
- Existing `npm run test:uat:quick` includes the 15 checks automatically. An even shorter isolated command `npm run test:uat:photo-trust` runs **these 15 checks + TypeScript only** (no emulator; no Supabase call).

## One short Cloud Shell command
```bash
cd ~/QC-Form-Web
git pull --ff-only origin feature/firebase-auth-claims-supabase
npm run test:uat:photo-trust
```
Expected *only if it actually passes in Cloud Shell*:
```text
SUCCESS: 15 trusted photo byte readback, identity and source preflight checks passed (MOCK storage, no QC commit)
```
followed by TypeScript exit code 0. No need to repeat the 9 already-passed browser tests for this isolated module.

## Release blockers / next checkpoint
11D.5c.3b.2 must implement the **production-independent UAT-only trusted photo-inclusive transaction**: scoped upload to the real private UAT bucket with explicitly authorized runtime credentials; verification by server-side readback; atomic QC + Actual + full DTO + photo manifest + audit; conflict-free retry, session revocation, orphan object retention/reaping, source/carry-over and NK/DAP parity. This stage must demonstrate mock/emulator first and **then** separately opt in to actual UAT storage verification with safe cleanup. Existing uploader/sign functions must be adapted to the unified identity boundary, not reused with their historical project assumptions. Only then enable browser send and unblock photo-inclusive QC saves. No hosted/production deployment or scanner OCR in this checkpoint.
