# 11D.4d.1 — Custom role Planning authorization (isolated read gate)

Operator Cloud Shell at bf5d37c confirmed 38 lifecycle checks, portal sync safety guards, typecheck and 24 React HTTP sync / atomic emulator checks (mock storage), exit 0. Prior custom permission restoration and receipt expression-limit issue resolved within that gate.

This next candidate is a standalone trusted service, not mounted in the live portal or any HTTP entrypoint. Dedicated demo project and deny-all client Rules. Firebase Auth tokens verified, marker and production collision checked, custom catalog read in same Firestore transaction as permission check and optional synthetic MP/DP read. Built-in markers must also match Owner-managed role + manual overrides. Current permission is checked per request, never cached in token. Monthly, Daily, Actual and Summary capability keys independent; Edit implies View, explicit None revokes. No import or QC permissions inferred. Only minimal synthetic MP/DP projections, no list, summary data, Actual data, QC foreign access, write API, import or production mapper. Actual/Summary checks are capability probes only. No new live Rules, storage, accounts, deployment or Supabase changes.

Run offline:
`node scripts/test-qc-uat-planning-role.mjs --self-test`

Run emulator:
`firebase emulators:exec --only firestore,auth --project demo-qc-uat-planning-role --config firebase.uat-planning-role-emulator.json 'env -u GOOGLE_CLOUD_PROJECT -u FIREBASE_PROJECT_ID GCLOUD_PROJECT=demo-qc-uat-planning-role FIRESTORE_EMULATOR_HOST=127.0.0.1:9085 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9899 node scripts/test-qc-uat-planning-role.mjs --emulator'`

19 planned emulator checks include same-token revocation/restoration, forged marker/catalog, built-in policy parity, independent menu keys, malformed row, root isolation and direct client denial. Tests authored; execution and typecheck pending operator Cloud Shell. After pass: design complete MP/DP DTO write/update/cancel semantics, linked Actual constraints and audit; separate summary/actual read policies, then browser/HTTP integration. Hosted UAT remains OFF.
