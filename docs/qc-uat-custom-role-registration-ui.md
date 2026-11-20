# 11D.4e.2 — Isolated Custom Role Registration UI and Owner Approval

Baseline: 11D.4e.1 passed in Cloud Shell screenshots on 20 Nov 2026: 45 offline/typecheck, 15 registration emulator, 29 Owner HTTP and 11 Owner browser regression (100 total). The backend baseline is 2be9bdc.

Boundary: fixed demo-qc-uat-owner-http, Firestore emulator 9485, Auth emulator 10299, loopback HTTP 4497. Applicant is an already provisioned, email-verified, UAT-claim-bearing synthetic Firebase Auth user. Browser cannot create Firebase Auth users, set claims, verify emails or write Firestore. Real emulator Firebase Auth tokens live in memory only; no local/session storage or inferred permission fallback. Owner panel appears only with a validated current Owner session.

Owner inbox endpoint POST /uat/owner/registration/inbox with empty JSON object: capped to 100 canonical, fully validated rows; Owner claim and active marker/production collision checks. No passwords or real identities. Applicant sees only custom role id/name.

Applicant requests catalog role with no marker. Owner chooses approved role separately and approves/rejects expected revision 0. Applicant activates the approved role; existing server revalidates catalog, absence of production profile/marker, token claim, email verification and atomic audits. No self approval, stale replay or browser Firestore access. UI discards in-flight results after identity switch, blocks on failed mutation until refresh, and does not infer pending status from a failed response.

New source and test will be isolated from production App, NativeUsersAccess, Rules and Supabase. No public signup, email enrollment, hosted deployment, scalability/pagination or rate limiting. Test candidate must be verified through Cloud Shell emulator before any further rollout.

## Authenticated browser implementation and tests

Implemented components: src/UatCustomRoleRegistrationPanel.tsx (applicant status/request/activation), src/UatCustomRoleApprovalPanel.tsx (Owner inbox/explicit role review), uat-custom-role-registration-lab/main.jsx (in-memory real Auth emulator, no Firestore client), and scripts/test-qc-uat-custom-role-registration-ui.mjs (14 browser integration checks). Existing Owner HTTP service adds Owner-only registrationInbox. Source production isolation is checked by --self-test and Vite build source-module allowlist, and browser intercepts external network/WebSockets. Permission revocation UI closes on manual session refresh; server revocation is enforced per HTTP request. No automatic polling is claimed. Browser runner is authored, not verified until operator runs Cloud Shell.

Run tests:

1. git pull --ff-only origin feature/firebase-auth-claims-supabase; node scripts/test-qc-uat-custom-role-registration-ui.mjs --self-test; node scripts/test-qc-uat-custom-role-registration-contract.mjs; node scripts/test-qc-uat-custom-roles.mjs; node scripts/test-qc-uat-role-assignment.mjs; node scripts/test-qc-uat-owner-permissions.mjs; npm run typecheck.
2. Run Firebase Auth+Firestore emulators with --project demo-qc-uat-owner-http --config firebase.uat-owner-permission-http.json and environment GCLOUD_PROJECT=demo-qc-uat-owner-http, FIRESTORE_EMULATOR_HOST=127.0.0.1:9485, FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:10299; execute node scripts/test-qc-uat-custom-role-registration-ui.mjs --browser with QC_UAT_PLAYWRIGHT_DIR set to the existing local Playwright install. Expected: 14 checks.
3. Existing emulator regressions scripts/test-qc-uat-custom-role-registration.mjs --emulator (15), scripts/test-qc-uat-owner-permission-http.mjs --emulator (29), scripts/test-qc-uat-owner-session-browser.mjs --browser (11): total 55 checks.

After passing: 11D.4f Edit/Delete Role still pending, including safe tombstones for assigned users and permission revision invalidation. Do not enable production integration by default.
