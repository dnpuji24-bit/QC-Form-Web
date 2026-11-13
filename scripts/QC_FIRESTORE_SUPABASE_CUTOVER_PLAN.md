# QC-Form-Web — Rencana Penyelesaian Final (bukan siklus audit berulang)

## Keputusan tetap
- Firebase Authentication tetap dipakai.
- Firestore `form-qc-unm` menjadi database **utama semua modul** setelah cutover.
- Supabase Storage private menyimpan foto baru (utama, HOLD, Scan Report).
- Google Drive menjadi **read-only legacy fallback** untuk foto QC lama; jangan memindahkan atau menghapusnya pada tahap migrasi QC.
- Spreadsheet dan Apps Script tidak lagi dipakai untuk penyimpanan record setelah cutover terverifikasi.
- Role `role_access` manual: pengguna aktif dengan Data QC **view** atau **edit** dapat melihat **semua foto**. Izin upload/edit form tetap terpisah.
- Dashboard, laporan, koreksi, Export Excel, daily plan/actual plan, dan history harus tetap jalan.

## Status sebenarnya (11 November 2026)
**Sudah lulus:** Supabase upload/read pribadi dengan akun Firebase, antrean online, metadata emulator 10/10, Firestore Rules emulator 42/42, authorizer 24/24, mock endpoint 9/9, test klasifikasi 11/11; audit Firestore read-only. **Belum lulus:** akses lintas akun di server sesungguhnya, metadata referensi hidup pada QC, offline end-to-end, migrasi Apps Script penuh, regresi Excel/dashboard.

Data awal: 670 record; 662 cocok unik username dengan Firebase Auth; 8 tidak cocok; 18 tidak punya revisi; 256 memiliki referensi Drive; 143 memiliki HOLD. **Tidak perlu backfill ownerUid pada record lama hanya untuk memakai Supabase pada foto baru.** Record lama tetap dapat ditampilkan dengan URL Drive existing, sementara metadata Supabase hanya diperlukan untuk foto baru.

## Tahap 1 — jembatan QC baru (branch)
- Record baru memakai `ownerUid` dari `firebaseAuth.currentUser.uid`, bukan dari input pengguna.
- HOLD diberi `holdId` stabil. Legacy fallback tanpa `holdId` tidak dihapus.
- Buat manifest legacy yang disimpan **lokal di Cloud Shell**, bukan di repo. Tidak ada migrasi otomatis.
- Simpan data QC baru terlebih dahulu di Firestore dengan `clientRevision` dan metadata status; foto antrean terpisah dari penyimpanan data.
- Lulus bila QC baru dan koreksi tidak mengganti UID yang sudah ada, dan tidak mengubah record historis.

## Tahap 2 — backend foto yang aman
- Backend server verifikasi token Firebase + data `users/{uid}` + `role_access` saat setiap permintaan.
- Backend Supabase signed URL private maksimal 60 detik; secret key hanya di server.
- Boleh lintas akun berdasarkan Data QC view/edit, termasuk Manager/Admin/Mandor dengan izin View.
- Uji 2 akun asli (view/none) dan perubahan izin dinamis, plus token revoked, UID mismatch, no-photo.
- Lulus bila akun View membuka foto uploader lain dan akun None gagal.

## Tahap 3 — UI dan offline
- QC Spraying/Fertilizer/HOLD/Scan Report unggah ke bucket private, ref ke `qc_photo_metadata` (bukan array yang berisiko ditimpa).
- Status **QC tersimpan** terpisah dari **Foto antri/diunggah/gagal**.
- Retry file immutable (satu foto ID/path), koreksi + revisi konsisten, simpan IndexedDB sebelum jaringan.
- Viewer QC: foto Supabase via backend, Google Drive fallback untuk 670 legacy, preview dan ekspor tetap terbaca.
- Lulus bila pengujian offline/reload/retry/penggantian role tidak menyebabkan hilang foto atau duplikasi.

