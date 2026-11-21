# 11D.5c.3b.2f.1 — Photo-only revision guard (delta test only)

## Baseline already verified
Operator on 2026-11-21: six real private Supabase UAT browser checks passed, including PNG/JPEG/WebP upload and signed preview, same-token role revocation, retry without duplication, and strict four-object cleanup. Older reconciliation, Storage and compression checks also passed. **Do not rerun those unchanged suites at this checkpoint.**

## Change
A new **server-side photo correction policy** in `src/qcUatPhotoCorrectionPolicy.mjs` is invoked INSIDE the original authorized Firebase-demo-emulator Firestore transaction for both full Spray and Fertilizer. This is a **photo-only** new revision of an *already photo-aware* QC record, not a free-form QC rewrite:

- Current QC, current full DTO, current photo manifest and its immutable audit must agree; previous QC/fertilizer/Spray audit and previous photo audit are never overwritten.
- New submission must use current `baseRevision`, a fresh client revision and job ID; a missing/stale revision is rejected.
- No change to the complete operational form except `clientRevision`: area, HK/time, dose, materials, NK/DAP, shift, source, owner, HOLD intervals and other QC data remain exactly the same.
- The new photo manifest must contain **all the same slots** as the previous revision (main/HOLD/scan), with at least one image changed. To keep a photo, repeat its old bytes: Storage's immutable path/sha produces idempotent reuse. No silent removal and no arbitrary Storage path are allowed.
- The committed current manifest moves to the new revision while the old immutable audit stays at its old `:<revision>` key. Old photo objects are **not deleted**, preserving audit history.
- Same new revision replay checks the exact existing manifest/full DTO and cannot create duplicate records, audit rows or photo objects. Photo-free requests still cannot strip the ledger.
- Run-scoped real Supabase adapter and production isolation are unchanged; no public bucket, RLS, Firebase production, Hosting or Cloud Billing changes.

**Scope limit**: this checkpoint exposes policy through the trusted photo-commit backend used in isolated UAT. It does **not** yet add an interactive correction/edit-existing flow to React and does not support partial upload of only one changed photo; users must provide the complete resulting slot set. That UI/workflow and old signed-preview history selection belong to the integration/UAT release stages.

## ONE short operator command

```bash
cd ~/QC-Form-Web
git switch feature/firebase-auth-claims-supabase
git pull --ff-only origin feature/firebase-auth-claims-supabase
npm run test:uat:photo-correction
```

The runner checks syntax of only **three changed files**, then executes **three new emulator checks** with **in-memory mock Storage**:
1. Spray/Fertilizer correction creates a new revision and immutable photo audit without modifying operational area, NK/DAP, existing QC Actual, or historical full-photo audit.
2. Stale base revision, changed operational fields, altered audit, and a missing previous scan slot are rejected; no new QC revision is committed.
3. Repeating exactly the same correction does not add photos, audits or records.

**No Supabase secret or live Storage write is needed.** This test doesn't rerun the older browser, SHA/compression, 15 signed-read, 11 photo ledger or full regression suite. Expected only after the operator executes: `SUCCESS: 3 focused photo correction delta checks passed (MOCK storage, NO Supabase upload)` and emulator exit 0.

## Remaining work to final (estimate, not a committed schedule)

From this checkpoint, approximately **five major gates including this one**, then four more if it passes:
1. Photo correction gate and user-visible correction flow
2. Delta security/recovery/authorization hardening for changed logic
3. Enable real authenticated operational UAT portal integration with actual user roles and Firestore source, keeping UAT separate from production
4. Operational field UAT: shift, mandor, planning, Spray/Fertilizer, multi-paddock, dashboard/export/warehouse if in release scope
5. Production cutover preparation: migration integrity, rollback, release checklists, explicit deployment approval, post-cutover monitoring

No project-wide percentage estimate is defensible from the photo gates alone. In particular, current photo tests use synthetic Firebase demo emulators and separate UAT Supabase storage, **not** the `form-qc-unm` production flow.
