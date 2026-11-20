# 11D.5a — Owner ↔ QC/Planning authorization parity & isolation gate

## Verified baseline (20 Nov 2026)
11D.4f.2 Owner Edit/Delete Role UAT: operator screenshot confirms 16/16 React browser checks and exit code 0 after Playwright exact-name selector fix `866101c`. Previous screenshots confirmed Test 1 (56/56 offline/typecheck) and Test 3 (85/85 regression), totaling 157/157 **within the prior emulator test scope**. No claim of deployment.

## Architecture constraint (critical)
Owner Role Management and Planning services are deliberately **different Firebase projects and ports**:
- Owner: `demo-qc-uat-owner-http` / Firestore `127.0.0.1:9485` / Auth `127.0.0.1:10299` / loopback HTTP `127.0.0.1:4497`
- Planning: `demo-qc-uat-planning-role` / Firestore `127.0.0.1:9085` / Auth `127.0.0.1:9899`

Both factories call strict project/port guards. A user token issued in one synthetic project is not accepted as a valid token of the other. The existing separate tests **DO NOT prove end-to-end Owner HTTP → live Planning API with one identity store**. Do not bridge by disabling guards, blindly copying production users, or claiming that parity equals deployed integration.

## This gate
1. `scripts/test-qc-uat-role-planning-parity.mjs` (15 authored emulator checks). Uses real authenticated Owner HTTP service on the Owner demo project, then a **shared pure Planning permission gate** `planningMode`, and the same production-independent QC permission resolver `operationalPermissions` + `canReadOperationalPhoto`, reading the same marker and exact custom role catalog in a trusted Firestore transaction. Tests create/assign, edit full 21-key role, manual overrides, same-token permission revocation, QC own-versus-foreign disclosure, independent MP/DP/Actual/Summary access, stale preview, pending registration block, forged materialized grants, missing catalog, retirement, tombstone, and direct browser rules denial. **It does not invoke the separate guarded Planning service or write QC/Planning records.**
2. `scripts/test-qc-uat-planning-role-revision-parity.mjs` (10 authored emulator checks). Runs inside the separate Planning demo project, using **the actual `createPlanningService` and real Auth emulator token**, but simulates a consistent Owner-defined catalog revision via a trusted synthetic Admin fixture. Tests the real Planning service's Monthly/Daily/Actual/Summary authorization, new catalog revision acceptance, same-token grants/revocation, manual overrides, orphan catalog mismatch, forgery, disabled identity, root isolation and direct client denial. **It does not call Owner HTTP.**

These two controlled tests prove schema and authorization **parity under isolated fixtures**; a later 11D.5b must provide a consciously designed unified UAT identity service/project and genuinely test Owner changes against QC and Planning HTTP services with the same token, before any hosted deployment.

## Security and rollout
Read/write only isolated demo emulator projects and synthetic test data. Production `form-qc-unm`, native accounts, live Firestore Rules, Supabase credentials/buckets, real QC/Actual/Planning rows, hosting and cloud deployment remain untouched. Both scripts require a fresh isolated emulator and fail closed on wrong project/host or unexpected production-source import.

### Test 1: offline gates
```bash
(
 set -e
 cd ~/QC-Form-Web
 git pull --ff-only origin feature/firebase-auth-claims-supabase
 node --check scripts/test-qc-uat-role-planning-parity.mjs
 node --check scripts/test-qc-uat-planning-role-revision-parity.mjs
 node scripts/test-qc-uat-role-planning-parity.mjs --self-test
 node scripts/test-qc-uat-planning-role-revision-parity.mjs --self-test
 npm run typecheck
 echo '=== TEST 1 PASSED ==='
)
```

### Test 2: Owner demo emulator (15)
```bash
firebase emulators:exec --only firestore,auth --project demo-qc-uat-owner-http --config firebase.uat-owner-permission-http.json 'env -u GOOGLE_CLOUD_PROJECT -u FIREBASE_PROJECT_ID GCLOUD_PROJECT=demo-qc-uat-owner-http FIRESTORE_EMULATOR_HOST=127.0.0.1:9485 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:10299 node scripts/test-qc-uat-role-planning-parity.mjs --emulator'
```

### Test 3: Planning demo emulator (10)
```bash
firebase emulators:exec --only firestore,auth --project demo-qc-uat-planning-role --config firebase.uat-planning-role-emulator.json 'env -u GOOGLE_CLOUD_PROJECT -u FIREBASE_PROJECT_ID GCLOUD_PROJECT=demo-qc-uat-planning-role FIRESTORE_EMULATOR_HOST=127.0.0.1:9085 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9899 node scripts/test-qc-uat-planning-role-revision-parity.mjs --emulator'
```

### Test 4: independent regression gates
Re-run existing `test-qc-uat-role-lifecycle.mjs --emulator` in Owner demo emulator and `test-qc-uat-planning-role.mjs --emulator`, `test-qc-uat-planning-write.mjs --emulator`, `test-qc-uat-planning-qc.mjs --emulator` in Planning demo emulator, independently. Each fixture must start fresh; no simultaneous servers sharing a configured port. Existing 16 + 19 + 19 + 22 checks.

**Status:** scripts and docs authored in GitHub, user Cloud Shell verification pending. Do not mark integration/production approved on this basis.
