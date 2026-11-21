# 11D.5c.2b.2 — Photo-free full QC editor, isolated React UAT only

## Proven prior baseline — 21 November 2026
Operator screenshot for `npm run test:uat:smoke` shows **16/16 PASS**, including the existing full Spray/Fertilizer HTTP + Firestore/Auth emulator 8/8: complete immutable materials, per-component NK/DAP, source/role enforcement, retry, audit, and denied browser writes. The expected permission-denied negative case was correctly rejected. The earlier 10 offline form-contract cases and TypeScript also passed.

## Incremental UI additions (authored, runtime integration pending)
- `src/qcUatUnifiedFullQcFormBuilder.mjs` constructs the exact canonical `qc-v2-uat-...` DTO from a server-projected **full QC source** plus *explicit* operator inputs. Uses the **same validators** from `qcUatSprayFullDto.mjs` and `qcUatFertilizerFullDto.mjs`. Supports ready/draft, current Daily revision, unit, assistant, overnight work, hold intervals, measured Spray use (up to four slots), dosage estimates (not a substitute for measured usage), adjuvant, independent Fertilizer filling with kg, hectares, actual kg/ha, calculated average and weighted dose, exact component/recipe linkage. It never fills measured quantities from theoretical estimates and never invents physical area from overlapping components.
- `src/qcUatFertilizerFullDto.mjs`: exports its already-existing canonical lists of string/number fields for the builder; validator itself unchanged.
- `src/UatUnifiedFullOperationalForm.jsx`: separate synthetic React operator editor for both forms; takes exact Daily ID and trusted source/foreman from server. Shows materials, lets operator enter execution and measured fields, only submits complete validated full DTO to the existing UAT HTTP full Spray/Fertilizer endpoint. On uncertain network response it keeps the **same** transaction/record ID for safe explicit retry. No local persistence, Firestore SDK, Supabase, photo upload, or production transport.
- `uat-unified-portal-lab/main.jsx`: adds `api.fullQcSource` (current scalar DP source followed by current rich source), `api.fullQcCommit` and permission-gated UAT full panels. No import in `src/App.tsx`, `src/main.tsx` or production server. The earlier scalar demo forms remain alongside them for comparison.
- `scripts/test-qc-uat-unified-full-qc-form.mjs`: **10 focused pure contract cases** for exact full spray, full fertilizer, time/hold computation, adjuvant and material quantities, source identity, draft, invalid input and byte-identical retry; fails closed on tampering. `scripts/run-qc-uat-gates.mjs` includes these in **quick**.
- Existing browser release regression now checks editor visibility is granted/revoked by current live role. It does **not** yet fill and commit the full editor by browser; the matching full backend commit *is* covered by emulator Smoke Test.

## What is NOT complete
This is **not** mounting or refactoring the production `SprayForm.tsx` or `FertilizerForm.tsx`. Those are >45 KB each and rely on operational master resources, current Firebase/Apps Script adapters, photo staging, and offline queue. The UAT editor deliberately covers the validated photo-free DTO subset only. Unported: real field UX parity, scanner, photo staging, offline queue, full multi-unit cards/availability, external signed photo URLs, browser-saved full DTO end-to-end, explicit shift 1→2 carryover selection (the HTTP supports it but UI currently selects same shift), production permission integration and hosted UAT. **Do not declare this phase production-ready, and do not deploy.**

## Shortened tests (same operator commands)
```bash
cd ~/QC-Form-Web
git pull --ff-only origin feature/firebase-auth-claims-supabase
npm run test:uat:quick
npm run test:uat:smoke
```
Quick now includes the extra 10 full editor DTO cases plus previous 10 scalar cases and isolation/TypeScript; it does not boot Firebase. Smoke retains 16 targeted backend emulator checks. `npm run test:uat:full` is reserved for release gates; it exercises the React browser bundle and current edit/revoke visibility, plus the 130 associated regression checks, but not all repository tests.

## Decision before proceeding
Once Quick/Smoke confirm no regressions, next task is *11D.5c.2b.3*: create a **targeted real-browser full form submission test** on complete Planning/master fixture; fill Spray and two Fertilizer components with UI controls, verify canonical, full sidecars, Actual and audit before considering final UX parity. Preserve current UAT-only isolation.
