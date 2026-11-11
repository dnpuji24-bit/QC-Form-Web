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
