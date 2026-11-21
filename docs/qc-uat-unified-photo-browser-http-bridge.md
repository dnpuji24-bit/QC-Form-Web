# 11D.5c.3b.2e.1 — Photo-inclusive QC browser → trusted HTTP bridge (isolated UAT)

## Starting point
Operator screenshots on 21 Nov 2026 passed:
- 9 isolated atomic QC/Actual/photo checks with real private Supabase UAT bytes; 4 run-owned objects removed.
- 15 isolated photo signing, permission and role-revocation checks with real private Supabase UAT bytes; 4 run-owned objects removed.
- Existing React full QC editor preview/compression tests for JPEG, PNG and WebP.
A read-only Supabase metadata check shows no objects for the last signed-photo run (`8bf4e56b229eda529a7a22ef457b8ce1`).
These checks do not demonstrate a browser photo-inclusive save; the UAT React editor was intentionally blocking that path.

## Code authored (NOT a deployment; operator test pending)
- `src/qcUatUnifiedPhotoCommitEnvelope.mjs` converts the **full unmodified QC DTO** and staged original-after-compression bytes to an exact `{sourceRequest, request, photos}` envelope. It derives source identity from the record's actual shift/foreman and Daily revision; limits photos to 1–4, max 2 MiB each / 6 MiB total, only JPEG/PNG/WebP, exact unique main/HOLD/scan slots and hold binding. Browser never chooses a Storage object path, bucket, public URL or signing token. The backend still independently validates bytes/signatures, SHA, role and source.
- `server/qc-photo-access/uat-unified-planning-http.mjs` now defines an explicit `/uat/unified/qc/full/photo/commit` route which is **404 unless** `createUnifiedPlanningHttp` is instantiated with a trusted injected `photoStore`. The route calls the previously verified `createPlanningPhotoCommitService` only after Auth and request-shape checks. This server can operate ONLY against the isolated loopback Firebase Auth+Firestore DEMO emulators; it is not mounted on production.
- `server/qc-photo-access/uat-unified-browser-shell.mjs` proxies that exact fixed local route with a 9 MiB cap, authenticated same-origin request, no arbitrary destination and a 45-second limit only for photo requests. Other route limits remain unchanged.
- `src/UatUnifiedFullOperationalForm.jsx` constructs an immutable retry envelope and checks the combined QC/photo receipt before claiming success. Pending requests retain the **same** photo bytes and QC identifiers on retry. Staged photos are cleared only after a confirmed atomic receipt. This path is available **only if** the supplied API has `photoCommitEnabled===true` and `fullQcPhotoCommit`.
- `uat-unified-portal-lab/main.jsx` supplies a dormant photo-call adapter but explicitly sets `photoCommitEnabled:false`. Thus the existing browser's photo buttons continue to be blocked when photos are staged; the end-to-end browser photo submit is **NOT enabled yet**.
- `scripts/test-qc-uat-unified-photo-transport-contract.mjs` adds **7 offline contracts** for lossless request identity, shift carryover, exact slots and HOLD, MIME and data size, retry determinism and exact loopback routes.
- Existing focused atomic emulator suite is extended with one **mock-store HTTP replay check** (from 9 to **10**). No new Supabase live write is required at this gate.

## Cloud Shell verification — next operator action
```bash
cd ~/QC-Form-Web
git switch feature/firebase-auth-claims-supabase
git pull --ff-only origin feature/firebase-auth-claims-supabase
npm run test:uat:photo-transport
npm run test:uat:photo-stage
```
Both tests use **Firebase Auth+Firestore demo emulators** and mock/no photo storage; they DO NOT upload to Supabase. `test:uat:photo-stage` additionally runs the existing real Chromium staged-photo / compression UI regression. Any failure blocks enabling the photo pilot.

Expected ONLY if operator confirms it:
```text
SUCCESS: 7 isolated photo browser-to-HTTP transport contracts passed (OFFLINE, NO photo upload)
SUCCESS: 10 isolated atomic photo/QC/Actual and trusted HTTP checks passed (MOCK photos, NO Supabase upload)
SUCCESS: 11 photo ledger contracts, 10 atomic photo and HTTP emulator checks, and TypeScript passed (MOCK storage only)
SUCCESS: 10 photo preflight + 10 compression contracts, TypeScript and 11 focused QC React browser checks passed (no photo upload)
```

## Unfinished release blockers
1. A **dedicated opt-in browser UAT test harness** must inject a trusted mock store, enable the photo feature flag and exercise real React upload → trusted HTTP → Firebase emulator atomic receipt and signed preview. The default portal remains disabled until that check passes.
2. Only AFTER the browser/emulator gate passes, separately authorize a synthetic-only live Supabase UAT full browser test with a server-side hidden secret, run-scoped paths, exact cleanup and error/timeout reconciliation. Note the current real private adapter requires run-scoped record IDs and cannot be switched on for arbitrary browser-generated IDs without an explicit trusted run handshake.
3. Photo corrections and orphan reconciliation remain fail-closed; no automatic deleting of unacknowledged Storage objects, no public bucket or URL, and no storage queue claims.
4. No change to production `form-qc-unm`, real customer photos, Hosting, legacy QC migration, Firestore Rules, Cloud Billing, Supabase RLS or production secrets.

## Verification status
The changes in this checkpoint were committed to the feature branch and checked for JavaScript parse errors. The new emulator/browser tests **have not been executed by the assistant**; the operator must run the commands above before proceeding.
