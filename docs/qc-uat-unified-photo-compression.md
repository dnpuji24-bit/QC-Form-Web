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

## 21 November 2026 browser regression correction (operator test pending)
The operator reported that the `photo-compress` gate's existing Spray photo browser scenario timed out waiting for a staged item after selection. The original sample embedded in that browser test had an invalid PNG `IDAT` CRC; the earlier header-only stage had accepted it, but the new browser image decoder rightfully rejected it. The image generation/compression feature must **not** be weakened to pass broken pixels.

Code fix: replace the sample in both Spray and Fertilizer browser steps and all photo contract fixtures with a new valid PNG carrying CRC-correct IHDR, IDAT, and IEND chunks. The existing browser test now explicitly selects the former corrupted sample and expects `PHOTO_DECODE_FAILED` with zero QC records written. A new failure diagnostic reports the real form status immediately if a valid image fails staging. Separately, the rare browser Image fallback decodes validated bytes using a `data:image/...;base64,` URL instead of `blob:`: this preserves the portal's restrictive `img-src data:` Content-Security-Policy and never requires remote requests. The default `createImageBitmap` path is unchanged.

The previously completed 15/15 trusted-stage mock contract remains confirmed in Cloud Shell; the full compression browser gate must be re-run for this corrected commit. Test exactly:

```bash
cd ~/QC-Form-Web
git pull --ff-only origin feature/firebase-auth-claims-supabase
npm run test:uat:photo-compress
```

This is test-fixture and decoder-CSP compatibility repair only. The original UAT compression limits, SHA-256-after-compression behavior, write protection while photos are staged, and production isolation remain unchanged.

## 21 Nov 2026 follow-up: decoder tolerance and deterministic PNG CRC validation
The next operator Cloud Shell log confirmed all offline checks and TypeScript passed, as did the first six browser QC cases. Failure shifted to the previously-added negative PNG test at `scripts/test-qc-uat-unified-full-qc-ui.mjs:292`: it waited for `PHOTO_DECODE_FAILED` after submitting the former corrupt-IDAT fixture. The old PNG has objectively invalid IDAT CRC (stored hexadecimal `3dc09a00`, computed `e60cffab`), but Chromium may still decode it. Therefore the prior assumption that browser decode always rejects CRC corruption was incorrect. This error does not establish a failure in operational QC or large-photo compression.

Fixed with explicit PNG structural and every-chunk CRC32 validation in `src/qcUatUnifiedPhotoPreflight.mjs`, strict IHDR-first / IDAT-present / terminal IEND, bounded image dimensions, chunk lengths and count. This produces a deterministic `PHOTO_SIGNATURE_INVALID` before image decode. The same signature helper is used by `validateUatOriginalPhoto()`, `stageUatPhoto()`, and the trusted staging service so damaged CRCs cannot be uploaded. The browser negative test now requires that code, plus zero staged items. Two existing offline tests were extended, not counted as new tests, to reject corrupt PNG CRC and IHDR tampering without any upload or QC write.

Rerun `npm run test:uat:photo-compress` on this commit. Runtime confirmation is pending. No live Supabase, production, browser scanner, or original QC service changed.

## 21 Nov 2026 — Preserve JPEG, PNG and WebP formats in the isolated UAT encoder
All three image MIME types were already accepted as inputs, but previously re-encoded to JPEG when larger than the preflight target. The operator requested equivalent **compression for JPEG, PNG and WebP with unchanged resulting format**. The browser encoder now selects JPEG → JPEG (.jpg, white composite), PNG → PNG (.png, lossless, alpha preserved), WebP → WebP (.webp, quality stepped, alpha preserved). PNG may be progressively resized 1280/1120/960/800/640/480px to satisfy the preferred 800 KiB output; if its pixels remain larger than the **hard 2 MiB stage limit**, reject instead of transcoding. If browser `canvas.toBlob` silently returns a different type or lacks WebP support, reject `PHOTO_ENCODING_UNAVAILABLE` instead of falsely changing the upload format. Already-small originals are reused byte-for-byte. 6 MB input, 32 MP decode safeguard, per-slot hash after encoding and zero UAT writes while photo is only staged are unchanged.

Offline contract assertions cover all three output policies, and the focused real-browser suite adds a case for both transparent PNG and WebP compression, exact MIME in staged preview, alpha, maximum dimensions and no premature QC/Actual write. The focused suite now has **11 cases**. This change only affects local UAT code in GitHub; no Supabase project, bucket or production change was made and no photo was uploaded. The user's running prior `npm run test:uat:photo-compress` is valid for validating the previous commit; after pulling this commit, run the same command to validate all three formats.