## Tahap 4 — cutover Firestore-only dan Excel
- Buat inventaris semua endpoint `qcApi.*` yang menyentuh Apps Script untuk QC, master, plan, user, dashboard, upload, export, koreksi.
- Ganti dengan Firestore / backend trusted dan migrasikan aturan hak akses sesuai fitur.
- Jalankan shadow-read perbandingan jumlah record, total area, summary activity, report, Export Excel, data QC filter.
- Lulus bila total/luas/status cocok, koreksi dan plan berjalan, tanpa satu pun request QC produksi yang bergantung ke Spreadsheet; lakukan cutover bertahap dan punya rollback.
- Jangan putus Apps Script sebelum status Data QC tidak lagi menyatakan "sudah tersimpan di Spreadsheet" dan transport `finalizeRecord` diganti dengan alur Firestore.

## Gerbang sebelum deploy produksi
1. Tes server sungguhan (bukan hanya mock).
2. Security Rules produksi diuji terhadap skema nyata dan permisif lama tidak dibuka.
3. Uji fungsional/multi-role/handphone/offline/Excel.
4. Backup, rencana rollback dan cek pascadeploy.
5. Pengaturan permission tetap dari Owner; tanpa hardcoding jabatan.

## Satu perintah manifest (hanya untuk dokumentasi, tidak menghambat tahap foto baru)
```bash
cd ~/QC-Form-Web
git pull origin feature/firebase-auth-claims-supabase
node scripts/create-qc-legacy-manifest.mjs --read-only-confirmed
npm run build
```
Manifest rinci disimpan pada `~/qc-migration-private` dengan permission mode 0600. Jangan di-upload ke GitHub; berisi ID QC dan calon UID. Script hanya membaca Firestore dan Firebase Auth, tidak memodifikasi produksi.

**Tanggung jawab selanjutnya:** langsung implementasi jalur QC photo backend dan UI, bukan menambahkan audit identitas lagi. Branch development only sampai seluruh gerbang hijau.

## Progress setelah manifest berhasil (11 November 2026)
- Cloud Shell pengguna mengonfirmasi manifest lokal berhasil, `writes: 0`, dan `npm run build` lulus (350 modul).
- Foto historis Drive tetap dipertahankan; tidak memblokir tahap foto baru hanya karena 8 username historis tak cocok.
- Branch sekarang memuat `src/QcSupabasePhotoViewer.tsx` dan mount preview pada `src/App.tsx`; *off by default* kecuali `VITE_QC_PHOTO_SIGN_PREVIEW=true`. Ini **bukan** fitur produksi aktif.
- Viewer membaca `qc_photo_metadata/{recordId}/photos` dan meminta URL signed server untuk semua foto dengan izin Data QC view/edit; gambar lama Drive masih ditampilkan.
- **Gap integrasi yang harus diselesaikan sebelum pengaktifan:** `src/qcSupabasePhotos.ts` masih mematikan upload dan menaruh daftar `supabasePhotoRefs` di parent `qc_records`, sedangkan backend signer + viewer menggunakan metadata subkoleksi. Perlu satu skema tunggal dan uji rules produksi. Tidak boleh mengaktifkan flag sampai gap ditutup dan backend server teruji sungguhan.
- Ekspor JPG/PDF foto private membutuhkan pemuatan gambar tepat waktu dan pertimbangan CORS; tidak boleh mengklaim ekspor foto Supabase sudah selesai.
- Tahap berikut adalah menyatukan schema metadata upload → subkoleksi → signed viewer, menjalankan uji emulator end-to-end, baru konfigurasi server hosting. Tidak perlu audit legacy username lagi.

## 12 November 2026 — QC transport cutover candidate
- `VITE_QC_FIRESTORE_ONLY=true` blocks QC record Apps Script endpoints and selects only the operational queue worker. Requires `VITE_QC_OPERATIONAL_SAVE=true`. Both remain off by default.
- Existing legacy jobs remain on their devices, not deleted or marked confirmed. Legacy edits/finalization/deletion paused in candidate mode; must resolve before final cutover. Old browser versions are not blocked by this client flag.
- Firebase login bridge still depends on Apps Script login, registration, session checks, master data and administration. This is a QC record transport cutover, NOT complete Apps Script retirement. Remaining endpoints need replacement, parity tests and rollback readiness before retirement.
- Next: validate runtime network isolation, migrate/reconcile pending legacy jobs, support historical and cross-user correction under verified permissions, and finish server manifest write protection. Test operational uploads, reports and Excel in real browser before release.

