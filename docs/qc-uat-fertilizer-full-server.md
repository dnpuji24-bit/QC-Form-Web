# 11C.2B.2b — trusted Fertilizer component server

Operator screenshot after a46c17d shows 71 regression checks passed; the first 14 material-integration checks are above the visible terminal range. If the prior set -e block was run intact, they also passed; explicit rerun required. 

Dedicated demo only: project demo-qc-uat-fertilizer-full, ports 9285 and 10099. Auth verifies emulator tokens; current server marker and absence of production profile checked inside Admin transaction. Reads authoritative synthetic DP and master catalog in same transaction. Owner edit permission required, no direct client access. Uses component DTO and Actual mapper, canonical request fingerprint, immutable source/component identity, atomic QC/Actual/audit, strict full-pair replay checks. Partial material Ready allowed, combined status only when all components complete. No photos or Uploaded, no live master, HTTP, real executor assignment authorization, migration or production wiring. The mapper timestamp is fixture-only. 20 authored emulator scenarios not executed here. No production deployment. 

Run: node scripts/test-qc-uat-fertilizer-full-server.mjs --self-test
Then: firebase emulators:exec --only firestore,auth --project demo-qc-uat-fertilizer-full --config firebase.uat-fertilizer-full-emulator.json 'env -u GOOGLE_CLOUD_PROJECT -u FIREBASE_PROJECT_ID GCLOUD_PROJECT=demo-qc-uat-fertilizer-full FIRESTORE_EMULATOR_HOST=127.0.0.1:9285 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:10099 node scripts/test-qc-uat-fertilizer-full-server.mjs --emulator'

Operator verification at `839bada`: 20/20 trusted Fertilizer component server emulator checks passed, exit 0. Next [photo gate](qc-uat-fertilizer-photo-server.md).
