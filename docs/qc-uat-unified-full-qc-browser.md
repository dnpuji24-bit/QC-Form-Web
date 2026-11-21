# 11D.5c.2b.3 — Focused complete React Spray/Fertilizer browser commit UAT

## Operator-confirmed baseline (2026-11-21)
- `npm run test:uat:quick`: PASS. Including all 10 new photo-free full editor DTO contract cases, previous 10 scalar contracts, route/source guards, TypeScript.
- `npm run test:uat:ui`: **17 / 17 PASS** (real Auth emulator + Role UI + Planning HTTP + React visibility).
- Earlier `npm run test:uat:smoke`: **16 / 16 PASS** (including 8 full HTTP Spray/Fertilizer backend integration).

## New focused full-browser test (authored; operator execution pending)
New file: `scripts/test-qc-uat-unified-full-qc-ui.mjs`.
New command: `npm run test:uat:full-ui`.

This spins up the **demo-only** Firebase Auth/Firestore emulator and same-origin, loopback-only UAT Owner HTTP, Planning HTTP and the isolated React shell. It builds the production-independent Vite bundle **in memory**, with a strict `src/` module allowlist and blocked browser egress, local/session storage, CSP and WebSockets. It does not touch hosted UAT, production data, photos, inventory, Supabase, deployment or the real operational UI.

Five targeted, real-browser cases:
1. Login `uat-field`, verify `qc_spraying` and `qc_fertilizer` edit gates, read **complete trusted Planning snapshots** for both Daily IDs. A cross-form Daily mismatch must be denied.
2. Fill complete Spray in **React**: unit, assistant, 08:00–17:00 with 12:00–13:00 hold, over-target 12 Ha, 14.7 L measured pesticide, water/adjuvant fields. Commit through real browser same-origin proxy; intentionally lose **only the response** after the actual backend write, to trigger exact-payload retry. Confirm canonical QC, Spray full sidecar, Actual and audit were written.
3. Retry *identical* submission through the React retry button after uncertain response and prove **one** QC, one Actual, one full detail and exactly one audit of each type, not a duplicate.
4. Fill complete Fertilizer in **React** with separate synthetic NK 3500 kg / 8 Ha and DAP 750 kg / 5 Ha. Verify per-component application areas and quantities, independent physical-coverage semantics (do not fabricate a scalar Actual Ha), immutable full DTO and matching audits.
5. Revoke the same user's Spray/Fertilizer Edit rights and ensure fresh full source is denied, UI panels disappear on explicit refresh, and no production-root sentinel, browser storage or outside requests changed.

Fixture created only inside emulator with trusted service `createPlanningMasterSnapshotService`: verified Monthly + Daily + group snapshots, separate Spray/Fertilizer activities and current master materials, synthetic foreman, approved synthetic fertilizer products. The test fails unless the emulator starts with zero users and zero relevant records.

## Run once in Cloud Shell
```bash
cd ~/QC-Form-Web
git pull --ff-only origin feature/firebase-auth-claims-supabase
npm run test:uat:full-ui
```

Expected only after operator actually runs successfully:
```text
SUCCESS: 5 focused full QC React browser -> trusted Planning HTTP -> actual/audit emulator checks passed
SUCCESS: focused 5-case complete full QC React browser operational commit passed
```

Only this **5-case** test is required for the next iteration. The previous Quick/Smoke/17 browser tests are already operator-confirmed. `npm run test:uat:full` now also includes the focused test as a release regression, but is not necessary for each short cycle.

## Remaining for production or pilot
This still verifies only the isolated UAT React editor and Firestore/Auth emulators, no end-user production SprayForm.tsx/FertilizerForm.tsx migration, no photos/scan or signed storage URL, no offline queue/replay after browser restart, no live hosting or Supabase writes. Multi-unit legacy UX and full measured-fertilizer semantics must undergo separate parity assessment before promotion. **Do not deploy.**
