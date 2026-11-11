# QC Photo Access — all users with Data QC View/Edit

## Approved policy
The Owner can configure **Data QC** access manually. Any **active** user with `role_access/{role}.permissions.qc_records` equal to `view` or `edit` can view **all** QC images (Spraying, Fertilizer, HOLD, Scan Report), including images uploaded by other Mandor or Asisten. `none` and inactive users are denied. Owner retains full read access consistent with the current UI. This policy concerns **photo viewing only**: uploading a new photo/metadata remains limited to the owner of the original QC record and an Edit permission for the corresponding input form. A Pengunjung given Data QC View may view photos; this is deliberate.

## Current implementation on development branch
- `scripts/firestore.photo-emulator.rules`: emulator-only photo metadata reads now use Data QC View/Edit, with no own-record restriction. Create checks still enforce ownership and relevant Input Spraying/Fertilizer Edit permission.
- `scripts/lib/qcPhotoReadAuthorization.mjs`: independent server authorizer checks live user/role_access/record/photo metadata with no uploader role restriction for reading.
- `scripts/lib/qcPhotoSignHandler.mjs`: HTTP handler requiring a verified Firebase ID token with revocation check, current permission lookup, then issuing a 60-second URL. Inputs are **only** QC record ID and photo ID; object path cannot be supplied by caller.
- `server/qc-photo-access/index.mjs`: real server implementation using Firebase Admin SDK and `@supabase/supabase-js`. The server secret is read from `SUPABASE_SECRET_KEY` only on the server.
- `server/qc-photo-access/Dockerfile`: separate server container skeleton. **NOT deployed.**
- `src/qcPhotoSignedRead.ts`: disabled-by-default frontend client helper. It must not be enabled until live server security, hosted origin and permissions are tested.

## How the server reads
1. Browser sends Firebase ID Token and `{recordId,photoId}` to `POST /api/qc-photo/sign`.
2. Server verifies token using Firebase Admin Auth with revocation check, then loads `users/{uid}`, `role_access/{role}`, `qc_records/{recordId}` and `qc_photo_metadata/{recordId}/photos/{photoId}`.
3. Authorization requires active user, valid Data QC permission, matching metadata owner UID with record and strict immutable Supabase path.
4. Server uses a **server-only** Supabase secret to create a private URL valid for 60 seconds; browser receives only this short-lived URL.

The same temporary URL can be reused by anyone who possesses it until expiry; immediate revocation requires a reauthorizing image proxy, not signed URLs.

## Local regression tests (no secrets, no live data)
Run in Cloud Shell:
```bash
cd ~/QC-Form-Web
git pull origin feature/firebase-auth-claims-supabase
node scripts/test-qc-photo-read-authorization.mjs
node scripts/test-qc-photo-sign-handler.mjs
bash scripts/run-photo-rules-emulator.sh
npm run build
```

Expected counts: 24 pure authorizer tests, 9 mock handler tests, and **42 emulator Security Rules tests**. These targets are *not yet verified for the updated policy*.

The permission emulator tests include other Mandor viewing somebody else's photo with Data QC View, Pengunjung granted View, permission revocation, owner full read, and uploader-only create.

## Safety and deployment prerequisites
- Current production Firestore `qc_records` schema and `users` / `role_access` permission-key naming must be audited before deploying: this preview expects `ownerUid`, `clientRevision`, `qc_records`, `qc_spraying`, `qc_fertilizer`, and `role_access/{role}.permissions.qc_records`. Legacy data may not contain these exact fields. Adapt through a reviewed migration rather than weakening authorization.
- Do not deploy the emulator rules to production. Existing `firestore.rules` and all live user permissions are unchanged.
- The server package is a source-only deploy skeleton. Generate and commit a dependency lockfile, review/package-audit dependencies, test actual identity and token revocation, implement rate limits, request tracing without tokens/URLs, App Check / abuse controls, secret-manager injection, dedicated restricted server identity and live RLS negative tests before deploying.
- Do not expose `SUPABASE_SECRET_KEY` / `service_role` to Vite or GitHub. Obtain it directly from the secret manager during deployment, not by pasting it into chat.
- Validate a real photo's cross-user read with two test accounts, one with View, one with None, plus permission changes. These tests require an explicitly approved server deployment. No such deployment has occurred.
- After live security verification, add read-only photo display in QC reports with historical Google Drive fallback; only later enable actual QC photo uploads and Firestore-only save.
