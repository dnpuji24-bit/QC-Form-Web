# Tahap 22 — Kontrak upload foto QC baru dan audit endpoint (read-only, 22 Nov 2026)

## Baseline sudah terbukti
Screenshot Cloud Shell pengguna: `test:cutover:native-qc-save` **4/4 PASS**, exit 0. QC/Actual/audit atomik dari form bridge portal React utama ke Firestore **Emulator**, retry tanpa duplikasi, dan PNG tersimpan di Cache Storage lokal. **Belum** ada upload Supabase yang diuji pada jalur ini.

## Hasil audit Edge Function produksi (connector Supabase, read-only)
Project `mcfwnstdfhhtcbksgrlj` memiliki fungsi aktif termasuk:
- `qc-photo-sign` (staging/historical pilot, bukan signer operational umum);
- `qc-photo-upload-pilot`;
- `qc-photo-live-pilot-upload` dan `qc-photo-live-pilot-sign`;
- `qc-native-admin-live-pilot`.

Pada audit ini **tidak ditemukan slug** `qc-photo-upload` dan `qc-photo-sign-operational`, padahal `src/qcPhotoEnvironment.ts` menujunya untuk portal operasional. Kedua implementasi sumber berada di `supabase/functions/`, **tetapi belum terdeploy di project ini**. Jangan menggantinya dengan endpoint pilot: role/record/bucket-nya berbeda.

Project UAT `tcmtqgbpafwciaflgsaa` memiliki `qc-photo-upload-uat` dan `qc-photo-sign-uat`. Itu hanya membuktikan endpoint UAT ada, bukan paritas fungsi produksi.

## Perubahan kode tahap ini
- `src/qcOperationalPhotoHttp.mjs` dan deklarasi tipe `.d.mts`: kontrak HTTP upload baru yang memeriksa endpoint persis, bucket privat, objek yang cocok dengan UID/record/slot, tipe JPEG/PNG/WebP, sha256 dan panjang byte, Firebase bearer token, serta receipt server (`photoId/objectPath/sha256/size/bucket`). Tidak ada secret key di browser.
- `src/qcOperationalAdapters.ts`: menggunakan helper tersebut **hanya di cabang foto baru non-local-UAT**. Cabang foto sintetis masih menulis cache browser, tidak berubah. Transaksi Firestore QC/Actual/audit dan antrean tetap memakai jalur yang sama.
- `scripts/test-qc-operational-photo-http-delta.mjs`: tiga kontrak offline: (1) payload dan receipt canonical, (2) URL Drive, endpoint pilot, path/sha/receipt salah, dan HTTP 403 ditolak, (3) pemisahan UAT/produksi serta referensi foto utama, Scan Report, HOLD lama di Drive tidak ditulis ulang.
- Tidak mendeploy Edge Function, tidak memanggil Storage, tidak mengubah project `form-qc-unm`, tidak menghapus/migrasi foto lama, tidak mengaktifkan Cloud Billing, dan tidak melanjutkan modul gudang.

## Satu perintah Cloud Shell
```bash
cd ~/QC-Form-Web
git switch feature/firebase-auth-claims-supabase
git pull --ff-only origin feature/firebase-auth-claims-supabase
npm run test:cutover:photo-http
```
Menjalankan pemeriksaan sintaks, 3 delta offline, dan `npm run typecheck`. Tidak membutuhkan emulator, secret, atau upload Supabase nyata. Hasil yang diharapkan **setelah eksekusi pengguna**:
```text
PASS: new PNG photo body carries canonical bytes, revision and Firebase authorization
PASS: invalid destination, Drive URL, tampered object bytes and unsafe receipts fail closed
PASS: UAT and old Google Drive photo references remain isolated from new-photo upload
SUCCESS: 3 isolated operational photo HTTP delta contracts passed (MOCK ONLY, NO Supabase upload)
RELEASE_STATUS: BLOCKED — operational Supabase Edge Functions must be deployed and verified separately
```

## Gate rilis masih terbuka
1. Review izin operasional, Firestore document + upload intent, Firebase token revocation, CORS origin, Supabase secret dan perilaku retry dari fungsi `qc-photo-upload` serta `qc-photo-sign-operational` pada branch; lakukan deploy **hanya setelah izin rilis eksplisit** dengan rollback yang dapat dieksekusi.
2. Verifikasi upload foto baru JPEG/PNG/WebP ke bucket privat `qc-photos` dari portal sebenarnya serta preview signed URL dari manifest yang sudah di-commit, dengan akun berizin dan revocation. Tidak ada transfer foto Drive.
3. Verifikasi antarmuka form QC Spray/Fertilizer beserta MP/DP/AP, ekspor Excel, sinkronisasi Offline, backup/rollback dan zero Apps Script di hosted portal sebelum menyatakan produksi siap.

**Status rilis: BLOCKED.** Tidak ada deploy pada tahap ini. Guard yang lulus adalah verifikasi kontrak/mock; keberadaan endpoint nyata harus dipastikan lagi saat rilis.
