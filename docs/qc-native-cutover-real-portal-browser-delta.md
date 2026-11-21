# Tahap 20 — Browser gate portal React native yang sebenarnya (demo-only)

## Status sebelum gate
Cloud Shell sebelumnya menyatakan **3/3 PASS** pada `test:cutover:native-boundary` dan TypeScript PASS. Namun hasil itu hanya pemeriksaan kontrak offline. `RELEASE_STATUS: BLOCKED` tetap benar sampai portal sebenarnya dan backend cutover dipastikan.

## Cakupan perubahan tahap ini
- Pengujian memakai `src/main.tsx` **asli** → `NativePortalSession` → `PortalRouter` → `App`, bukan `uat-unified-portal-lab` atau halaman sintetis lain.
- Vite hanya dijalankan di `127.0.0.1:4387` dalam **mode lokal development** yang secara eksplisit mengaktifkan `VITE_QC_LOCAL_UAT=true`. Firebase web client terikat ke project `demo-qc-photo-test`; Auth emulator di `127.0.0.1:9099`, Firestore emulator di `127.0.0.1:8085`.
- Rules Firestore yang dibaca emulator adalah salinan file aturan repository saat ini, **tidak pernah di-deploy**. Pengujian mensyaratkan emulator Auth/Firestore kosong dan hanya membuat satu akun Owner sintetis, role template, dan dua baris master sintetis.
- Browser dimulai dengan sisa token login Apps Script dan URL konfigurasi lama di localStorage. `NativePortalSession` harus menghapus sesi lama, meminta Firebase Auth, membaca profil Owner yang approved beserta template permission dari Firestore, dan menampilkan menu portal asli.
- Setelah akun sintetis ditandai nonaktif di Firestore Emulator, proses verifikasi harus menutup portal tanpa fallback token Apps Script. Semua koneksi browser yang keluar dari localhost Vite, Auth emulator, Firestore emulator atau `data:` ditolak dan dicatat sebagai kegagalan.
- Tidak ada credential nyata, backend Supabase, Cloud Billing, Hosting, live Firestore, migrasi data maupun penyalinan foto.

## Satu command ringkas Cloud Shell
```bash
cd ~/QC-Form-Web
git switch feature/firebase-auth-claims-supabase
git pull --ff-only origin feature/firebase-auth-claims-supabase
npm run test:cutover:native-browser
```

Perintah ini memeriksa kontrak sumber ringkas dan menjalankan **4 skenario browser** pada portal React utama melalui Firebase demo emulators. Jangan jalankan emulator secara manual; wrapper akan memulai dan menghentikannya.

Jika berhasil, log akhir:
```text
PASS: actual native portal starts at Firebase login, never trusts old local session
PASS: demo Firebase Auth login reads approved Firestore identity and renders real portal
PASS: current role revocation removes native portal without legacy fallback
PASS: zero network egress to Apps Script, Supabase or production Firebase
SUCCESS: 4 real native React login, Firestore and egress demo browser checks passed (NO production)
```

**Status eksekusi:** browser/Cloud Shell belum dijalankan setelah commit. Kesuksesan syntax atau source check belum cukup untuk menyatakan PASS.

## Batasan rilis yang tetap berlaku
Tes ini tidak membuktikan bahwa backend trusted QC/Actual/foto produksi telah dipasang, bahwa penyimpanan QC baru telah berhasil dari portal React produksi, bahwa semua fitur MP/DP/AP dan Excel parity sudah diperiksa, atau bahwa ada zero Apps Script egress pada versi **yang sudah di-host**. Sebelum deploy perlu bukti backend yang dapat dipakai tanpa Cloud Billing, backup/rollback, akses Owner/role produksi, serta persetujuan rilis. Jangan mengaktifkan write produksi untuk tes ini.

Seluruh data QC, Planning, akun, Master **sudah berada di Firestore produksi** dan tidak boleh diimpor ulang. Foto historis di Google Drive tetap berada di sana; **jangan ekspor/impor/hapus atau menulis ulang URL**. Supabase privat hanya untuk foto baru setelah jalur backend benar-benar siap. Modul gudang tetap ditunda.
