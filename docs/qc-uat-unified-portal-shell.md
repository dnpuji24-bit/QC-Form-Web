# 11D.5c.1 — Isolated React Owner/Planning portal shell and readiness guard

## Verified baseline
Operator screenshots 21 Nov 2026 confirm prior 11D.5b: syntax/typecheck/isolation PASS, **21/21** Owner HTTP → Planning HTTP → QC/Actual with one Auth token and Firestore emulator, **76** Owner + Planning regression checks (last visible Test 3 script succeeded, code 0). These are emulator tests, not hosted UAT or production approval.

## Deliverable — not the live portal
The goal is to validate a **browser-to-backend integration boundary**, not silently wire the current production frontend (which still uses its original Firebase, Apps Script, offline queue, Supabase and permissions).

- `uat-unified-portal-lab/main.jsx`: standalone React shell, Firebase Auth emulator in-memory session, Owner Edit/Delete Role panel (existing `UatRoleLifecyclePanel.tsx`), server-confirmed current session/role revisions, clear-on-switch/logout/denied state, permission-filtered Monthly, Daily, Summary, Actual and QC Spray/Fertilizer menu **indicators**, and real read-only Monthly/Daily Plan actions via Planning HTTP. QC indicators are NOT functional Spray/Fertilizer forms; no mock save button is portrayed as operational.
- `server/qc-photo-access/uat-unified-browser-shell.mjs`: loopback HTTP `127.0.0.1:4797` with memory-only built assets and strict CSP. Browser sends same-origin POST to exact `/api/owner` + allowlisted Owner endpoint and `/api/planning` + allowlisted Planning endpoint; server proxies only these fixed literal paths to already-verified loopback Owner `127.0.0.1:4497` and Planning `127.0.0.1:4697`. Request origins and host checked, 8 KiB body limit, JSON only, Bearer token, no CORS grants, no cookies, no external URL, timeout and fail-closed transport. The proxy does not verify role itself; each trusted backend still rechecks token and latest grants.
- `scripts/test-qc-uat-unified-portal-ui.mjs`: **17 authored real Chromium/Playwright browser checks** using three separate Auth browser contexts. All scripts seed synthetic demo-only roles and minimal MP/DP fixture through trusted emulator Admin SDK, then test Owner UI previews and edits an assigned custom role, member menu changes only on fresh server session, same Auth token executes Planning reads, stale menu cannot bypass backend, account switching/logout clears grants, unrelated visitor denied, no WebSocket/external egress/local storage or production root changes.
- No source import in `src/main.tsx`, `src/App.tsx`, native admin/production server entrypoints, no Hosting, deployment, Firestore Rules or Supabase change. The old standalone Owner and Planning demo projects still work independently.

## Status and remaining blockers
**Authored and committed, operator Cloud Shell runtime test pending.** Passing this lab will show real React/Owner/Planning read integration in one emulator, **not** that the existing live QC UI can use the new APIs directly. The existing production app still uses a different app bootstrap/feature flags/queue. Full production schema, actual photo signed uploads, full QC Spray/Fertilizer forms, reporting/Actual UI, real authorization user-migration and rollback have not been released by this change. Hosted UAT remains OFF per `docs/qc-hosted-uat.md`. Do not deploy, enable public Hosting, alter production Auth claims, or enable billing from these steps.

## Cloud Shell Test 1: offline syntax, guard and typecheck
```bash
(
 set -e
 cd ~/QC-Form-Web
 git pull --ff-only origin feature/firebase-auth-claims-supabase
 git log -1 --oneline
 node --check server/qc-photo-access/uat-unified-browser-shell.mjs
 node --check scripts/test-qc-uat-unified-portal-ui.mjs
 node --check server/qc-photo-access/uat-unified-planning-http.mjs
 node scripts/test-qc-uat-unified-portal-ui.mjs --self-test
 npm run typecheck
 echo '=== TEST 1 PASSED ==='
)
```

## Test 2: real React browser (15 new)
```bash
(
 set -e
 cd ~/QC-Form-Web
 export QC_UAT_PLAYWRIGHT_DIR="${QC_UAT_PLAYWRIGHT_DIR:-$HOME/qc-uat-playwright}"
 export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"
 firebase emulators:exec \
   --only firestore,auth \
   --project demo-qc-uat-unified-role-planning \
   --config firebase.uat-unified-role-planning-emulator.json \
   'env -u GOOGLE_CLOUD_PROJECT -u FIREBASE_PROJECT_ID QC_UAT_MODE=unified-lab GCLOUD_PROJECT=demo-qc-uat-unified-role-planning FIRESTORE_EMULATOR_HOST=127.0.0.1:9285 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:10099 node scripts/test-qc-uat-unified-portal-ui.mjs --browser'
 echo '=== TEST 2 PASSED ==='
)
```
Expected `SUCCESS: 17 unified UAT portal-shell React browser checks passed`, exit 0. Require Playwright installed at the earlier known `QC_UAT_PLAYWRIGHT_DIR` and Chromium available. If not installed, do not auto-install or change the cloud configuration in this phase; inspect the existing Playwright setup.

## Test 3: backend safety regressions (97)
Run **fresh** same-project emulator: `scripts/test-qc-uat-unified-role-planning.mjs --emulator` (21). Then run the 4 original service regressions in their respective original isolated emulator sessions with `QC_UAT_MODE` explicitly unset: Owner `test-qc-uat-role-lifecycle.mjs --emulator` (16), Planning `test-qc-uat-planning-role.mjs --emulator` (19), `test-qc-uat-planning-write.mjs --emulator` (19), `test-qc-uat-planning-qc.mjs --emulator` (22). Total **97** checks, plus Test 2 **17** browser checks = **112** active checks.

Next stage after user verifies: 11D.5c.2 fuller isolated Spray/Fertilizer operational UI+photo UAT testing, and a separate hosted-readiness decision after reviewing schema, credentials, user migration and rollback.