## 13 November 2026 — Stage 18A native account settings and dependency inventory
- Native QC Settings displays the verified account identity and disables legacy endpoint configuration. Username, email, full name and role remain read-only; do not change historical username-to-record relationships without a separate migration plan.
- Firebase password change is gated by `VITE_QC_NATIVE_ACCOUNT_PASSWORD=true` in addition to the native portal flag. **Keep off until legacy authentication is retired and rollback policy is approved.** Requires a fresh approved profile, matching Firebase UID/email, settings Edit (or Owner), network, current-password reauthentication and another permission/identity check before updating. Firebase Auth ultimately enforces its own credential policy; the frontend flag is not a server-side security boundary. Password changes do not update legacy credentials.
- Native chooser now exposes Firebase sign-out without deleting persisted queue records. Unsaved form input still needs to be saved before leaving a page.
- Run `node scripts/audit-qc-apps-script-dependencies.mjs` for static inventory of tracked React source. Unclassified calls require review; this is not a runtime network isolation test.
- Remaining gates: review root legacy web app and any direct/dynamic network calls, account-change requests and historical logs, server-side retirement of legacy writers, actual browser/role/queue/report/Excel parity, deploy trusted endpoints and verify flags, baseline backup and UAT. No legacy endpoint or spreadsheet is disabled by this commit.

## Stage 18B — Historical audit and native display-name requests
- Code.gs listLogs_ is capped to 300 entries. The manual export helper scripts/export-qc-legacy-audit.gs reads all rows of Activity_Logs and exports an allowlisted account-request inventory. It is NOT a public web action. Run only by the authorized spreadsheet operator after review; keep the JSON private and out of GitHub. The helper creates a Drive file, never edits source sheets. Timestamp validation fails closed rather than guessing timezones. Legacy request inventory excludes password/hash/salt/notes and is not an approval migration.
- Local validation: node scripts/import-qc-legacy-audit.mjs --dry-run /private/snapshot.json. It reports aggregate counts, status and manifest hash without printing individual rows. The command has NO production write mode. Emulator-only import uses qc_legacy_activity_logs. Deterministic IDs bind spreadsheet ID, sheet ID and row number; identical source rows on different row numbers are retained. Freeze source against sorting/deleting/reordering before a final export; reconcile source changes and compare counts/hashes before production import. Do not infer that a missing row in a later snapshot is deleted. Import chunks are individually atomic, not one atomic transaction across the entire source.
- Native Activity Logs merges up to 100 per source: historical (VITE_QC_LEGACY_AUDIT=true), QC and Owner-only administration. No fallback to Apps Script. Historical collection is read-only to clients and restricted to approved profiles with qc_logs View/Edit or Owner. No flag activation until a complete verified import and rules deployment.
- Native name requests require VITE_QC_NATIVE_NAME_REQUESTS=true, configured trusted admin endpoint, and server handler option nameRequestsEnabled=true. Both UI and service default off. User must reauthenticate and have qc_settings Edit or Owner; one pending request per UID, review is Owner only, approval changes only users.fullName plus update metadata and creates audit in the same transaction. Username/UID/email/role and historical QC inputtedBy are immutable in this flow. Login again to refresh display name.
- Resolve all legacy PENDING requests before enabling native requests; do not transfer pending password hashes or replay old approvals. Username changes remain blocked pending ownership alias strategy; password changes retain separate Stage 18A cutover gate. Native UiEnhancers no longer mounts legacy account request panel. No production endpoint or Firestore changes executed in this stage.
- Regression: npm run build; run scripts/test-qc-legacy-audit-name-requests.mjs against demo-qc-photo-test Firestore emulator. Real spreadsheet snapshot, live Auth reauthentication, production endpoint configuration, rule deployment, pagination beyond latest 100 per source, server-side retirement of legacy clients and runtime browser UAT still need verification.

