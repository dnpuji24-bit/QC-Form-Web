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
