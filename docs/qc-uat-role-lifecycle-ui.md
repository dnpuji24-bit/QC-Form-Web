# 11D.4f.2 — Owner React Edit/Delete Custom Role lab (UAT only)

## Baseline
Operator Cloud Shell screenshots, 20 Nov 2026: 11D.4f.1 passed Test 1 56 offline/typecheck, Test 2 16 Firebase Auth+Firestore emulator, Test 3 69 full Owner regressions (141 checks). These are verified baseline; **11D.4f.2 browser tests are authored but runtime not yet verified**.

## Delivery
- `src/UatRoleLifecyclePanel.tsx`: a separate Owner role lifecycle panel that only lists custom roles, reads current server preview, shows exact catalog revision and affected assigned UIDs/policy revisions, edits all 21 explicit role permission keys, shows a permission diff, and requires typing `UBAH custom-role-id` to commit. Displays disabled Delete with assigned member count, requests `HAPUS custom-role-id` confirmation only for zero-member roles. Manual overrides are preserved by trusted backend. Unconfirmed HTTP responses or network losses fail closed and require fresh read before retry; no automatic replays.
- `uat-role-lifecycle-lab/main.jsx`: real Firebase Auth emulator in-memory session, dedicated loopback demo at `http://127.0.0.1:4497`, Owner-only route to the panel, no Firebase Firestore browser SDK, no production imports, no persistent permission cache; explicit Refresh session and Logout.
- `scripts/test-qc-uat-role-lifecycle-ui.mjs`: 16 Playwright browser checks using Firebase Auth + Firestore emulator, source allowlist, CSP & egress guard, owner/member/viewer sign-in, selected role preview, explicit confirmations, atomic edit/audit, same-token permission refresh, stale revision and network failure block, account reassignment before archive, tombstone/ID reuse denial, pending registration guard, Owner revocation, and root sentinel unchanged.

## Safety and limits
All role permissions are server-authoritative, with the existing `createOwnerService` API previously verified in 11D.4f.1. The new panel never grants permissions locally and has no delete path for built-ins, Owner, or an assigned role. It does not call Supabase, Firestore directly, nor live production routes. No real account registration, no public browser deployment. This is an intentionally separate UAT lab, **not integrated into the live portal**. Existing Add Role, Assign Role, and Registration UI remain unmodified.

The user must reassign each active member through the existing audited Assign Role service before deletion. Historical role ID cannot be reused because of a persistent tombstone. Unresolved registration requests block role edits/deletion on the backend even when the preview shows zero assigned members.

## Cloud Shell verification
Pull branch `feature/firebase-auth-claims-supabase` first. Use the dedicated project `demo-qc-uat-owner-http`, Firebase configuration `firebase.uat-owner-permission-http.json`, Firestore `127.0.0.1:9485`, Auth `127.0.0.1:10299`. Local test only, no deployment.

Test 1: `node scripts/test-qc-uat-role-lifecycle-ui.mjs --self-test`; `node scripts/test-qc-uat-role-lifecycle-contract.mjs` (11); `node scripts/test-qc-uat-custom-role-registration-contract.mjs` (9); `node scripts/test-qc-uat-custom-roles.mjs` (8); `node scripts/test-qc-uat-role-assignment.mjs` (8); `node scripts/test-qc-uat-owner-permissions.mjs` (20); `npm run typecheck`. Expected 56 checks plus isolation/syntax/typecheck.

Test 2: `node scripts/test-qc-uat-role-lifecycle-ui.mjs --browser` inside a fresh Auth/Firestore emulator. Requires previously installed Playwright Chromium at `QC_UAT_PLAYWRIGHT_DIR`, default `$HOME/qc-uat-playwright`; `PLAYWRIGHT_BROWSERS_PATH` default `$HOME/.cache/ms-playwright`. Expected 16 new browser checks.

Test 3 regressions, fresh emulators separately: `test-qc-uat-role-lifecycle.mjs --emulator` (16), `test-qc-uat-custom-role-registration.mjs --emulator` (15), `test-qc-uat-owner-permission-http.mjs --emulator` (29), `test-qc-uat-owner-session-browser.mjs --browser` (11), `test-qc-uat-custom-role-registration-ui.mjs --browser` (14). Expected 85 regression checks.

Total **157 expected** checks across Test 1-3, pending operator execution. GitHub existence and commit verification alone do not verify browser/TypeScript runtime.