## Stage 18C — Real legacy snapshot and read-only production preflight
- The operator confirmed the offline preflight checks and React build passed, and the production read-only preflight completed with writes: 0 and releaseApproved: false. No native name-request/lock inconsistency was reported. The remaining reported blocker without a snapshot was REAL_LEGACY_SNAPSHOT_REQUIRED. Keep production counts and private manifests in the operator's private workspace; do not restore previously removed QC records based on a count difference alone.
- The current Code.gs LOG_HEADERS and REQUEST_HEADERS match scripts/export-qc-legacy-audit.gs. Use the bound source spreadsheet's Apps Script editor, add a separate script file containing that helper, and manually run exportQcLegacyAuditSnapshot as the authorized owner. No setupSystem, web deployment, public web action, or spreadsheet write is needed. Check the created Drive file is restricted before downloading it. Do not sort, delete, or reorder source rows; this is an initial snapshot, not a final source freeze.
- Download only the generated JSON and transfer it through Cloud Shell's upload UI, outside the repository, to ~/qc-migration-private/qc-legacy-audit.json. Use directory mode 0700 and file mode 0600. Never attach raw JSON to a public issue, commit it, or print its contents.
- Validate locally and reconcile production read-only:
  ```bash
  cd ~/QC-Form-Web
  SNAPSHOT="$HOME/qc-migration-private/qc-legacy-audit.json"
  node scripts/import-qc-legacy-audit.mjs --dry-run "$SNAPSHOT" &&
  GCLOUD_PROJECT=form-qc-unm GOOGLE_CLOUD_PROJECT=form-qc-unm FIREBASE_PROJECT_ID=form-qc-unm \
    node scripts/preflight-qc-stage18c.mjs --read-only-confirmed --snapshot "$SNAPSHOT"
  ```
- Review logCount, requestCount, pendingCount, manifestHash, missing, conflicts, unexpectedSourceRows and blockers. Missing historical rows are expected before an import; a conflict or unexpected source row requires reconciliation, not overwrite. Pending account requests require authorized legacy review before native requests are enabled. Do not automatically approve or copy credentials.
- The production preflight count of qc_photo_metadata refers to parent documents, not necessarily all nested photos. Full metadata/object reconciliation belongs to the operational photo release gate.
- Stage 18C does not deploy rules, write imported logs, activate feature flags, or retire legacy writers. Final source freeze/re-export, verified production rules, backup, explicit import approval, reconciliation, trusted backend and browser UAT remain release gates.

## Stage 18D/E — Historical snapshot validated; prepare controlled import
- Operator confirmed a real snapshot validated and reconciled read-only; no source conflicts, unexpected rows, or pending legacy requests were reported. The only reported historical blocker was missing imported rows. This is not final source freeze or deployment approval.
- New scripts/check-qc-live-firestore-rules.mjs uses the read-only Firebase Rules API to compare the active default Firestore release with the branch rules (newline normalization only). A mismatch blocks the import; it does NOT authorize deploying the branch's rules over production.
- New scripts/import-qc-legacy-audit-production.mjs defaults to no action without explicit mode. Run --self-test, then --plan with the private snapshot. The plan checks full source reconciliation, current rules, pending native requests/locks, and exact snapshot file SHA-256. Only aggregate output is printed. Keep all raw snapshots private.
- Apply is deliberately not the next command: first review the plan, validate rules/permissions, preserve backups, resolve legacy writer cutover/freeze, re-export the final snapshot and reconcile it. The apply path requires a separately reviewed full file SHA-256, explicit freeze and backup confirmations, matching deployed rules, no conflicts, and no pending requests. These confirmations are operator attestations, not automatic evidence of a freeze or backup.
- Import calls the existing tested create-only historical importer; chunks are separately atomic, existing identical rows are unchanged, conflicts are never overwritten, and a final full reconciliation is required. Failure may leave earlier chunks committed; review a fresh plan before retry. No automatic deletions, no imports into users/QC/plan/photo collections, no replay of approved account requests. Do not enable the legacy audit flag or retire Apps Script just because the import is complete.

