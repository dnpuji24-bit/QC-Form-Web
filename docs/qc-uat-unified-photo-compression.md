# 11D.5c.3a.2 — Automatic camera-photo compression before photo preflight (UAT-only)

## Previously verified
The operator's Cloud Shell screenshot on 21 November 2026 confirmed 15/15 trusted photo-stage mock-storage tests and TypeScript passed, code 0. Earlier 10/10 photo preflight + 9/9 real React browser tests had already passed. Neither Supabase live upload nor photo-inclusive QC saving has been deployed.

## New work on the isolated unified UAT portal (operator test pending)
- `src/qcUatPhotoCompression.mjs`: safely checks original JPEG/PNG/WebP magic header, canonical byte count, filename and **original <=6,000,000 bytes** before Canvas allocation. Attempts browser `createImageBitmap`, falling back to `Image` + temporary Object URL. Invalid or undecodable source fails closed. No remote request, localStorage, IndexedDB or Firebase call.
- Orientation-aware browser decode (subject to browser implementation), canvas max long side **1280 px**, white background for transparency, JPEG quality starts at **0.70** and reduces to **0.46** if needed. Further canvas sizes **1120** and **960** are attempted only when target cannot be reached. Aim for **800 KiB**, enforce **2 MiB** final limit. Original whose longest side is <=1280 px and file is already <=800 KiB is reused unchanged; if encoding makes an image larger, preserve the smaller original only if it is <=2 MiB and already within resolution.
- Protect against huge decompressed image allocations by rejecting >32 megapixels. Reject spoofed file extensions/MIME and damaged bytes before compression. Re-validate resulting JPEG bytes and size with the same shared preflight signature check. Preserve legible small PNG/WEBP scans rather than lossy re-encode.
- `src/UatUnifiedFullOperationalForm.jsx`: both Spray and Fertilizer main/HOLD photos plus Fertilizer's document image slot go through `compressUatPhoto` **before** `stageUatPhoto` computes SHA-256 and the per-slot deterministic manifest. UI shows original size and staged size, and visually labels compressed vs unchanged. Existing stale hold/source cleanup, permissions, and the disable-save-while-unuploaded safeguard remain unchanged. Status continues to say **0 uploaded**.
- `scripts/test-qc-uat-photo-compression-contract.mjs`: 10 quick offline cases covering geometry, policy thresholds, oversize rejection before byte read, signature spoofing, invalid image dimensions and invalid names.
- `scripts/test-qc-uat-unified-full-qc-ui.mjs`: one additional **real browser case** generating a synthetic high-resolution JPEG over 2 MiB: asserts automatic output <=800 KiB, dimensions <=1280 px, JPEG header in rendered preview, original and output sizes displayed, no QC/Actual write while photo is staged. Previous nine React checks retained. Browser allowlist updated in BOTH full and portal source guards.
- The existing `npm run test:uat:photo-stage` gate remains compatible, and the full release-gate estimate increases from 139 to 140 emulator/browser cases. A dedicated `test:uat:photo-compress` command is provided.

## Short Cloud Shell test — do not use production
```bash
cd ~/QC-Form-Web
git pull --ff-only origin feature/firebase-auth-claims-supabase
npm run test:uat:photo-compress
```
Expected if operator verifies:
```text
SUCCESS: 10 UAT photo compression policy and original-byte contract checks passed (offline)
SUCCESS: 10 focused full QC React browser -> trusted Planning HTTP -> actual/audit emulator checks passed
SUCCESS: 10 compression contracts, TypeScript and 10 focused browser QC cases passed (compression before SHA256, no upload)
```
This short regression also includes already-known photo manifest/source guards and TypeScript.

## Boundaries / next
- No change to `src/SprayForm.tsx` or `src/FertilizerForm.tsx` in production. Those retain their existing independent 1400px / JPEG quality 0.72 compression.
- No Supabase upload yet, no Server-side photo-inclusive commit, no signed private image reader, no offline queue persistence, no live hosting; the UAT React editor still **blocks QC saving when an image is staged**.
- `11D.5c.3b.2` remains the pending trusted UAT private-storage + atomic QC/Actual/photo receipt integration with new unified Auth boundary, based on the existing isolated verifier once this compression gate passes.
