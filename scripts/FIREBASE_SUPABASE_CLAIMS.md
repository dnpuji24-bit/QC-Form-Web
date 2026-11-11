# Firebase Auth → Supabase Storage: single-user claim setup

This folder contains a **deliberately single-user, dry-run-by-default** script for adding the Firebase Authentication custom claim `role: "authenticated"` required by Supabase's Firebase Third-Party Auth integration.

## Safety boundaries
- Project is pinned to **`form-qc-unm`**. No automatic bulk-account changes.
- **Without `--apply`, script only reads Auth user claims.** It does not write Firestore, Supabase, GitHub settings, or Drive.
- `--apply` also requires `CONFIRM_FIREBASE_CLAIM_WRITE=form-qc-unm`.
- Preserves *all existing custom claims*. If there is an existing `role` custom claim other than `authenticated`, it aborts. Resolve the conflict manually before proceeding.
- The Supabase claim is unrelated to the application's `users/{uid}.role` in Firestore (owner/admin/mandor).
- Do **not** put a Firebase ID token, service-account JSON, or Supabase secret/service-role key in GitHub or the frontend.

## Prerequisites
1. An administrator with permission to manage Firebase Authentication users for `form-qc-unm`.
2. Node.js and Google Application Default Credentials (ADC) available on a **trusted local machine**. Example: `gcloud auth application-default login`, after confirming the correct Google account. Never commit credential files.
3. From the repo root: `npm install --no-save firebase-admin` (temporary local install; this utility is not part of the frontend bundle).
4. Select **one controlled test Firebase UID** from Authentication → Users. Do not use a production mandor as the first test.
5. Existing Supabase private bucket `qc-photos-test` and Firebase Third-Party Auth integration can remain in place.

## Windows PowerShell
Dry run:
```powershell
node scripts/set-supabase-firebase-claim.mjs --uid "TEST_FIREBASE_UID"
```

After reviewing the dry-run output, apply to **one account**:
```powershell
$env:CONFIRM_FIREBASE_CLAIM_WRITE="form-qc-unm"
node scripts/set-supabase-firebase-claim.mjs --uid "TEST_FIREBASE_UID" --apply
Remove-Item Env:CONFIRM_FIREBASE_CLAIM_WRITE
```

The user must sign in again or refresh their Firebase ID token (`getIdToken(true)`) for the new claim to appear in requests to Supabase.

## Next integration phase (NOT implemented by this script)
- Configure the React Supabase client with the **publishable** key and `accessToken: () => firebaseAuth.currentUser?.getIdToken() ?? null`.
- Upload only to `qc-photos-test/<firebase-uid>/<unique-photo-id>.jpg`; the installed Supabase Storage RLS policies restrict reads/uploads to the Firebase UID's folder.
- Link bucket/object path/photo type/QC record ID into Firestore; keep the legacy Google Drive photos viewable.
- Test successful upload, private download, failure for a different UID, failure without authentication, and offline retry. Implement team/manager cross-user access policies separately after design review.

Official documentation: https://supabase.com/docs/guides/auth/third-party/firebase-auth
