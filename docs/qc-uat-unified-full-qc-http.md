# 11D.5c.2b.1 — Full Spray/Fertilizer DTO trusted HTTP boundary, photo-free

## Verified baseline
Cloud Shell screenshots supplied 21 Nov 2026 confirm **11D.5c.2a Quick Test: PASS (10 form contract checks, source guard, browser guard, TypeScript)** and **Smoke Test: PASS (8/8 Firebase Auth + Firestore emulator cases)**. That baseline is operator-tested, not production deployment.

## Why this slice
Existing `src/SprayForm.tsx` and `src/FertilizerForm.tsx` save *full* operational DTOs, with noUnit, timing, hold entries, material usages and (for Fertilizer) distinct area/quantity per product/filling. The 11D.5c.2a starter UI commits only the synthetic scalar QC receipt. It must **not** silently flatten full details or claim Fertilizer physical coverage. The already tested trusted backend services `createPlanningQcSourceService`, `createPlanningSprayCommitService`, `createPlanningFertilizerCommitService` accept full synthetic records with exact revisioned source snapshots and immutable canonical/sidecar/audit transactions. We expose those existing services through the unified browser boundary, without copying validation or inventing a new Firestore schema.

## Authored changes, runtime verification pending
- `server/qc-photo-access/uat-unified-planning-http.mjs`: three exact POST-only local UAT routes behind the same token/host/origin/isolation validation:
  - `/uat/unified/qc/full/source`: request `{request:{dailyPlanId,expectedDailyRevision,formType,date,shift,foreman}}`. Source projection includes verified selected Paddock/variety, Planning recipe, materials, group snapshot source vs actual foreman and explicit carryover. Requires current QC form **Edit**; no Planning menu right needed.
  - `/uat/unified/qc/full/spray/commit`: request `{request:{record,baseRevision,jobId,uploaderUid,expectedDailyRevision,foremanId}}`. Uses established full Spray DTO validator and commits scalar QC+Actual+immutable audit+full Spray sidecar atomically; 4 measured material slots (no truncation), unmeasured/null, theoretical dose and actual quantity separate.
  - `/uat/unified/qc/full/fertilizer/commit`: same envelope; existing component validator independently tracks NK/DAP or other mapped materials by applied hectares and measured kg. No scalar physical area inferred from component sum, no stock mutation; holds canonical/sidecar/audit atomically.
- `server/qc-photo-access/uat-unified-browser-shell.mjs`: exact allowlisted routes proxy same-origin loopback only; full **commit** routes have 64 KiB JSON request cap, unchanged 8 KiB limits on Owner, Planning and scalar QC. No arbitrary proxy path, no new CORS/WebSockets.
- `src/qcUatUnifiedFullQcTransport.mjs`: photo-free, **lossless** conversion from validated full form + trusted projected source to exact server request. Never drops material, unit, hold or filling detail. Rejects mismatched source/executor and photo metadata. Does not persist, fetch, or upload.
- `scripts/test-qc-uat-unified-full-qc-http.mjs`: offline route/isolation guard plus **8 focused real Firebase emulator HTTP checks** for Spray and Fertilizer enriched source, no Planning View grant, measured material sidecar, independent Fertilizer components, idempotent replays, photo rejection, request size, authorization revocation and denied direct browser writes.
- Existing short test commands automatically include this work. Quick only runs offline, syntax and typecheck; Smoke now runs **8 scalar + 8 full DTO** emulator tests, in separate clean emulator sessions. Full release gate baseline now **130** checks plus offline/typecheck (not all repository tests).

## Important not-yet-done
This is the **trusted backend/full DTO gateway**, not direct use of the existing real `SprayForm.tsx` and `FertilizerForm.tsx` in the unified portal. Their current queue/photo/Apps Script transport is NOT switched. The UAT starter form from 11D.5c.2a still submits only scalar QC; the new full routes require a complete separately validated DTO from the **actual form**. Actual React form mounting/field capture and photo separation still require a distinct browser test. This boundary remains photo-free: no Supabase uploads, photo URLs, scanner import, inventory mutations, Hosted UAT or production changes. Existing live routes, Firebase rules/production and role catalogs untouched.

## Two short Cloud Shell tests
```bash
cd ~/QC-Form-Web
git pull --ff-only origin feature/firebase-auth-claims-supabase
npm run test:uat:quick
npm run test:uat:smoke
```
Expect `SUCCESS: Quick Test contract and typecheck passed` and `SUCCESS: targeted 16-case Spray/Fertilizer emulator smoke passed` (plus startup/teardown). A failure is a blocker; do not run deployment. Full regression `npm run test:uat:full` remains a pre-release/pilot gate only.

Next: 11D.5c.2b.2 actual React field mapping/browser capture for both full forms, photo-free first, then signed-photo and reporting paths separately.
