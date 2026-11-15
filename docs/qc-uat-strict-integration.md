# Trusted fingerprint and atomic QC — isolated integration candidate

Operator screenshots after dea1c6e confirm 23 strict payload + 13 mock replay + 8 manifest + 8 transport checks passed. New project demo-qc-uat-strict-integration, Firestore 127.0.0.1:8685, Auth 127.0.0.1:9499. All prior test files, production modules, rules and grants unchanged. No Supabase calls, no deployment.

Derived from the 23 passing photo-integration scenarios. The in-process trusted verifier takes original synthetic job, recomputes SHA-256 using Node crypto over canonical payload, rejects caller mismatch, reconstructs manifest from authoritative current revision and verifies immutable mock bytes, reads DP and creates immutable private receipt containing full expected QC map and base revision in an Admin transaction. Client transaction must match the entire expected QC and base revision; Actual and audit include matching fingerprint. Receipt and queue identity immutable per revision. Core reads strip demo-only fields; replay checks matching pair fingerprints. Receipts can remain after failed commit; no deletion. Client cannot create receipts. Separate Rules use exact receipt equality, maintaining lifecycle and permission constraints. No endpoint exposed; not a production trusted service. Test-only IDs and photos. Fingerprint is not an authorization credential. Real Auth means actual Auth Emulator ID token, not production Auth.

32 planned integration scenarios: 23 baseline adapted + 9 additional verifier/receipt/atomic tampering and divergent replay/concurrency tests. Not executed here; Rules expression budget and compilation still must pass in fresh emulator. Node strict queue remains a separate regression. Pending: actual IndexedDB integration with strict wrapper, legacy compatibility, trusted service deployment design, real private Supabase storage and signed URL authorization, production portal UAT, release review. Hosted UAT remains OFF.

Offline:
node scripts/test-qc-uat-strict-queue.mjs
node scripts/test-qc-uat-strict-integration.mjs --self-test

Emulator:
firebase emulators:exec --only firestore,auth --project demo-qc-uat-strict-integration --config firebase.uat-strict-integration-emulator.json 'env -u GOOGLE_CLOUD_PROJECT -u FIREBASE_PROJECT_ID GCLOUD_PROJECT=demo-qc-uat-strict-integration FIRESTORE_EMULATOR_HOST=127.0.0.1:8685 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9499 node scripts/test-qc-uat-strict-integration.mjs --emulator'
