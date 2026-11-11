# NEXT EXECUTION — QC Photo HTTPS backend (staging only)

## What is already proven
- Supabase private bucket `qc-photos-test` contains valid test photos, latest real read-only test successfully signed + downloaded 1,439,727 bytes in 60-second signed URL.
- Firebase auth, role-based checks, 42 Firestore emulator rules checks, eight integrated mock checks, and React/Vite build previously passed.
- Real cross-account HTTPS backend has **not** been deployed.
- No spreadsheet cutover, QC live uploads or production rules changes have occurred.

## Server source (current branch)
- `server/qc-photo-access/index.mjs`: actual Node HTTPS-backend application suitable for behind an HTTPS reverse proxy.
- `scripts/lib/qcPhotoSignHandler.mjs`: token verification and permission lookup, strict request/response headers.
- `scripts/lib/qcPhotoUidLimiter.mjs`: basic per-instance 30-requests/minute throttle by **verified Firebase UID**. This is secondary defense; host-layer DDoS/rate limit is still required.
- `server/qc-photo-access/Dockerfile`: separate source-only image definition, no secrets built into image.
- `src/qcPhotoSignedRead.ts`: browser feature flag defaults off; production QC unaffected.

## Prerequisites before deploying (blocking)
1. Decide on a supported trusted HTTPS backend host. Cloud Run usually needs a billing-enabled Google Cloud project and explicit cost review; do not enable billing automatically. A Cloud Shell dev port is not a secure production endpoint.
2. Create a **dedicated server identity** with only Firebase Authentication user-read and Firestore read permissions required for the QC authorizer; do not grant unnecessary project-wide permissions.
3. Store `SUPABASE_SECRET_KEY` **only** in a server secret manager, not in GitHub, browser VITE env, Cloud Shell command history, or a readable `.env` in a repository. Project URL is `https://mcfwnstdfhhtcbksgrlj.supabase.co`.
4. Set `PHOTO_ACCESS_ALLOWED_ORIGIN` to the exact HTTPS QC test frontend origin. Do not set `*`.
5. Only deploy the branch's server after a dependency lockfile and security review. Protect the HTTPS endpoint with host-layer request limits and secure logging; do not log Firebase ID tokens or private signed URLs.

## How to check updated code without deployment
```bash
cd ~/QC-Form-Web
git pull origin feature/firebase-auth-claims-supabase
node scripts/test-qc-photo-uid-limiter.mjs
node scripts/test-qc-photo-sign-handler.mjs
npm run build
```
These are **mock/local** checks; they do not prove live cross-user access.

## One final real test once staging HTTPS service exists
Use two Firebase test accounts. Keep bucket private. Create a nonoperational test QC record and photo metadata with valid `ownerUid`, `clientRevision`, object path and photoId. Use the client to call `POST /api/qc-photo/sign` with `Authorization: Bearer <Firebase ID token>` and JSON `{"recordId":"...","photoId":"..."}`.
- Account with `role_access/...permissions.qc_records = view`: must return a URL for the 60-second period and download image.
- Same account switched to `none`: new URL request returns 403 (an already issued URL remains usable until expiry).
- Inactive account returns 403; revoked/invalid token returns 401.
- Other roles with View/Edit can see all photos; read permission does not grant edit/upload.
- Confirm CORS allows only approved origin; metadata remains immutable and no signed URLs/tokens are retained in logs.

## Next product work after that proof
1. Enable upload+metadata queue for *new* Spraying and Fertilizer QC in testing. Keep Drive photos on existing 670 records.
2. Verify retry/offline/HOLD stable ID/revision/photo viewer and photo export.
3. Replace Apps Script / Spreadsheet calls with Firestore/backend and reconcile dashboard, QC corrections, plans, Excel export.
4. Deploy cutover only with backups, rollback, and manual signoff.

**Do not deploy emulator rules or switch on frontend upload flag in production yet.**
