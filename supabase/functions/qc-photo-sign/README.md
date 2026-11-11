# QC private photo — Supabase Edge Function (development branch)

## Objective and current state
The Edge Function source is at `supabase/functions/qc-photo-sign/index.ts`. The existing Node server remains as an alternative, but **Firebase remains the only login system**, Firestore remains the database, and the Supabase bucket `qc-photos-test` remains **private**.

**NOT DEPLOYED.** This repository change alone has no effect on production and does not turn on the photo preview flag. The user chose to avoid enabling billing for Firebase project `form-qc-unm` (Cloud Run not enabled).

The user explicitly requires:
- All **active** Firestore users with Data QC `view` or `edit` permissions can read **all QC photos**, regardless of uploader; Owner remains full-view.
- `none` denies viewing; upload and editing permissions remain independent.
- Old QC Google Drive photos remain available as historical data, without bulk backfill.
- Continue toward Firestore-only operations and retire Spreadsheet only after full regression checks.

## Why `verify_jwt = false` is required here
The client sends a **Firebase ID token**, not a Supabase Auth JWT. The Supabase gateway JWT check would reject it. Our in-function verification checks Google's Firebase Secure Token public JWKS signature, RS256, issuer and audience; Firebase Auth `accounts:lookup` verifies user existence/disabled state/revocation cutoff; then Firestore `users/{uid}` and `role_access/{role}` are queried server-side **on each request**. Strict ID/path, record/photo matching, CORS and 60-second signed URL apply.

This is **not a publicly authorized endpoint** even with the gateway's JWT precheck off. Do not remove the in-function authentication chain.

## Required secrets/configuration before any test deployment
1. `PHOTO_ACCESS_ALLOWED_ORIGIN`: exact HTTPS origin of the **testing web UI** (not `*`). Configure via Supabase Dashboard → Edge Functions → Secrets.
2. `GOOGLE_SERVICE_ACCOUNT_JSON`: restricted Google service-account JSON for project `form-qc-unm` with Firebase Auth user lookup and Firestore document read privileges. The private key must exist **only** as a secure server secret. Do not paste to ChatGPT, GitHub, Vite env files, screenshots or application logs. Prefer short-lived federated credentials when available; a static service-account key is a sensitive credential that must be protected and rotated. Audit minimum IAM permissions before issuing any new key.
3. `SUPABASE_SECRET_KEYS`: populated automatically by hosted Supabase; function reads the default secret key (fallback `SUPABASE_SECRET_KEY` when supplied locally). **Supabase reserves the `SUPABASE_` prefix**, so do not try to add a custom secret with that prefix. Never add a service-role key to React.
4. Deploy only if `PHOTO_ACCESS_ALLOWED_ORIGIN` and identity are configured. This project is currently the Supabase **production instance**; even a new function is remotely reachable on deployment. No deploy has been performed automatically.

## Local source gate (no secrets or database access)
```bash
cd ~/QC-Form-Web
git pull origin feature/firebase-auth-claims-supabase
node scripts/test-qc-photo-edge-source.mjs
npm run build
```
Expected: **10 static release-gate checks passed** and build succeeds. These are source-level checks, **not Edge runtime, actual Firebase Authentication or real user end-to-end tests**. Confirm with `deno check supabase/functions/qc-photo-sign/index.ts` in an environment with Deno and internet before deploying.

## When credentials and staging origin are ready
Review the current Supabase CLI documentation/flags (`supabase functions deploy --help`). Deploy **only this new function** with the project ref `mcfwnstdfhhtcbksgrlj` and its config (`verify_jwt=false`). There are currently no other Edge Functions in this project. Use the Supabase Dashboard to manage secrets, not shell history.

Once it is deployed, configure the **testing** frontend only:
```text
VITE_QC_PHOTO_SIGN_PREVIEW=true
VITE_QC_PHOTO_SIGN_ENDPOINT=https://mcfwnstdfhhtcbksgrlj.supabase.co/functions/v1/qc-photo-sign
```
Do not enable the production frontend flag until verified.

### Cross-account proof
A new *test* QC with valid Firebase `ownerUid`/revision and photo metadata must be used:
1. Role with Data QC `view` obtains signed URL for another uploader's photo; actual photo download succeeds.
2. Role `none` returns HTTP 403.
3. Changing role from view to none blocks **new** requests; previously issued URLs remain usable for up to 60 seconds.
4. Disabled user, revoked Firebase tokens and invalid origins all denied.
5. No credentials, signed URLs, UID or storage object paths exposed in logs.
6. Test upload and photo preview for main/HOLD/scan, including offline retry and Excel/report export. Recheck `qc_photo_metadata` Firestore Rules before permitting real QC writes.

## Limitations requiring a release decision
- Rate limiting is per Edge isolate (up to 30 req/min/UID/instance), not globally distributed. Add gateway/shared abuse limiting for public internet deployments.
- Firebase Auth lookup and Firestore REST calls depend on a privileged Google OAuth service-account credential. These network calls and IAM permissions **have not yet been exercised in Edge runtime**.
- Do not claim this is deployed/verified until live logs and two actual account outcomes are reviewed.
- Migrating *all* Apps Script modules to Firestore, including Dashboard, Plan, QC, Export Excel and correction workflows, remains an independent cutover step; do not disable Spreadsheet prematurely.

References:
- https://supabase.com/docs/guides/functions/auth-headers
- https://supabase.com/docs/guides/functions/function-configuration
- https://supabase.com/docs/guides/functions/secrets
