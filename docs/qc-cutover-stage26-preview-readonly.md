# Tahap 26 — Preview Hosting & foto QC operasional (read-only gate)

Status awal: screenshot Cloud Shell memastikan kedua Edge Function baru versi 1 (`qc-photo-upload`, `qc-photo-sign-operational`) mengembalikan **HTTP 503** dengan `OPERATIONAL_PHOTOS_DISABLED`. Handler berjalan dengan `QC_OPERATIONAL_PHOTO_ENABLED=false`. Fungsi pilot dan Firestore/Hosting tidak berubah.

## Batas izin dan lingkungan

- Pengguna menyetujui **deployment dua fungsi dalam keadaan nonaktif**, bukan pengaktifan upload, penulisan QC sintetis pada Firestore produksi atau penerbitan Firebase Hosting Preview/Live.
- Jangan mengubah flag menjadi `true` sebelum izin aktivasi terpisah dan rencana pengujian/cleanup record sintetis disetujui.
- Tidak ada impor data dari Spreadsheet; seluruh QC/Planning/Master/akun sudah di Firestore `form-qc-unm`. Foto historis tetap di Google Drive tanpa dipindah, dihapus, atau ditulis ulang. Modul gudang masih ditunda.

## Satu pemeriksaan read-only

```bash
cd ~/QC-Form-Web
git switch feature/firebase-auth-claims-supabase
git pull --ff-only origin feature/firebase-auth-claims-supabase
npm run test:cutover:photo-preview-readonly
```

Skrip `scripts/test-qc-cutover-preview-readonly.mjs`:
1. Memerlukan kandidat build lokal di `public/react/index.html`.
2. Melakukan GET React Preview `https://form-qc-unm--react-test-ayyxz4hj.web.app/react/` dan memastikan HTML dan asset JavaScript tersedia.
3. Memeriksa apakah **entry fingerprint Vite** pada build lokal sama dengan React Preview yang di-host. Jika berbeda, artinya preview belum memakai kandidat build yang sama; perlu review/update preview kemudian, bukan mengaktifkan Supabase.
4. Memastikan kedua Edge Function masih menolak POST kosong tanpa token dengan HTTP 503 `OPERATIONAL_PHOTOS_DISABLED`. POST kosong tidak mungkin menjadi upload sah. Jangan mencantumkan Firebase ID Token/secret.
5. Memeriksa sumber konfigurasi preview lokal: `VITE_QC_PHOTO_SIGN_PREVIEW=true` dan `VITE_QC_PHOTO_SIGN_ENDPOINT=https://mcfwnstdfhhtcbksgrlj.supabase.co/functions/v1/qc-photo-sign-operational`. **Ini hanya pemeriksaan konfigurasi file**, bukan bukti nilai sudah tertanam di bundle yang di-host.

Jika `PREVIEW_BUILD_MISMATCH`: preview belum sesuai dengan kandidat dan harus ditinjau sebelum rilis. Jika `SIGNED_PHOTO_PREVIEW_CONFIG_MISSING`: nilai endpoint signer belum disiapkan untuk build; perbaiki tanpa memasukkan secret, lalu buat kandidat build baru. Jika `PREVIEW_NOT_AVAILABLE`: periksa channel Firebase Preview dan masa berlakunya. Jika `OPERATIONAL_PHOTO_NOT_DISABLED`: hentikan rencana UAT, karena status backend berubah dari kondisi aman.

Tidak ada upload foto, perubahan Hosting, perubahan secrets, atau penulisan Firestore dalam gate ini.

## Gate setelah preflight (memerlukan persetujuan baru)

- Pastikan alias React Preview masih hidup dan tidak menunjuk build lama. Review kandidat Firebase-only, endpoint signer, dan perizinan; jika perlu, penerbitan Hosting Preview adalah langkah terpisah.
- Siapkan akun penguji berizin dan satu dokumen QC sintetis **baru** dengan identifier unik serta parent DP yang sesuai, tanpa mengubah 717 record historis yang ada. Perlu izin eksplisit untuk menulis ke Firestore produksi, termasuk prosedur cleanup yang menjaga audit imutabel.
- Pastikan lokasi manifest foto dan upload intent cocok dengan foto baru, lalu aktifkan `QC_OPERATIONAL_PHOTO_ENABLED` sementara **setelah izin terpisah**.
- Uji satu foto JPEG/PNG/WebP pada QC baru; signer mengembalikan URL 60 detik hanya kepada pemilik/role yang berhak, menolak pengguna yang izinnya dicabut. **Jangan gunakan foto historis di Google Drive sebagai input upload.**
- Sesudah uji, kembalikan flag ke `false`, cek HTTP 503, dan verifikasi QC serta hasil cleanup sesuai kebijakan audit. Jika ada kegagalan, jangan deploy Hosting Live; pertahankan fungsi nonaktif dan rilis sebelumnya sebagai rollback.

## Status

**PREPARATION ONLY**. Kedua Edge Function sudah dideploy nonaktif dan diverifikasi 503 sebelumnya; langkah 26 baru menambahkan gate read-only untuk melihat kelayakan React Preview. Gate Cloud Shell belum dijalankan setelah perubahan GitHub; tidak ada klaim UAT foto nyata atau production cutover berhasil.
