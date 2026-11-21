# 11D.5c.3b.2e.3 — Synthetic browser → trusted HTTP → real private Supabase UAT (candidate)

## Verified starting point, 21 November 2026

Operator Cloud Shell screenshots show **7/7** browser-to-HTTP photo transport contracts, TypeScript and **4/4** focused Chromium browser/mock-Storage + Firebase Auth/Firestore demo emulator checks PASSED (exit 0). Tests covered Spray main/HOLD, exact retry after lost HTTP response, Fertilizer main/scan with independent NK/DAP Actual, and browser/root/network isolation. These results do NOT prove live browser Supabase upload.

Read-only inventory confirmed `qc-form-uat` has bucket `qc-photos-uat`, **private**, 2 MiB/file, `image/jpeg`/`image/png`/`image/webp` allowed. The UAT Supabase project is separate from production. No public policies, Cloud Billing or real production Firebase changes.

## Candidate bridge — operator execution pending

- The dedicated `--browser-photo-real` mode starts **local Firebase demo Auth+Firestore emulators** but injects the preverified server-only real `createUnifiedPrivatePhotoStore` for **this one synthetic run**. The default `--browser` and `--browser-photo` mock modes remain unchanged.
- Server generates a cryptographically random 32-hex run ID. Only the dedicated Vite browser-test bundle receives the **nonsecret** synthetic run ID and uses it to prefix 6 random hex nonce characters. Thus browser QC IDs become `qc-v2-uat-<32hex>-<6hex>`; production/default UI keeps its old nonce. Only the trusted server holds the `qc-form-uat` `sb_secret_` key.
- The storage adapter checks private bucket ID, origin, MIME allowlist, file max size, actor UID, exact owned paths and immutable SHA-256 upload/readback. Its Auth/role/source/atomic ledger rules are inherited from the earlier verified service.
- Browser tests upload two tiny synthetic PNGs for Spray (main/HOLD), deliberately drop the server's HTTP reply and retry the **identical** request, then submit two tiny synthetic PNGs for Fertilizer (main/scan) with independent NK/DAP components. No real field QC or user photos are involved.
- Only AFTER all four browser assertions pass, `cleanupVerifiedBrowserPhotoRun` checks exactly four touched/owned paths, confirms two complete synthetic Firestore photo manifests and their immutable audits, matches every persisted reference to the exact current run, verifies exact folder listings, removes **only those four** via the Supabase Storage API, and verifies empty run directories.
- On failed/ambiguous run, **do not automatically delete** anything. The logged synthetic run ID identifies files requiring deliberate, owner-approved reconciliation before another live run. Never delete unknown or unacknowledged objects. No application data is modified outside demo emulators and the private UAT run's temporary photo objects.
- This is not a full hosted portal, signed photo viewer or correction protocol; separate gates are still required for those features. Production `form-qc-unm` and production forms remain unchanged.

## One explicit Cloud Shell command

```bash
cd ~/QC-Form-Web
git switch feature/firebase-auth-claims-supabase
git pull --ff-only origin feature/firebase-auth-claims-supabase
bash server/qc-photo-access/run-unified-photo-browser-real.sh
```

The runner first executes only the seven offline transport checks and TypeScript (no Supabase writes), then asks you to type `QC-UAT-BROWSER-REAL` and enter the **qc-form-uat** `sb_secret_` key in a hidden terminal prompt. Never paste the key, Firebase tokens, signed URLs or full object paths into chat, GitHub, screenshots or source. No secret key is used by browser Javascript.

Expected **only if** the operator successfully runs:

```text
SUCCESS: 7 isolated photo browser-to-HTTP transport contracts passed (OFFLINE, NO photo upload)
PASS: 4 exactly committed synthetic UAT photo objects removed; scoped run directories empty
SUCCESS: 4 isolated real private Supabase UAT photo browser + atomic QC/Actual checks and exact cleanup passed
Script exited successfully (code 0)
```

If any check fails, do not run a new live test blindly: inspect the synthetic run ID first for leftover Storage objects and avoid deletion without exact proof of ownership.

## Verification status
Source is committed on the feature branch, parser/static review and private bucket metadata checks complete. **Actual live browser execution and end-to-end cleanup are NOT yet verified**, so this is a candidate UAT gate, not a production-ready feature.
