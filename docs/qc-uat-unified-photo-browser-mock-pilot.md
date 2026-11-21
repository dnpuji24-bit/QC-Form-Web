# 11D.5c.3b.2e.2 — Opt-in React photo submit pilot, trusted loopback HTTP, MOCK Storage only

## Verified operator baseline (2026-11-21)
Screenshot confirms **11/11 React full QC browser cases**, **10/10 photo preflight contracts**, **10/10 photo compression contracts** and TypeScript, including Shift 1 → Shift 2, source mandor, staged main/HOLD/scan and JPEG/PNG/WebP compression. The output explicitly says **no photo upload**. The screenshot does not independently show `test:uat:photo-transport`; that gate is included here.

Previous live private Supabase UAT service tests passed 9 atomic and 15 signed-read/role checks and scoped cleanup. This pilot does NOT repeat live Supabase writes.

## New implementation / safeguards
- `scripts/test-qc-uat-unified-full-qc-ui.mjs` has a **separate** `--browser-photo` execution mode, isolated from the existing `--browser` 11-case regression.
- The dedicated test passes a Vite compile-time `__QC_UAT_BROWSER_PHOTO_PILOT__=true` flag to the UAT-only portal entry and explicitly injects `createMemoryPhotoObjectStore` into the emulator-only trusted Planning HTTP service. Ordinary portal builds have no test flag; the photo call adapter is otherwise dormant.
- Four focused Chromium cases cover: authenticated login + current trusted Spray/Fertilizer sources; React Spray main/HOLD photo → trusted HTTP QC + Actual + immutable ledger under a deliberately lost HTTP reply and **identical request retry**, asserting no duplicate photo bytes or QC row; React Fertilizer main/scan photo with independent NK/DAP component areas (8 and 5 Ha); no browser storage, no root mutation, no external Supabase request and no CSP/network escape.
- No upload/storage API key, public bucket or production Firebase project is accessed. All Firestore/Auth operations execute in fresh **demo emulators**, and photo bytes stay in an in-memory mock. This phase tests the browser-to-server integration missing from earlier service-only tests. Browser-facing signed preview is a separate gate.
- Existing `npm run test:uat:full-ui` and `npm run test:uat:photo-stage` remain in standard photo-disabled mode. Production `form-qc-unm` code and runtime are unchanged.

## Run in Cloud Shell
```bash
cd ~/QC-Form-Web
git switch feature/firebase-auth-claims-supabase
git pull --ff-only origin feature/firebase-auth-claims-supabase
npm run test:uat:photo-browser
```

No Supabase secret key needed. The command executes 7 offline transport cases, TypeScript, then **4 isolated Chromium browser/HTTP/Firebase emulator cases using MOCK Storage**. Do not regard the code as verified until the operator shares a complete successful Cloud Shell result.

Expected on a successful run:
```text
SUCCESS: 7 isolated photo browser-to-HTTP transport contracts passed (OFFLINE, NO photo upload)
PASS: React Spray main+HOLD -> trusted HTTP atomic QC, lost reply -> exact photo retry
PASS: React Fertilizer main+scan -> one QC and independent NK/DAP Actual
SUCCESS: 4 isolated photo React -> trusted HTTP -> MOCK bytes + atomic QC/Actual emulator checks passed (NO Supabase upload)
SUCCESS: 7 offline photo transport checks, TypeScript and 4 focused MOCK photo browser-emulator checks passed (NO Supabase upload)
```

## Next after the operator passes this gate
1. Review and reconcile failed mock runs, especially stale uploads / role revocation / exact duplicate retry, before live storage browser integration.
2. For a live browser UAT pilot, design a trusted ephemeral **run ID handshake**. The real adapter currently demands a synthetic `qc-v2-uat-<random32>-...` record ID and actor UID bound to a single run, whereas browser-created IDs use a different format. Never relax the real-store guard or let the browser invent the storage scope.
3. Separately implement/verify signed preview bound to committed audit, correction/versioned history and orphan reconciliation; do not enable production users or Hosting until end-to-end live gate and release review pass.

## Verification status
GitHub files and JS structural parse checks were completed; **no Chromium/Firebase emulators were executed by the assistant**. No production deployment, Storage schema mutation or Supabase upload occurred.
