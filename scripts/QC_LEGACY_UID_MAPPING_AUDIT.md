# Audit lanjutan: 670 QC lama tanpa ownerUid

## Hasil read-only audit pertama (dari Cloud Shell pengguna, 11 November 2026)

- 670 record QC; **670 tanpa `ownerUid`**
- **18** tanpa `clientRevision`; **18** tanpa kedua field
- Semua record punya `formType` valid dan `inputtedBy` terisi
- **256** record memiliki referensi Drive; **143** memiliki HOLD
- 25 pengguna Firestore, **21** berstatus `APPROVED`, **4** tidak mempunyai `active: true` (bukan otomatis 4 pengguna nonaktif)
- 5 dokumen template role; semua memiliki `permissions.qc_records` dengan nilai yang didukung

## Script audit pemetaan berikutnya

```bash
cd ~/QC-Form-Web
git pull origin feature/firebase-auth-claims-supabase
node scripts/audit-qc-legacy-uid-mapping.mjs --read-only-confirmed
```

Script membaca Firestore **tanpa menulis** dan hanya menampilkan **jumlah**, bukan username, email, Firebase UID, path foto atau record ID. Ini membandingkan `qc_records.inputtedBy` dengan `users.username` (normalisasi huruf/kosong) dan menghitung kemungkinan kecocokan unik, ambigu atau tidak ditemukan. Ia juga menghitung kombinasi status `APPROVED` dan flag `active` untuk menghindari salah klasifikasi.

**Jangan** otomatis menetapkan `ownerUid` hanya karena username cocok: verifikasi jejak pembuat dan Firebase Auth diperlukan untuk migrasi yang dapat diaudit. Jangan mengubah semua akun yang tidak memiliki `active=true` menjadi aktif. Pastikan sistem benar-benar menegakkan status APPROVED dan revoked/disabled secara konsisten.

## Kenapa belum mengaktifkan backend foto?

Prototipe backend untuk foto Supabase memeriksa `photo.ownerUid === qcRecord.ownerUid`. Ini akan menolak seluruh data QC lama, bukan masalah pada upload Supabase. Untuk foto baru, server harus menggunakan identitas Firebase terverifikasi pada saat penyimpanan record. Untuk data lama, rancang pemetaan UID secara eksplisit dan jangan menghapus referensi Drive lama. Skema `clientRevision` dan ID HOLD stabil perlu diuji sebelum penyimpanan metadata.

Tidak ada commit ke `main`, penulisan Firestore atau deployment server pada tahap audit ini.
