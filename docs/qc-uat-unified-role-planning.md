# 11D.5b — Single-token Owner HTTP → Planning HTTP → QC/Actual UAT integration

## Baseline
Operator Cloud Shell screenshots 21 Nov 2026 confirm 11D.5a: Test 1 isolation/syntax/typecheck PASS, Test 2 Owner-model parity **15/15**, Test 3 actual Planning authorization **10/10**; both emulators exited code 0. The previous tests explicitly used separate Firebase emulator projects and did not prove one-token end-to-end.

## New isolated lab
**One demo Firebase project** `demo-qc-uat-unified-role-planning`, **one Auth emulator** `127.0.0.1:10099`, **one Firestore emulator** `127.0.0.1:9285`. Both trusted server factories are bound to the exact same Admin SDK project and transaction store. Owner HTTP listens loopback `127.0.0.1:4497` (existing Owner routes); a new Planning/QC HTTP adapter listens loopback `127.0.0.1:4697`. Both verify the same Firebase Auth emulator ID token and resolve the current `qc_uat_identities/{uid}`, `qc_uat_workspaces/cutover/role_catalog/{id}`, with no authorization cache, bypass, or copied roles.

The new mode is **explicit opt-in**: `QC_UAT_MODE=unified-lab` AND exactly the unified demo project, loopback Firestore/Auth port pair, no mismatched Firebase project environment variables. On any missing/wrong value, both services throw before initialization. The original Owner `demo-qc-uat-owner-http` and Planning `demo-qc-uat-planning-role` projects/ports remain accepted **only when `QC_UAT_MODE` is unset**, so existing regression tests continue unchanged. Passing a forged project, swapped emulator port, unknown mode, or production ID is refused.

`server/qc-photo-access/uat-unified-planning-http.mjs` is an opt-in trusted HTTP adapter, **not mounted in `src/main.tsx`, `src/App.tsx`, `server/qc-photo-access/index.mjs` or the live portal**. Only POST JSON, exact DTO keys, Bearer ID token, host/origin check, bounded body, no CORS grants, no error stack, no external requests, and server-side permission checks are allowed. Exact endpoints:
- `/uat/unified/planning/check`: `{scope,operation}`, capability result
- `/uat/unified/planning/read`: `{scope,id}`, minimal server projection only
- `/uat/unified/planning/mutate`: `{scope,request}`, revisions + audit transaction via actual Planning write service
- `/uat/unified/qc/commit`: `{request}`, canonical QC–Actual–audit transaction via actual Planning QC service (synthetic, photo-free)

Owner retains audited create, assign, patch, preview, edit and safe role retirement services. Manual override and role edits cause new permission checks on **the same ID token** to reflect the new policy. No server-owned client sessions or token permission caches.

## Test: same-token fully integrated emulator
`scripts/test-qc-uat-unified-role-planning.mjs`: **21 authored integration checks** covering one real Firebase Auth token against both HTTP servers, Owner role create/assign/update, MP and linked DP writes with audit, role revocation after write, QC Spray permission denial then grant, ready QC+Actual commit and exact retry, independent QC vs Planning rights, manual override, ADHOC Fertilizer, authorized form switch, same-token revocation, unresolved registration block, Owner role retirement/tombstone, forbidden direct browser writes, root sentinels unchanged, Owner revocation, and strict no-CORS/isolation constraints.

This is the **first synthetic end-to-end verification in one shared emulator**; no Supabase photos, real QC form UI, production workflow, full HTTP/photo uploads, or hosting rollout is claimed. Status: authored and committed, not yet executed in Cloud Shell.

### Test 1: offline guards, syntax and typecheck
```bash
(
 set -e
 cd ~/QC-Form-Web
 git pull --ff-only origin feature/firebase-auth-claims-supabase
 git log -1 --oneline
 node --check server/qc-photo-access/uat-unified-identity-guard.mjs
 node --check server/qc-photo-access/uat-unified-planning-http.mjs
 node --check server/qc-photo-access/uat-owner-permission-http.mjs
 node --check server/qc-photo-access/uat-planning-role-service.mjs
 node --check scripts/test-qc-uat-unified-role-planning.mjs
 node scripts/test-qc-uat-unified-role-planning.mjs --self-test
 npm run typecheck
 echo "=== TEST 1 PASSED ==="
)
```

### Test 2: unified emulator (21)
```bash
(
 set -e
 cd ~/QC-Form-Web
 firebase emulators:exec --only firestore,auth \
   --project demo-qc-uat-unified-role-planning \
   --config firebase.uat-unified-role-planning-emulator.json \
   'env -u GOOGLE_CLOUD_PROJECT -u FIREBASE_PROJECT_ID QC_UAT_MODE=unified-lab GCLOUD_PROJECT=demo-qc-uat-unified-role-planning FIRESTORE_EMULATOR_HOST=127.0.0.1:9285 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:10099 node scripts/test-qc-uat-unified-role-planning.mjs --emulator'
 echo "=== TEST 2 PASSED ==="
)
```

### Test 3: keep original emulator gates (76)
Run each regression in **fresh separate** emulator sessions, with `env -u QC_UAT_MODE -u GOOGLE_CLOUD_PROJECT -u FIREBASE_PROJECT_ID`. Owner config `firebase.uat-owner-permission-http.json`, `demo-qc-uat-owner-http`, 9485/10299: `test-qc-uat-role-lifecycle.mjs --emulator` (16). Planning config `firebase.uat-planning-role-emulator.json`, `demo-qc-uat-planning-role`, 9085/9899: `test-qc-uat-planning-role.mjs --emulator` (19), `test-qc-uat-planning-write.mjs --emulator` (19), `test-qc-uat-planning-qc.mjs --emulator` (22).

## Next stage
11D.5c hosted UAT readiness review: configurable environment/secret handling, real UI role menu integration, full Spray/Fertilizer/photo/Actual endpoint smoke tests and migration/rollback plan. **Do not deploy production or claim proof from emulator alone**.
