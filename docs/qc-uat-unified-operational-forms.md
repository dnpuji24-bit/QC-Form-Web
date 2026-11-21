# 11D.5c.2a — Targeted QC Spray/Fertilizer form bridge (isolated UAT)

## Verified starting point
Operator screenshots from 21 Nov 2026 confirm 11D.5c.1 **15/15** React browser checks, **97** existing backend emulator/regression checks and TypeScript PASS. The existing `SprayForm.tsx` and `FertilizerForm.tsx` have sophisticated actual operational fields (units, nozzle, material, doses, hold time, scanner, photo), but use the older app/queue/transport. **This commit does not refactor or replace them.**

## Implementation (first narrow integration slice)
- `createPlanningQcSelectionService` is appended to `server/qc-photo-access/uat-planning-role-service.mjs`. It requires `QC Spray Edit` or `QC Fertilizer Edit`, validates synthetic Daily Plan canonical state, form match and Monthly parent (if MONTHLY), and returns only 11 minimal trusted source fields + readOnly flag. Users with QC Edit do not need Planning View. No arbitrary raw document or materials are returned.
- `/uat/unified/qc/source` is added to the guarded Planning HTTP API and existing exact same-origin browser-shell proxy allowlist. The server independently rechecks token and current identity/role on each request.
- `src/qcUatUnifiedOperationalForm.mjs` builds a strictly canonical synthetic QC commit request with immutable PID/date/source DP/shift/foreman from server source, integer hundredths hectares, exact fields, current DP revision and stable retry IDs. Not compatible with the *full legacy operational DTO* without further work, by design.
- `src/UatUnifiedOperationalForm.jsx` mounts two visibly UAT-only starter forms in the isolated unified React shell when form edit permissions are present. It selects by exact Daily Plan ID, displays verified source metadata, allows draft or ready, and calls existing atomic QC/Actual service. Ambiguous network failure retains the same request for explicit replay. Existing **production** SprayForm/FertilizerForm and routes are untouched.
- **Not supported in this slice**: actual SprayForm/FertilizerForm full detailed fields, photo uploads, Supabase/Drive, material dose, QC PDF/export, shift-1-to-2 carryover, correction of existing QC, multi-unit cards, offline queue or hosted deployment. Test result is NOT production readiness.

## Shortened testing procedure
The user explicitly approved three levels: quick per change; focused emulator smoke for touched domain; full regression only before release/pilot or broad security/schema changes.

`package.json` now has three real commands:
1. `npm run test:uat:quick`: source syntax/isolation guards, **10** focused canonical adapter contracts, old unified/backend + browser source self-tests, TypeScript. No emulators needed. Default for every code change.
2. `npm run test:uat:smoke`: **8 focused Firebase Auth + Firestore emulator cases** for Spray & Fertilizer source selection, role isolation, ready/draft, Actual, exact idempotent retry, stale revision and source forging, permission revocation and denied browser Firestore rules; same shared demo project `demo-qc-uat-unified-role-planning` and ports 9285/10099. Run when form or transport/security changes.
3. `npm run test:uat:full`: release-gate baseline. Runs quick + 8 smoke + 21 unified Owner→Planning→QC/Actual + 17 unified React Owner/Planning/Spray/Fertilizer browser + 16 Owner lifecycle + 19 Planning role + 19 Planning write + 22 Planning QC = **122 emulator/browser checks**, plus offline and typecheck. This is the relevant recent **baseline**, not a claim that every repository test is executed. Run before hosted UAT/pilot and broad architectural releases.

Each emulator group uses a fresh synthetic project with exact guard and no production writes. No test command deploys Hosting, Firestore Rules, Supabase resources, or access changes.

## Cloud Shell commands
```bash
cd ~/QC-Form-Web
git pull --ff-only origin feature/firebase-auth-claims-supabase
npm run test:uat:quick
npm run test:uat:smoke
```

Run `npm run test:uat:full` only at the release gate; it requires preinstalled Playwright at `QC_UAT_PLAYWRIGHT_DIR` (default `$HOME/qc-uat-playwright`) and Chromium at `PLAYWRIGHT_BROWSERS_PATH` (default `$HOME/.cache/ms-playwright`).

## Next scope
11D.5c.2b: carry existing actual SprayForm/FertilizerForm full fields (no lossy DTO), group and source snapshots, photo/outage metadata and corrective revisions through the trusted UAT backend; validate actual React UI end-to-end. Only after that can 11D.5c.2 be called fully integrated, and 11D.5c.3 photos/reports proceed safely.
