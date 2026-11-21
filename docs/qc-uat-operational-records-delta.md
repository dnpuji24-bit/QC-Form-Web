# 11D.5c.4.3 — Data QC + per-record Actual details (read-only isolated UAT)

## Evidence already confirmed
The operator's latest Cloud Shell screenshot confirms all **6/6** Summary/Calendar delta checks passed, exit 0 (three offline + three Chromium/Firebase demo emulator). Prior private photo UAT, retry, role revocation, photo corrections and failure recovery also passed. Those gates are **not repeated** here.

## Added in feature branch
- `src/qcUatOperationalRecords.mjs`: monthly, bounded **up to 50 synthetic QC records**, filter `all|spray|fertilizer`, ordered newest-to-oldest by date. Verifies QC identity, current full DTO audit, operational audit and linked Actual identity before projecting only display-safe fields. A bad/missing required pair fails closed rather than silently showing invalid data. It never returns raw form payloads, private photo paths, signed URLs or storage credentials.
- Spray Actual uses physical area in hundredths of hectares; Fertilizer displays component application area separately (NK/DAP) and **does not present their sum as unique physical hectares**. Draft with no Actual is clearly distinguished from ready/confirmed.
- `createPlanningOperationalRecordsService` reads the current role and verified Firebase Auth token **in a Firestore Emulator transaction**, checking the `qc_records` read permission independently from Spray/Fertilizer write permission. It queries only `qc_uat_workspaces/cutover` and rejects over-50 scope.
- Fixed `/uat/unified/portal/qc-records` POST route in trusted localhost Planning HTTP; no arbitrary collection, path or frontend Storage SDK.
- The UAT-only portal's Form QC area now includes **Data QC & Actual** with month/form filters and actual component details. This is read-only; editing, global history search and production exports are not enabled. Switching identity or role clears cached results.

## One compact Cloud Shell gate
```bash
cd ~/QC-Form-Web
git switch feature/firebase-auth-claims-supabase
git pull --ff-only origin feature/firebase-auth-claims-supabase
npm run test:uat:portal-records
```

Runs only **3 offline contract checks** (safe projections; stale audit and wrong Actual blocked; draft vs ready semantics) and **3 Chromium browser checks** (viewer with `qc_records` permission sees Spray and NK/DAP records without edit; filter works; updated role removes UI and denies a same-token backend request with 403). Browser uses fresh synthetic records and Firebase Auth/Firestore demo emulators only; no Supabase photo, Hosting, production project, Cloud Billing, public RLS or migration. Other previously passed gates are deliberately skipped.

Expected only after operator execution:
```text
SUCCESS: 3 focused Data QC/Actual read-only delta checks passed (OFFLINE)
PASS: Data QC navigation respects qc_records viewer grant without edit access
PASS: viewer reads immutable Spray and Fertilizer QC with component-wise Actual details
PASS: current-role revocation hides Data QC and same-token backend read returns 403
SUCCESS: 3 focused Data QC/Actual record browser delta checks passed (demo Firebase only)
```

## Limitations and next steps
This is a **bounded UAT record listing**, not the previously requested production 100-latest/global-search Data QC. The seeded browser checks deliberately cover **projection and authorization** from synthetic paired records; the complete QC save/Actual/photo path was validated in earlier gates. Before operational cutover still needed: production-compatible Data QC pagination/global search, complete Actual Plan view, material IN/OUT tracking, Excel export fidelity, real-role field UAT, backup/rollback/deployment review. Current production `form-qc-unm` stays unchanged.

## Verification
Changes are committed and source reviewed. Cloud Shell/browser test execution for this new gate is **pending user confirmation**.