## Stage 18F — Isolated historical audit rules candidate
- Operator's production import plan completed read-only; the deployed rules hash matched Git commit a945122a4238356b0eeaddbe0ed134a811549108 exactly (normalized SHA-256). The full development rules were different, as expected. No production rules have been changed.
- scripts/firestore.legacy-audit-release.rules preserves that exact deployed baseline and adds only the tested qc_legacy_activity_logs match: active approved Owner or explicit qc_logs View/Edit can read; all client writes denied. All other rules remain unchanged. Do not deploy the root firestore.rules or full firebase.json for this limited historical release.
- Run the dedicated local demo emulator regression:
  ```bash
  GCLOUD_PROJECT=demo-qc-photo-test firebase emulators:exec --only firestore --project demo-qc-photo-test --config scripts/firebase.legacy-audit-release-emulator.json 'node scripts/test-qc-legacy-audit-release.mjs'
  ```
  Expected 16 checks, including exact baseline reconstruction and existing QC access compatibility. No live Firestore queries or writes in this test. Review actual result before any deployment.
- The guarded production importer now requires an exact match to the isolated historical rules file at both planning and apply. The older general checker still compares the full development rules; a mismatch there remains expected for a partial release.
- Next gates: preserve the live rules release and baseline for rollback, verify no intervening deployment, review real approved role permissions and legacy continuity, obtain explicit authorization for a rules-only release, and verify the live candidate hash. Then rerun the import plan with the private final snapshot. Backup and source-freeze requirements still apply. No hosting, indexes, Supabase or other module deployment in this stage.

## Stage 18G — Rules-only release preparation
- Operator confirmed all 16 isolated emulator regression checks passed, including byte-for-byte candidate reconstruction and legacy QC permission tests. Production deployment is still not confirmed.
- Run scripts/prepare-qc-legacy-audit-release.mjs with --prepare and all three project environment variables set to form-qc-unm. It reconstructs the verified baseline from Git, checks the active rules hash against it, reads only aggregate current role eligibility and historical count, and creates private local candidate/rollback files and release metadata in a new directory under ~/qc-migration-private. No Firestore writes or release changes. An unknown qc_logs permission denies access; review the aggregate before releasing. No active approved Owner or a nonempty history collection blocks preparation.
- Only after review and explicit release authorization, use the generated firebase.candidate.json from that specific backup directory with firebase deploy --only firestore:rules --project form-qc-unm --config firebase.candidate.json (run from that directory). Repeat preparation immediately before deployment if the production release could have changed; coordinate exclusive deployment access. Do not run the default firebase deploy command. Verify with the same script --verify from the repository, then smoke-test the existing production client and authorized history access after propagation.
- Recovery, only if the active release is still the isolated candidate and no other deployment has intervened: redeploy the saved rollback.rules via firebase.rollback.json in the corresponding backup directory. This is a new rules release, not a data rollback. The saved rules backup is not a backup of the database or Spreadsheet.
- Historical import remains a separate action: protect and preserve the source snapshot, review a fresh final snapshot and plan, and obtain backup/freeze confirmations. Existing log writers are not retired by this limited rules release; any additional rows need a subsequent reconciled import. Do not activate the historical UI flag or native settings.

## Stage 18G correction — Legacy profile status compatibility
- Operator's production preparation matched the baseline and saved a private rollback backup, but found zero eligible approved active users and blocked release with NO_ACTIVE_APPROVED_OWNER. FirebaseProvisioning.gs explicitly writes uppercase APPROVED/PENDING, whereas native provisioning uses lowercase approved. The earlier candidate and test fixtures accepted only lowercase. No production account changes or deployment occurred.
- The isolated historical rule now accepts exactly approved or APPROVED, still requiring active == true plus Owner or explicit qc_logs View/Edit; all client writes remain denied. The full development historical rule is aligned. Other native profile guards, including native admin, name changes and operational audit, still need coordinated compatibility review before native cutover. Do not bulk rewrite user profiles or relax to active-only.
- Re-run the isolated emulator command from Stage 18F; expected 24 checks. The release preparation script now mirrors both accepted statuses and prints aggregate status/active counts without personal data. Re-run --prepare after tests pass; use only the newly generated candidate backup directory. Older candidate backups contain the lowercase-only rule and must not be deployed.
- Review profileStatus, access.owner, view/edit, unknownPermission and blockers. If zero eligible Owner persists, stop and investigate; do not bypass the guard. Production remains unchanged.

