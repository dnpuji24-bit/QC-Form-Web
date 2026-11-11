# Tahap berikut — dry-run migrasi identitas QC lama (tanpa perubahan produksi)

## Temuan yang sudah diketahui
Audit user yang sudah dijalankan:
- 670 record QC; 662 cocok unik dengan akun Firestore yang aktif dan APPROVED; 8 record tanpa kecocokan, 0 ambigu.
- Semua 670 record masih belum punya `ownerUid`; 18 record tidak punya `clientRevision`.
- 25 pengguna, 21 aktif dan 4 nonaktif.

## Mengapa belum ada penulisan ownerUid
Kecocokan `inputtedBy` dengan `users.username` adalah indikator, **bukan bukti identitas penulis historis**. Integrasi ke Firebase Auth perlu memastikan dokumen `users/{uid}` benar-benar terkait akun yang ada di Authentication. Bahkan setelah cocok, kepemilikan record historis perlu konfirmasi dari jejak pembuat/audit sebelum migrasi.

## Yang ditambahkan pada branch pengembangan
- `scripts/lib/qcLegacyMigrationTriage.mjs`: model keputusan fail-closed, tanpa fungsi tulis.
- `scripts/test-qc-legacy-migration-triage.mjs`: 11 tes untuk pencocokan unik, tidak cocok, ambigu, akun nonaktif, Firebase Auth mismatch, tidak ada revisi, dan record yang sudah punya UID.
- Keputusan `MANUAL_PROVENANCE_REQUIRED` berarti kandidat kuat **belum diizinkan langsung ditulis**. Delapan yang tidak cocok akan ditandai `REVIEW`, bukan diisi UID tebakan.

## Cara uji aman di Cloud Shell
```bash
cd ~/QC-Form-Web
git pull origin feature/firebase-auth-claims-supabase
node scripts/test-qc-legacy-migration-triage.mjs
node scripts/audit-qc-auth-uid-consistency.mjs --read-only-confirmed
```

Perintah pertama 100% lokal dan tidak mengakses jaringan. Perintah kedua hanya membaca Firebase Authentication dan Firestore produksi, menampilkan hitungan anonim agregat dan menggunakan kuota baca. Tidak ada `setDoc`, `update`, `delete`, ataupun penulisan akun oleh kedua script tersebut. Jangan bagikan service account key atau token login.

## Gerbang sebelum migrasi data asli
1. Hasil audit Auth menunjukkan kesesuaian UID, akun tidak disabled, dan email (jika tersedia) konsisten.
2. Verifikasi sumber sejarah/jejak audit untuk 662 record unik; 8 tanpa padanan tetap masuk daftar pengecualian.
3. Persiapkan strategi 18 record yang tanpa revisi, tanpa mengubah data lain.
4. Backup terverifikasi dan manifest perubahan, transaksi conditional/idempotent, rollback rencana per record dan laporan pascamigrasi.
5. Tes semua alur foto dan Firestore Rules di emulator serta akun testing; backend produksi belum di-deploy.
6. Setelah ada persetujuan eksekusi migrasi, lakukan batch kecil dan verifikasi; jangan membuat penulisan massal tanpa prasyarat.

Data foto Google Drive historis dan Spreadsheet tidak boleh dihapus pada tahap ini. Permission Data QC tetap sesuai pilihan Owner: semua pengguna aktif dengan `view` atau `edit` dapat melihat seluruh foto; `none` tidak.
