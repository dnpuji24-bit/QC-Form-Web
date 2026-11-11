# Audit kompatibilitas Firestore → akses foto QC (read-only)

## Hasil audit kode (belum audit dokumen produksi)

1. Frontend memakai `src/accessControl.ts` dengan `qc_records` dan mode `none / view / edit`. Nilai per-role diambil dari `role_access/{role}.permissions` melalui `src/userAccess.ts`.
2. `src/firestoreStore.ts` menyimpan record di `qc_records/{id}` memakai `setDoc(...,{merge:true})`. Ia tidak memastikan field `ownerUid` dan `clientRevision` tersedia. Model akses metadata foto baru memerlukan dua field itu.
3. `src/types.ts` mendefinisikan `QcRecord.inputtedBy`, `photoDriveUrl`, `scanReportDriveUrl`, dan `holdIntervals[].photoDriveUrl`; foto historis harus tetap dapat dibaca.
4. `src/userAccess.ts` memuat hak akses per-role tetapi hanya mengelola client-side UI. Backend harus membaca izin baru pada setiap permintaan.
5. Backend tanda tangan foto belum di-deploy. Tidak ada kunci rahasia yang disimpan di frontend atau repo.

## Periksa hitungan data produksi tanpa mengubah apa pun

Di Cloud Shell, pada branch pengembangan:

```bash
cd ~/QC-Form-Web
git pull origin feature/firebase-auth-claims-supabase
node scripts/audit-qc-photo-compatibility.mjs --read-only-confirmed
```

Script menjalankan **query read-only** pada proyek Firebase `form-qc-unm`, maksimal 3000 dokumen QC, 500 users, dan 100 role templates. Query memakai Firebase Admin SDK dan Google Application Default Credentials Cloud Shell. Jika akses IAM ditolak, **jangan** membuat, mengunggah, atau membagikan service account JSON; laporkan pesan error.

Output adalah **hitungan agregat** (tanpa email, nama, UID, URL atau isi foto): record tanpa `ownerUid`/`clientRevision`, tipe QC yang tidak cocok, jumlah dengan foto Drive, akun tanpa `active: true`, dan nilai `qc_records` yang hilang.

Jalankan sekali saja kecuali ada perubahan data. Bacaannya menggunakan kuota baca Firestore produksi, meskipun tidak mengubah dokumen.

## Kebijakan akses yang disepakati

Semua pengguna aktif dengan akses **Data QC: Hanya Lihat** atau **Edit** dapat melihat semua foto QC, terlepas dari Mandor atau uploader. **Tidak Akses** tidak dapat melihat. Hak upload/ubah tetap mengikuti izin input dan kepemilikan record. Ini sudah diterapkan pada *prototype authorizer* dan *emulator-only* security rules, tetapi **belum** dipasang pada produksi.

## Keputusan setelah audit

- Bila `ownerUid` tidak ada, jangan mengarang UID dari nama Mandor. Buat migrasi eksplisit dan terverifikasi dari identitas Firebase serta jejak pembuat.
- Bila `clientRevision` tidak ada, tentukan revisi stabil untuk record historis dan aturan koreksi sebelum mengaktifkan metadata baru.
- Bila profil user menggunakan `status: APPROVED` tetapi tidak menggunakan `active: true`, tentukan interpretasi status secara aman berdasarkan sistem login aktif dan status penonaktifan. Jangan menganggap semua akun tanpa flag `active` pasti aktif.
- Konfirmasi key hak akses `qc_records` cocok. Ubah kode prototype agar sesuai data nyata, bukan sebaliknya.
- Jalankan pengujian end-to-end di backend testing dengan secret yang hanya berada di server. Jangan men-deploy dulu.
- Setelah itu baru sambungkan tampilan foto QC, lalu pindahkan upload dan proses Spreadsheet secara bertahap.

**Tidak melakukan penulisan Firestore, perubahan rules, deployment server, atau perubahan GitHub main.**
