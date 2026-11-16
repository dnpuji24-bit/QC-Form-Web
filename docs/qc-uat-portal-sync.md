# Phase 11C.1 — React HTTP sync to atomic transaction

Operator screenshot after 1260c3f: 23 policy + 20 local HTTP/Auth/Firestore checks passed, exit 0. Mock storage/tickets. 11B verified for that suite.

New independent React lab served on loopback 4585, not the actual App.tsx. Browser sends original durable strict job over fixed same-origin POST /api/qc-uat/v1/sync. Server verifies actual Auth Emulator token, current marker and owner/edit policy (including replay), then executes the previously tested trusted strict transaction adapted from test-qc-uat-strict-integration.mjs. Actual Firestore client Rules apply to QC, Actual and Audit. Storage remains in-memory mock. Browser session injected by test fixture (one emulator token in memory; no production credentials or login UI). Existing browser queue gains explicit endpoint flush entry with matching confirmation before conditional delete; no operational queue or production entrypoint changes. Same origin separate from 4385; no legacy DB migration. Browser blocks external requests/WebSockets, CSP connect-src self; Vite builds in memory without env directory. No Supabase calls or cloud writes. HTTP sync is a separate lab route, not a deployment of 11B upload/signer endpoints. 16 browser integration scenarios authored; not executed in authoring environment. Need full browser run and regression of prior strict lab. Demo project demo-qc-uat-portal-sync, Firestore 8985/Auth 9799. No production cutover.

Remaining: actual App.tsx wiring and full DTO, genuine browser login and owner permission UI, real storage/sign endpoint composition, multi-tab/batch/legacy migration and production release gates. No automatic permission edits or old UAT route calls.

Offline: node scripts/test-qc-uat-portal-sync.mjs --self-test
Browser: with QC_UAT_PLAYWRIGHT_DIR and PLAYWRIGHT_BROWSERS_PATH set, firebase emulators:exec --only firestore,auth --project demo-qc-uat-portal-sync --config firebase.uat-portal-sync-emulator.json 'env -u GOOGLE_CLOUD_PROJECT -u FIREBASE_PROJECT_ID GCLOUD_PROJECT=demo-qc-uat-portal-sync FIRESTORE_EMULATOR_HOST=127.0.0.1:8985 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9799 node scripts/test-qc-uat-portal-sync.mjs --emulator'

Follow-up review: add browser interception of a successful HTTP response with changed fingerprint (queue must remain intact), and direct divergent same-revision HTTP replay denial. Session subscription initializes after mounting to avoid missed fixture events. All browser tests pending. No live changes.

Operator verification at `6626cc9`: 16/16 React HTTP sync and atomic Firebase emulator checks passed, exit 0 (mock storage). Next [actual SprayForm browser capture](qc-uat-spray-form.md). No production readiness implied.
