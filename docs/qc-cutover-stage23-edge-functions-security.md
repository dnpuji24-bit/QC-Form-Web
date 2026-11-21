# Tahap 23 — Preflight keamanan fungsi foto operasional (read-only)

Tanggal audit: 22 November 2026. Branch: `feature/firebase-auth-claims-supabase`.

## Yang sudah dipastikan dari source

- `qc-photo-upload/handler.ts` dan `qc-photo-sign-operational/handler.ts` memeriksa signature dan audience Firebase JWT (`form-qc-unm`), status akun disabled/revoked, status profil approved, origin browser yang tepat, dan role aktif dari Firestore.
- Fungsi upload memeriksa JPEG/PNG/WebP, maksimum 2 MiB, lokasi private `qc-photos`, serta membaca kembali file untuk membandingkan ukuran dan SHA-256 sebelum memberikan receipt. `upsert:false` tidak menimpa objek yang sudah ada.
- Signer membentuk URL sementara berdurasi 60 detik hanya dari manifest QC yang sudah dikomit; bukan path yang dipilih pengguna. Secret Supabase dan Google service account hanya berada di server, bukan React.
- `verify_jwt=false` adalah konfigurasi **khusus Firebase JWT eksternal**. Supabase gateway tidak memverifikasi Firebase JWT, sehingga verifikasi signature/issuer/audience dan role oleh handler **wajib tetap aktif**.
- Data QC, MP/DP/AP, profil pengguna sudah ada di Firestore; **jangan impor ulang**. Foto historis dan URL Google Drive tetap utuh; tidak dipindah ke Supabase. Modul gudang ditunda.

## Dua perbaikan sebelum rilis

1. **Per-record access untuk mandor:** Fungsi signer semula hanya memeriksa `role_access.permissions.qc_records`, sehingga mandor dengan permission view berpotensi meminta signed URL foto QC milik mandor lain. Modul `_shared/qcOperationalPhotoAccess.mjs` kini mewajibkan `qc.inputtedBy === profile.username` pada role `mandor_spraying`/`mandor_fertilizer`, sejalan dengan `ownsExisting()` di `firestore.rules`. Owner dan role pembaca lainnya tetap memakai permission yang sudah ditetapkan.
2. **Foto QC yang sudah dikonfirmasi:** Signer semula selalu meminta dokumen `qc_photo_upload_intents`. Untuk foto yang sudah ada pada QC `firestoreSaveState:'confirmed'`, pemegang permission dapat membaca dari manifest valid tanpa membutuhkan dokumen intent yang mungkin sudah dibersihkan. **Pilot** tetap mewajibkan intent. Pemeriksaan ID, owner, format, photoId, hash, bucket, dan objectPath pada `manifest.ts` tidak dikurangi.

## Jalankan hanya delta ini di Cloud Shell

```bash
cd ~/QC-Form-Web
git switch feature/firebase-auth-claims-supabase
git pull --ff-only origin feature/firebase-auth-claims-supabase
npm run test:cutover:photo-edge-readiness
```

Gate berisi tiga pemeriksaan offline:
- Akses manifest QC konfirmasi tanpa intent; manifest diubah, bucket salah, atau pilot tanpa intent ditolak.
- Mandor membaca foto QC miliknya saja; permission dicabut dan role mismatch ditolak, Owner/viewer sesuai izin.
- Pemeriksaan source kedua fungsi terhadap Firebase JWT, revocation, origin, private bucket, ukuran/format, signed URL 60 detik, dan `verify_jwt=false` yang dikompensasi dengan otorisasi aplikasi.

Perintah juga menjalankan TypeScript `npm run typecheck`. Tidak memerlukan koneksi Supabase, Firebase Emulator, secret, upload, atau izin deploy.

Status: **kode tersimpan pada branch pengembangan; eksekusi gate Cloud Shell belum dikonfirmasi**.

## Blocker sebelum deploy Edge Function dan Hosting

- Kedua slug operasional `qc-photo-upload` dan `qc-photo-sign-operational` belum terdeploy di Supabase produksi dalam inventaris terakhir; endpoint pilot tidak dapat dijadikan pengganti.
- Perlu memeriksa nilai dan izin server-side `GOOGLE_SERVICE_ACCOUNT_JSON`, `QC_OPERATIONAL_PHOTO_ALLOWED_ORIGIN`, `QC_OPERATIONAL_PHOTO_ENABLED`, serta built-in Supabase secret key **tanpa menampilkan nilainya**. Jangan menambahkan secret ke source/frontend.
- Perlu uji integrasi nyata terhadap satu foto QC **baru** melalui akses edit, signed-read Viewer, revocation, dan retry, dengan prosedur pembatalan/rollback; dokumen foto Drive lama sama sekali tidak tersentuh.
- Preview Hosting, izin Firestore produksi, alur form, ekspor Excel, offline queue, rollback data dan hosting masih perlu dipastikan sebelum rilis penuh.
- **Tidak ada deployment atau perubahan layanan produksi pada tahap ini.**

## Koreksi skrip pengujian Cloud Shell (2026-11-22)

Eksekusi awal `npm run test:cutover:photo-edge-readiness` berhenti sebelum tiga kontrak dijalankan dengan `TypeError: Cannot read properties of undefined (reading 'ES2022')` pada `ts.ScriptTarget.ES2022`. Project memakai TypeScript `latest` yang tidak menjamin API compiler JavaScript lama. Untuk Cloud Shell Node.js 26.13.0, skrip kini memakai `stripTypeScriptTypes` bawaan `node:module` untuk menghapus hanya type annotations pada `manifest.ts`, lalu memuat JS melalui data URI. Tidak mengubah fungsi Supabase maupun TypeScript aplikasi.

Jalankan ulang command yang sama. Perbaikan sintaks lokal diperiksa, tetapi hasil tiga kontrak dan typecheck dari Cloud Shell belum diketahui. Fungsi operasional tetap belum dideploy.
