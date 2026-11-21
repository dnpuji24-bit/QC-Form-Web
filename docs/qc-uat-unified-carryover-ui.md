# 11D.5c.2b.4 — Explicit same-day Shift 1 -> Shift 2 carry-over in the isolated full QC UAT editor

## Verified predecessor
Operator's Cloud Shell screenshot on 2026-11-21 confirms **5/5** focused full React Spray/Fertilizer trusted browser commits passed, Firebase Auth/Firestore emulator exited zero. The previous full DTO photo-free receipt, independent NK/DAP components and failed HTTP response / idempotent retry are established as the pre-change baseline. Production has not been changed.

## New implementation (author-time checked; operator Cloud Shell browser run pending)
- `src/qcUatUnifiedCarryoverSelection.mjs` only allows two explicit modes. **Normal** uses exact verified Daily source shift/foreman and forbids any alternate foreman. **Carryover** requires a source whose original shift is **1**, chooses execution shift **2**, and requires a syntactically valid **explicit** actual foreman ID. The original Daily ID, date, form and revision remain from the trusted source; date cannot be edited. Responses must match both source and execution identities.
- `uat-unified-portal-lab/main.jsx` obtains the original scalar Daily source from the trusted backend, builds the explicit request and validates the full returned source projection before enabling form entry. The full trusted Planning service independently checks exact Daily/member revision, the source's date, active execution foreman, group snapshot and actual form permissions; client fields cannot directly write Firestore.
- `src/UatUnifiedFullOperationalForm.jsx` adds a checkbox "lanjutkan Shift 1 ke Shift 2" plus actual mandor ID field. A switch in Daily ID/selection clears the previously loaded source and form; loaded view displays both original and actual shift/foreman. The unchanged full DTO builder writes actual execution metadata and preserves source Daily ID + planned target. Same-foreman carryover is allowed; cross-date, Shift 2 -> Shift 1, or same-shift foreman override is not inferred.
- `scripts/test-qc-uat-unified-carryover-contract.mjs` has **10** pure JS cases for normal/carryover, same-foreman shift continuation, Fertilizer, invalid mandor/shift/source/selection and tampered server reply. Source guard, exact module allowlists and TypeScript are included in Quick.
- Existing `scripts/test-qc-uat-unified-full-qc-ui.mjs` now adds **2** real-browser cases for Spray and Fertilizer Shift 2 under a different active synthetic mandor on the *same* original Daily Plan. Tests assert separate source and actual identities, canonical QC, sidecar, original recipe, per-component NK/DAP amounts, no invented fertilizer physical area, original target counted once across actuals, and immutable audit. The five preceding browser cases remain; focused browser total **7**.
- Release regression updated from 135 to **137** combined checks (not all repository tests).

## ONE SHORT Cloud Shell COMMAND
```bash
cd ~/QC-Form-Web
git pull --ff-only origin feature/firebase-auth-claims-supabase
npm run test:uat:carryover
```
This runs Quick (10 new contract cases, existing contracts/guards, TypeScript) followed by only 7 focused React/Firestore/Auth emulator browser checks. No redundant whole-repository regression and no repeated 16 backend Smoke tests.

Expected only once verified by operator:
```text
SUCCESS: 10 same-day explicit QC UAT carryover contract checks passed (offline)
SUCCESS: 7 focused full QC React browser -> trusted Planning HTTP -> actual/audit emulator checks passed
SUCCESS: 10 explicit carryover contract checks, TypeScript and 7 focused full QC browser checks passed
```

## Do not promote yet
This still uses **synthetic UAT** master activity, foreman, selected paddock, role and monthly/daily IDs, with Firestore/Auth demo emulators; it is not the legacy production SprayForm/FertilizerForm, not actual staff roster validation, no offline background queue, photo storage, scanner or live hosting. Existing role checks, production app, Supabase storage and production root remain untouched. No deployment. After confirmation, proceed separately to signed photo/scan integration and offline queue in the unified UAT portal, with storage authorization/cleanup and release controls.
