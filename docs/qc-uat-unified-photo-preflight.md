# 11D.5c.3a — QC photo preflight and loss-prevention gate (isolated unified React UAT)

## Operator baseline — 2026-11-21
Cloud Shell screenshot confirms **7/7** real React full Spray/Fertilizer source/carry-over browser cases passed, including idempotent retry, actual mandor Shift 2 and form-specific material/area attribution. Quick checks (10 carry-over contract checks and TypeScript) passed. Project remains demo-only and hosted UAT remains OFF.

## What is implemented now (Cloud Shell run pending)
- Reuse `src/qcOperationalPhotoManifest.mjs` to calculate deterministic SHA-256 photo identity by slot and bytes. New `src/qcUatUnifiedPhotoPreflight.mjs` accepts main/HOLD for both forms, **scan only for Fertilizer**. Synthetic UID/record guard, explicit hold id, size 1–2,097,152 bytes, only image/jpeg, image/png, image/webp, MIME header sanity, safe filename, actual byte count; rejects spoofed MIME and invalid image header. This is a *preflight header check*, not a full decoder, malware scan or server trust.
- `src/UatUnifiedFullOperationalForm.jsx` now stages a single attachment per slot in **React memory only**, shows local preview plus short SHA256, provides local remove, and **disables BOTH draft and ready saves whenever any photo is staged**. It is impossible to silently commit the photo-free QC while telling the user their photo was saved. Only after removing staged attachments can the existing verified photo-free commit run.
- Main slot is available to Spray and Fertilizer; Fertilizer adds scanner slot; each current HOLD row has its explicit source ID. Changing original Daily source, actual shift/mandor or HOLD membership clears relevant staged references; changing authenticated user unmounts the editor. UI displays **0 uploaded** visibly. It does not write photo bytes to QC, Actual, audit, Firestore, IndexedDB, session/local storage or Supabase, and it does not insert public URLs.
- `scripts/test-qc-uat-unified-photo-preflight.mjs`: **10 offline cases** for SHA ID, slot constraints, content types and signatures, size, invalid ID/file, HOLD mapping and no silent substitution.
- Existing isolated full QC Chromium suite extended from 7 to **9 real browser cases**: staging PNG main preview and save blockers, removal and restored photo-free availability, fake JPEG rejection, Fertilizer scanner and HOLD separation, clearing obsolete hold/source, root and storage isolation. Existing 7 functional full QC tests retained.
- `npm run test:uat:photo-stage` is **one targeted command**: Quick (contracts/guards/TypeScript) plus only the 9 browser cases. The full release gate baseline moves from 137 to **139**, unrelated tests not run during short cycle.

## One Cloud Shell command
```bash
cd ~/QC-Form-Web
git pull --ff-only origin feature/firebase-auth-claims-supabase
npm run test:uat:photo-stage
```
Expected after operator actually verifies:
```text
SUCCESS: 10 isolated UAT photo preflight/manifest contract checks passed (no network)
SUCCESS: 9 focused full QC React browser -> trusted Planning HTTP -> actual/audit emulator checks passed
SUCCESS: 10 photo preflight contracts, TypeScript and 9 focused QC React browser checks passed (no photo upload)
```

## Intentionally NOT complete
This is **not** photo upload, not signed Supabase storage, not offline photo queue, not scan OCR, not production QC form migration, and not photo-inclusive QC saving. No real customer/production data was used. The photo reference from the candidate manifest is solely for local preflight; it is never considered an uploaded receipt. A user who has staged photos must remove them to make a **photo-free** QC save, which is explicitly communicated. The user should not use this for actual field photo records. The existing standalone mock-photo Spray/Fertilizer services have their own emulator tests but are **not yet wired** to the unified HTTP or browser editor; their trusted storage, object cleanup, receipt, role revocation, duplicate retries and complete DTO parity require a separate integration gate. No deployments or modifications to production, Supabase, rules, roles or hosted UAT.

## Next
11D.5c.3b: separate private photo upload/verification path and atomic photo-inclusive QC receipt via trusted service. Bind prepared manifest to a durable, idempotent, per-account operation and verify exact uploaded bytes before `uploaded` status, with orphan handling and safe rollback. Only after that integrate the existing isolated IndexedDB queue with explicit photo retry and account-bound recovery; keep new features UAT-only and test each with focused emulator/browser cases.
