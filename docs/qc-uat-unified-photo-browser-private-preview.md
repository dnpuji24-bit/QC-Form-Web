# 11D.5c.3b.2e.4 — Private signed photo preview + JPEG/PNG/WebP delta gate

## Verified baseline, no rerun required
The operator's 21 Nov 2026 Cloud Shell record for the previous 11D.5c.3b.2e.3 pilot (run `657f303f5a721e6ce4bb923b4e5b187a`) shows 7 transport contracts, TypeScript, 4 browser tests, Supabase UAT private Storage real bytes, exactly 4 acknowledged synthetic objects removed, exit 0. Prior tests of compression and server-side private signer also passed separately.

## New work
- New `photoSign` POST endpoint exists only when **both** an explicitly injected real UAT `photoStore` and trusted server `photoSigner` are present in `createUnifiedPlanningHttp`; otherwise it returns 404. The existing service re-verifies the Firebase emulator ID token, current role permissions, QC record and immutable full/QC/photo audit before issuing a Supabase **60-second** bearer URL. Browser supplies only exact `recordId` and `photoId`; never a bucket/path/URL/secret. No production endpoint.
- The isolated UAT React editor displays buttons to preview photos **only after an atomic committed photo receipt** and only when the dedicated real-browser Vite flag is enabled. It remembers slot/photo identity, requests a fresh signed URL, validates its fixed UAT origin/content type and renders with `referrerPolicy=no-referrer`. It clears preview on source change, permission refusal or component remount. URLs are not stored in localStorage or sessionStorage.
- The browser shell CSP enables **only** the fixed Supabase UAT origin for images in the explicitly opted-in real test; default UAT remains `img-src data:` and the preview/photo commit features remain off. The real Playwright gate checks only signed GET image paths for the current synthetic run.
- The previous four-photo browser gate now uses **PNG Spray main, JPEG Spray HOLD, WebP Fertilizer main, PNG Fertilizer scan**, generated synthetically. All three formats are verified in the **same** run; no three separate live upload tests.
- Two new in-browser checks: verified private signed previews load real 2×2 image bytes; revoking QC permissions denies a **new** URL on the same Firebase token. It does **not** revoke an already issued URL immediately; URLs can remain usable until the 60-second expiry.
- Cleanup retains fail-closed conditions, but accepts exactly the four acknowledged/committed `.png`, `.jpg`, `.webp` paths matching this run's manifest, audit and directory contents. Failed/ambiguous runs retain all objects for manual review. No RLS, public bucket, Hosting, Cloud Billing, production Firebase or production Supabase modifications.

## Concise operator test — ONE command
```bash
cd ~/QC-Form-Web
git switch feature/firebase-auth-claims-supabase
git pull --ff-only origin feature/firebase-auth-claims-supabase
bash server/qc-photo-access/run-unified-photo-browser-real.sh
```

This compact gate runs syntax of the changed server modules, TypeScript, and a **single six-case** live browser scenario (4 baseline essentials + 2 new preview/role cases). It intentionally **does not repeat** the previous 7 transport, 10 compression, 11 ledger, 15 standalone signer or 17 role-contract tests.

The script requests the explicit `QC-UAT-BROWSER-PREVIEW` consent and a **hidden** `qc-form-uat` `sb_secret_` via terminal. Do not paste that secret or signed URLs into a chat, screenshot, GitHub or logs. Auth+Firestore remain demo emulators; only four temporary synthetic Storage objects are written in the private `qc-photos-uat` bucket.

Expected if and only if the new gate succeeds:
```text
PASS: private 60-second signed previews load PNG/JPEG/WebP committed bytes
PASS: same Firebase token denied a NEW signed preview after QC role revocation
PASS: 4 exactly committed synthetic UAT photo objects removed; scoped run directories empty
SUCCESS: 6 isolated real private Supabase UAT photo browser, signed preview, role revocation and scoped cleanup checks passed
Script exited successfully (code 0)
```

## Status and next release blockers
Committed candidate source and static inspection only; **the user has not yet executed this revised live preview gate**. Do not claim pass until the Cloud Shell log confirms it.

Outstanding before actual operational release: robust failed/ambiguous Storage reconciliation, immutable versioned photo corrections, separate authorization/revocation tests across two browser accounts, hosted-portal hardening, operational UAT and production cutover review. Existing production `form-qc-unm` remains untouched. 