## Stage 18G — Corrected candidate verified, ready for operator-controlled rules release
- Operator confirmed 24/24 isolated emulator checks passed, the corrected production preflight matched the existing baseline, and no blockers remained. The aggregate eligibility review confirmed legacy uppercase profiles are recognized and the Owner and authorized viewers are eligible; no profile changes were made.
- The reviewed isolated candidate normalized SHA-256 is 1969b01dc886befc8fa65982c5a57fcbf464581a73a1e4916e1485f8922e8e5c. Do not use the earlier lowercase-only candidate. Immediately before deployment, run --prepare again and require the same candidate hash, exact baseline match, expected permissions, and zero blockers. Coordinate exclusive rules-deployment access.
- With explicit operator approval, deploy only firestore:rules using the newly prepared private firebase.candidate.json. Verify with --verify and run a smoke test of the currently deployed legacy portal. Rerun the historical import --plan using the private snapshot; this remains read-only. Rules deployment is not permission to apply historical imports, enable flags, deploy hosting, or retire legacy writers.
- Production rules backup is not database backup. Preserve the source and final snapshot, confirm source row stability and backup before any create-only import. No rules deployment or data import has been observed at this checkpoint.

## Stage 18G completed — Live rules verified; legacy portal remains active
- Operator confirmed the isolated historical rules deployment completed and the active ruleset matched the reviewed candidate hash. No document writes occurred in the verification. The main Hosting URL /react/ returned 404; the existing operational portal was accessible via https://form-qc-unm--react-test-ayyxz4hj.web.app/react/ (preview channel react-test, not proof of a live-channel release). Do not overwrite the operational preview or assume live Hosting is configured.
- The operator confirmed legacy Spreadsheet login still runs. This is expected for the current deployed client: only Firestore rules were released. src/main.tsx mounts NativePortalSession only when VITE_QC_NATIVE_PORTAL is true, and that mode requires operational-save, Firestore-only, master-Firestore and native-registration prerequisites. Do not enable all those flags on the operational channel.
- The real production eligibility inventory showed all approved active profiles use uppercase APPROVED. The Firebase-only identity resolver and session/pilot had lowercase-only guards; updated these to accept exactly APPROVED or approved while retaining active boolean, UID/email and role checks. The existing 12 identity checks gain six regression cases; run node scripts/test-qc-firebase-identity.mjs, node scripts/test-qc-native-portal-policy.mjs and npm run build. No Hosting deployment or account mutations by this change.
- Native administration, registration approval, name requests and operational QC guards need coordinated status compatibility and live role/queue/endpoint parity before cutover. Use a separate isolated authentication pilot rather than switching operational login. The existing auth pilot is gated by VITE_QC_FIREBASE_AUTH_PILOT and the qc-firebase-auth-pilot=1 query flag; it signs in a separate Firebase app and performs read-only profile verification.
- Remaining actions: smoke-test existing modules, rerun import --plan against the verified isolated rules, protect and reconcile final legacy source snapshot, then controlled historical import. Auth migration work can be verified separately without retiring Apps Script or altering the operational channel.

## Stage 19A — Standalone Firebase-only authentication pilot
- Operator confirmed 18 identity tests, 9 native portal policy tests and build/production historical import plan completed; isolated rules exactMatch true, zero blockers, no historical writes. Historical import still awaits final snapshot/source stability and backup review; do not mark it complete.
- New auth-pilot.html, src/authPilotMain.tsx, vite.auth-pilot.config.mjs and firebase.auth-pilot.json build only the read-only authentication pilot into dist/qc-auth-pilot. Bundle guard rejects operational entry, legacy API and offline module. No service worker, operational UI, registration or QC writes. The isolated login verifies the intended Firebase project and uses App Check if configured; never disable enforcement to make a pilot pass.
- Run npm run typecheck and npx --no-install vite build --config vite.auth-pilot.config.mjs, then verify dist/qc-auth-pilot/auth-pilot.html exists. The separate hosting config targets form-qc-unm only. Deploy with operator approval to qc-auth-pilot channel only: firebase hosting:channel:deploy qc-auth-pilot --project form-qc-unm --config firebase.auth-pilot.json --expires 1d --no-authorized-domains. Do not deploy the root hosting config, react-test, or live. The preview URL is public but the application uses actual Firebase authentication. Open the CLI's returned URL plus /auth-pilot.html. The --no-authorized-domains switch avoids changing Auth authorized domains; if domain/App Check restrictions block the test, review them separately, do not weaken security.
- Use existing consenting Owner and non-Owner accounts, compare returned role/permissions, and verify browser Network shows Firebase Auth/Firestore only (no Apps Script). Never paste credentials or tokens into logs/chat. No need to modify passwords, create accounts, clear operational browser storage or enable native flags. Record results; isolated sign-in is not full portal UAT. Production portal remains on react-test. No preview deployment observed yet.

