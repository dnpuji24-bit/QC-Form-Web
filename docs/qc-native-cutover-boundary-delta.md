# Stage 19 — Native Firebase-only portal boundary (no deployment)

## Confirmed operator result entering this stage
The prior Cloud Shell screenshot reported **3/3 PASS** for preserving historical Google Drive main/scan/HOLD/downtime references and refusing to treat Drive URLs as new Supabase uploads. It correctly emitted `RELEASE_STATUS: BLOCKED`, because it was not a native portal browser/network test and legacy Apps Script login/QC routes still existed.

## New scoped code changes
- `src/api.ts`: in Firebase-native mode `getApiUrl()` returns an empty string without touching the stored legacy Apps Script endpoint; `setApiUrl()` now fails closed using the already-established legacy API policy. Generic `api()` already denied all legacy requests while the native portal flag was active; this enforcement remains unchanged.
- `src/App.tsx`: Settings under `VITE_QC_NATIVE_PORTAL=true` becomes an information-only Firebase Auth/Firestore view, with no legacy API URL input. The old Settings form remains available ONLY when the old portal is explicitly selected for separate rollback. Historic Google Drive photo URLs, report fallbacks and export code remain untouched.
- `src/main.tsx`: when the native portal flag is true, URL-parameter opt-ins cannot select the separate Firebase auth, registration, QC or Supabase photo-test pilot instead of `NativePortalSession`. This prevents a stale pilot build flag from bypassing the intended native entrypoint.
- No Firestore data, Auth records, historical photo URLs, bucket, Supabase function, Hosting, Cloud Billing, Firebase Rules or warehouse module was modified.

## One delta gate (operator Cloud Shell)
```bash
cd ~/QC-Form-Web
git switch feature/firebase-auth-claims-supabase
git pull --ff-only origin feature/firebase-auth-claims-supabase
npm run test:cutover:native-boundary
```

This executes **three small offline contract checks** for:
1. Firebase-native session marker and cutover flag requirements, without Apps Script QC transport.
2. Legacy endpoint getter/setter and Settings UI disabled in native mode while explicitly preserving old-mode rollback capability.
3. Native entrypoint cannot be bypassed by URL pilot switches; historical Drive report fallbacks remain.

A TypeScript typecheck follows in the same command. It is not a complete browser or network acceptance test and must **not** claim to certify production egress; the expected final status is intentionally `RELEASE_STATUS: BLOCKED`.

**Expected if the operator command succeeds:**
```text
PASS: Firebase-only login rejects old tokens and incomplete cutover flags
PASS: native Settings never reads or changes the legacy Apps Script URL
PASS: native entrypoint and historical Drive report remain separate from legacy auth
SUCCESS: 3 Firebase-only boundary delta contracts passed (OFFLINE, NO writes)
RELEASE_STATUS: BLOCKED — native backend parity and deployed-browser egress still require verification
```

## Next release gates (not completed here)
- The actual hosted React native portal must be tested in a controlled non-production preview with a real approved Firebase identity and Network inspection proving zero Apps Script calls for login/QC/Plan/administration; all scope-specific trusted backend routes must be configured and ready without Google Cloud Billing.
- Independently reconcile existing browser queues, full QC/Actual/audit behavior and Excel/report parity on real permission combinations without reimporting existing Firestore records.
- Only then prepare a snapshot, rollback strategy and explicit deployment approval.
- **Historical Google Drive photos are excluded from migration entirely**: remain where they are. Material warehouse IN/OUT remains deferred.

Status: code committed to feature branch; static source inspection performed; full operator Cloud Shell gate is pending.
