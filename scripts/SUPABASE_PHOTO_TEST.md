# Preview-only Supabase photo upload test

This is an isolated test of Firebase Authentication → Supabase private Storage. It **does not** replace the existing QC/Apps Script/Drive upload workflow or write any QC data. No Firebase admin private key is required in the frontend.

## Before testing
- Firebase Auth account used for test must have `role: "authenticated"` in its refreshed ID token. The one-user admin setup script is in `scripts/set-supabase-firebase-claim.mjs`.
- In Supabase, Firebase Third-Party Auth is enabled for `form-qc-unm`.
- Private Storage bucket `qc-photos-test` exists, with RLS allowing `INSERT` and `SELECT` only under `<Firebase UID>/...`.
- Obtain the **publishable** key from Supabase Dashboard → Project Settings → API Keys. Do not use a secret or service-role key.

## Running the preview locally / in a test build
Configure local, uncommitted `.env.local` (not production):
```dotenv
VITE_ENABLE_SUPABASE_PHOTO_TEST=true
VITE_SUPABASE_URL=https://mcfwnstdfhhtcbksgrlj.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SB_PUBLISHABLE_KEY
```
Run `npm install` and `npm run dev`. Open the app under its Vite base, with `?supabase-photo-test=1` appended. For example, `http://localhost:5173/react/?supabase-photo-test=1`. The page only appears when the environment flag is enabled; otherwise the normal app loads.

Sign in to the normal QC app **on the same origin and browser profile**, then visit the preview test page. Reload or sign in again after custom claims are updated. Select a small JPEG/PNG/WebP file (1 byte – 2 MB). The test:
1. Calls `getIdTokenResult(true)` and verifies the refreshed claim `role === "authenticated"`.
2. POSTs to the private Storage bucket using the Firebase JWT in the Authorization header and a Supabase publishable key.
3. Uses an object path `<firebase-uid>/tests/<uuid>.<ext>` with `x-upsert: false` to avoid overwriting.
4. Authenticated-GETs the same file and renders a local, temporary preview.
5. Reports the object path and any errors, without exposing tokens.

The preview test creates a new object with every upload. It deliberately does not delete objects, write metadata to Firestore, or modify the existing Drive workflow. Clean up test photos later from Supabase Dashboard if needed.

## Security / acceptance checklist
- [ ] Account with correct Firebase token uploads successfully
- [ ] Same user can read the uploaded object
- [ ] Unauthenticated requests are denied
- [ ] A different UID cannot read or upload to the first user's folder
- [ ] Wrong mime type and files above 2 MB are rejected
- [ ] The test is absent from the production build unless explicitly enabled
- [ ] No secret/service-role key appears in frontend env or git

**Important:** The current test bucket RLS protects by Firebase UID, not by QC operational role, active account status, paddock, or assignment. Before rolling out QC photo uploads, design server-verified authorization or a robust policy mirroring QC permissions; do not treat this test as production-ready.

This test doesn't provide a new login screen; it uses the existing Firebase Auth browser session. Do not point experimental frontend actions at production Firestore records.