## Stage 19A pilot result / Stage 19B production identity and role readiness
- Operator confirmed standalone auth pilot build and deployment to qc-auth-pilot succeeded. One existing non-Owner account successfully signed in and verified the Firestore profile; the isolated session closed. The displayed role was pengunjung and three QC permissions were none. This is not proof those permission values are intended; compare the actual template and legacy behavior rather than granting access based on the account's display name.
- Pilot URL observed: https://form-qc-unm--qc-auth-pilot-pcpv2xbi.web.app/auth-pilot.html. Preview deployment is temporary; CLI displayed expiry on 14 November 2026. Owner login and browser Network verification are still outstanding. Do not share passwords, tokens, or request payloads.
- New scripts/audit-qc-native-auth-readiness.mjs performs a read-only aggregate review of active approved profiles against Firebase Auth, using the same identity resolver and role permissions as native login. It distinguishes missing/mismatched/incomplete role templates from explicit none, counts verified identities per role, and reports blockers. Run with --read-only-confirmed and all three project variables set to form-qc-unm. This is not proof users know their Firebase passwords; browser sign-in remains required.
- Legacy userAccess.ts accepts template permissions without checking the role field and UI accessControl.ts merges role defaults; native resolver instead fails closed on missing/mismatched template or missing keys. Existing Firestore rules can also fall back to legacy role defaults. Review these differences before changing production permission policy. No automatic role assignments, profile updates, password resets or rules changes.
- Remaining historical import and native admin/registration/operational integration gates are unchanged. Existing operational Hosting channel remains untouched.

## Stage 19B completed / Stage 19C — Legacy-compatible native registration and administration
- Operator confirmed both Owner and non-Owner real Firebase-only login pilots succeeded. Production audit verified all active approved identities, no mismatches or missing non-Owner templates, no blockers, and no writes. The Owner template is intentionally absent; Owner retains full access. The pengunjung template explicitly grants dashboard view and denies the three tested QC permissions. Do not grant additional access based on display name. Password knowledge for all users and browser network verification are not established by the aggregate audit.
- Native admin core, name request core, Users & Access UI and development Firestore rules now accept exactly approved and APPROVED for approved user profiles. Existing inactive approved targets can still be reactivated by Owner, while pending targets and inactive/pending Owners remain denied. Registration request lifecycle statuses and newly provisioned profile format remain unchanged; no bulk profile normalization. The isolated deployed historical rules file is unchanged.
- Run local regressions, using separate fresh emulator sessions so synthetic applicant IDs and audit counts do not collide:
  ```bash
  GCLOUD_PROJECT=demo-qc-photo-test firebase emulators:exec --only firestore,auth --project demo-qc-photo-test --config scripts/firebase.native-admin-emulator.json 'node server/qc-photo-access/test-native-admin-emulator.mjs && node server/qc-photo-access/test-native-admin-http-emulator.mjs'
  GCLOUD_PROJECT=demo-qc-photo-test firebase emulators:exec --only firestore --project demo-qc-photo-test --config scripts/firebase.native-admin-emulator.json 'node scripts/test-qc-native-registration.mjs && node scripts/test-qc-legacy-audit-name-requests.mjs'
  npm run build
  ```
- Registration and name-request rules suites load the full development rules in the demo emulator; the server/HTTP tests use the local admin SDK. Review all suites before deployment. New native registration still requires verified email and Owner approval/activation; prior legacy pending accounts need a separate migration decision, not automatic activation.
- Remaining checks include trusted admin runtime deployment, archive/restore and historical correction server guards, operational audit status compatibility, native registration email/App Check behavior, live authorization and source-of-truth conflicts while legacy Apps Script provisioning can still overwrite profiles. Keep all native write features disabled in production; do not deploy the root rules or enable native portal yet. Historical Activity Logs import remains outstanding pending backup and final source snapshot.
