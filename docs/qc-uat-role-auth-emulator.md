# Owner-managed permissions, real Auth and concurrent QC — dedicated demo candidate

Operator confirmed 30/30 role Firestore SDK/Rules checks at fcc17ab, exit code 0, normal emulator shutdown. User decision: Owner manually controls user menu permissions; role matrix is initial defaults only. Explicit none/view/edit overrides win and must persist; login must never replace them. Do not change current production grants. The earlier role-level override remains optional baseline; no automatic grant or reset on existing accounts. The owner-only control plane is separate from operational menu permission. Isolation markers, role, enabled state and claims are not client-editable, even by Owner. Cross-owner operational edits are a separate unapproved policy.

New pure Owner permission patch contract preserves prior manual overrides, requires eligible current synthetic Owner + claim, denies self and other Owner targets (candidate safety limit), rejects production profile and stale revision, validates exact menu modes, and generates audit payload. Trusted service simulation verifies actual Auth Emulator ID token and reads current actor/target/profile in Admin Firestore transaction before updating only permissions/manualOverrides/policyRevision and creating audit atomically. No endpoint is exposed, no production Admin SDK access, no real credentials, no deployment. Production provisioning, permissions UI, role changes, Owner recovery, existing grant migration and audit retention still require separate design. The demo rules from fcc17ab remain unchanged; manual policy metadata is stored on private marker.

Separate project demo-qc-uat-role-auth; Firestore 127.0.0.1:8485; Auth 127.0.0.1:9299. Fresh demo only; no import/export or data clear. Test creates synthetic identities, uses actual emulator Auth sign-in, ID token verification, current marker permission enforcement on two sessions, relogin preservation, stale permission revision and conflicting QC revisions. No guarantee of production concurrency or authorization. 20 pure Owner checks passed in JS runtime before commit; 19 integration checks are authored but not run here. Node and emulator verification pending. Hosted UAT remains OFF.

Offline:
node scripts/test-qc-uat-owner-permissions.mjs
node scripts/test-qc-uat-role-auth-emulator.mjs --self-test

Integration:
firebase emulators:exec --only firestore,auth --project demo-qc-uat-role-auth --config firebase.uat-role-auth-emulator.json 'env -u GOOGLE_CLOUD_PROJECT -u FIREBASE_PROJECT_ID GCLOUD_PROJECT=demo-qc-uat-role-auth FIRESTORE_EMULATOR_HOST=127.0.0.1:8485 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9299 node scripts/test-qc-uat-role-auth-emulator.mjs --emulator'

Operator verification after `54d03c9`: 19/19 real Auth, Owner permission and concurrent transaction checks passed, exit code 0 and normal shutdown. No production approval implied. Next: [isolated photo queue browser checkpoint](qc-uat-photo-queue-browser.md).
