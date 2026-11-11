# QC Photo — Uji Supabase Storage asli tanpa deploy/billing baru

**Tujuan:** memverifikasi akses baca foto asli pada bucket private `qc-photos-test` menggunakan kunci Supabase yang hanya dimasukkan ke terminal server. Script mencari file lama di folder `UID/tests/`, meminta signed URL berlaku 60 detik, lalu mengunduhnya untuk memeriksa ukuran dan MIME. Script tidak menampilkan URL maupun secret.

## Hasil pemeriksaan langsung Supabase (11 Nov 2026)
- Proyek `mcfwnstdfhhtcbksgrlj` aktif.
- `qc-photos-test` private (`public=false`).
- Batas object 2,097,152 byte; MIME `image/jpeg`, `image/png`, `image/webp`.
- Ada 2 object foto pada folder `/tests/`.
- RLS `storage.objects`: uploader Firebase dapat INSERT dan SELECT di folder berdasarkan UID sendiri. Tidak perlu mengubah RLS untuk uji ini.
- Signed URL dari trusted backend dapat digunakan oleh pengguna dengan Data QC View/Edit setelah server memeriksa Firebase Auth + Firestore role.

## Jalankan sekali dari Cloud Shell

```bash
cd ~/QC-Form-Web
git pull origin feature/firebase-auth-claims-supabase
bash server/qc-photo-access/run-real-storage-readonly.sh
```

Script akan meminta **secret key `sb_secret_...` melalui prompt yang tidak menampilkan karakter**. Ambil dari Supabase Dashboard → Project Settings → API Keys → Secret keys. Tempel hanya pada prompt terminal kamu sendiri, **jangan ke chat, GitHub, file React, atau screenshot**.

Pada eksekusi, script memasang dependency ke folder server `server/qc-photo-access/node_modules` (bisa membuat `package-lock.json` lokal), lalu mencari satu object **uji** di bucket private dan memverifikasi signed URL 60 detik. Dependency install adalah perubahan lokal pada Cloud Shell, bukan deploy aplikasi.

Keluaran sukses yang diharapkan (belum terverifikasi):
```text
SUCCESS: existing PRIVATE Supabase test photo was signed and downloaded.
Confirmed bucket: qc-photos-test; expiration: 60 seconds; valid image; bytes: ...
Read-only; no Firebase/Firestore writes, no object changes, no signed URL or secret printed.
```

Jika terjadi error, kirim teks error **tanpa** secret key/token/path foto. Jangan mengaktifkan public bucket atau membuat service account key untuk mengatasinya.

## Setelah uji storage asli lulus

Yang tersisa untuk `QC photo cross-user` adalah menjalankan backend HTTPS dengan identitas Firebase Admin yang terbatas, memasang secret melalui Secret Manager, dan mencoba foto QC *baru* menggunakan dua akun sungguhan (view mengizinkan, none menolak). Implementasi backend sudah di `server/qc-photo-access/index.mjs`, tetapi belum dideploy dan belum diberi secret. Backend belum boleh digunakan untuk QC produksi sebelum uji akses dua akun, rate limiting dan evaluasi Rules produksi.

**Jangan** memigrasikan 670 QC lama ke Supabase. Foto historis tetap memakai Google Drive; QC baru nantinya memakai Supabase. Spreadsheet tidak dimatikan pada tahap ini.
