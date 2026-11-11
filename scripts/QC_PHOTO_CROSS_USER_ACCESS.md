# QC Photos — cross-user access preview (NOT deployed)

## Goal and status
The existing Supabase private bucket `qc-photos-test` restricts direct file access primarily to the uploader's Firebase UID. A manager/admin/asisten granted Data QC view in Firestore may see a photo's metadata but cannot necessarily download the image directly. **Do not make the bucket public or copy a Supabase secret key into Vite.**

This branch now includes:
- `scripts/lib/qcPhotoReadAuthorization.mjs` — pure fail-closed authorization based on Firestore user profile, manually configurable `role_access/{role}.permissions.qc_records`, QC record and immutable photo metadata.
- `scripts/test-qc-photo-read-authorization.mjs` — 24 isolated role/path security checks.
- `scripts/lib/qcPhotoSignHandler.mjs` — dependency-injected HTTP POST handler for a future trusted server. Verifies Firebase ID tokens with revocation checks and reads current Firestore permissions on each request.
- `scripts/test-qc-photo-sign-handler.mjs` — 9 mock endpoint tests, including revoked tokens and role changes.
- `src/qcPhotoSignedRead.ts` — disabled-by-default browser client method. No UI action, no production integration, no keys added.

## Request flow
1. Authenticated React browser sends POST `{recordId, photoId}` with its Firebase ID token to a trusted private backend.
2. Server verifies ID token using Firebase Admin SDK with revocation check.
3. Server loads `users/{uid}`, `role_access/{role}`, `qc_records/{recordId}`, `qc_photo_metadata/{recordId}/photos/{photoId}`.
4. Authorizer denies inactive user, missing permissions, foreign mandor's QC, mismatched bucket, owner UID or object path.
5. ONLY after authorization, the trusted backend signs the Supabase object for **60 seconds** using a SERVER-ONLY Supabase credential. Browser gets only the short-lived URL.

Supabase supports server-created signed URLs for private Storage objects. They are temporary bearer URLs: a person possessing the URL can use it until expiry. Permission revocation does NOT revoke an already issued signed URL immediately. Keep TTL short; disable sensitive caching; never log or persist these URLs. For stricter immediate revocation, implement a server-side image proxy that reauthorizes each request.

## Manual role permissions
- Owner: full view consistent with current QC permissions (subject to profile being active).
- Manager, Admin, Asisten, Pengunjung: view allowed **only if** Owner configures `role_access/{role}.permissions.qc_records` to `view` or `edit`. Otherwise denied.
- Mandor Spraying/Fertilizer: same role permission, AND only their own QC and correct form type.
- A role change is enforced at the next server request without redeploying code.
- Important: production user profile, legacy QC records and historical photos may need a stable `ownerUid` mapping. No migration has yet run.

## Run pure tests safely in Cloud Shell
```bash
cd ~/QC-Form-Web
git pull origin feature/firebase-auth-claims-supabase
node scripts/test-qc-photo-read-authorization.mjs
node scripts/test-qc-photo-sign-handler.mjs
npm run build
```
No Supabase key, backend deployment, Firebase production read/write, or billing is needed for these mock tests. These tests are separate from the previously passed 39 Firestore Security Rules emulator checks.

## Deployment blockers (do not enable yet)
- Trusted hosting environment for the signing endpoint with proper Firebase Admin identity and a securely stored Supabase server credential. Never expose `sb_secret_` or service_role in browser env.
- Use the official `@supabase/supabase-js` server SDK `storage.from('qc-photos-test').createSignedUrl(path,60)` or vetted API equivalent.
- Rate limiting, logging without private URLs/tokens, reliable CORS origin policy, and abuse monitoring.
- End-to-end test against private bucket and real role permission changes without modifying operational QC.
- Exact policy match with current `role_access` and QC records; consider user-specific exceptions and active/suspended status.
- Production QC/Spreadsheet/Drive workflow remains unchanged. Browser helper is disabled unless `VITE_QC_PHOTO_SIGN_PREVIEW=true` AND a valid HTTPS `VITE_QC_PHOTO_SIGN_ENDPOINT` is supplied; do not set these until the trusted server is deployed and validated.

## Security tests are not production verification
The pure and mock tests do not verify JWTs against real Firebase, do not create Supabase signed URLs, and do not prove the backend is deployed. They only test the authorization logic and handler contract.
