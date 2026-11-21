# Tahap 21 — QC save dari portal React utama (delta browser, demo-only)

## Baseline yang sudah lulus
Screenshot Cloud Shell terbaru: 4/4 `test:cutover:native-browser` PASS, exit 0. Itu membuktikan login Firebase pada portal React utama, pembacaan identitas/role Firestore Emulator, pencabutan role, dan tanpa akses keluar ke Apps Script, Supabase, atau Firebase produksi selama skenario tersebut. **Belum membuktikan penyimpanan QC.**

## Perubahan tahap ini
- Skrip terpisah `scripts/test-qc-native-operational-save-browser.mjs` menjalankan entrypoint React utama `src/main.tsx`, akun Owner sintetis di Firebase Auth/Firestore demo, dan memanggil **modul queueFormSession pada `src/qcOperationalFormBridge.ts` yang sama dengan formulir Spray/Fertilizer**. Tidak memakai halaman UAT terisolasi.
- Simpan satu record Spray sintetis `qc-v2-uat-native-save-1`, revisi `uat-revision-one` dengan PNG 1-piksel; `VITE_QC_LOCAL_UAT=true` memaksa upload foto ke **Cache Storage lokal browser** (tidak mengakses Supabase).
- Periksa satu job IndexedDB `qc_operational_queue_v1` yang belum menulis QC/Actual; kemudian `flushOperationalQc` (adaptor produksi yang sama) membuat satu transaksi Firestore Emulator yang menulis `qc_records`, `daily_reports/qcactual_...`, dan immutable `qc_operational_audit`. Verifikasi status, revisi, manifest foto, Actual 1,5 Ha, dan audit. Retry antrean kosong tidak menulis duplikasi.
- Guard Playwright mengizinkan HTTP(S) hanya Vite loopback, Auth emulator dan Firestore emulator; log test gagal jika menyentuh Apps Script, Supabase live, atau Firebase produksi.
- **Ini tes form bridge + save adapter**, belum simulasi klik/mengisi semua input QC di UI manual, dan bukan konfirmasi upload Supabase asli.
- Script tidak mengubah file Rules, akun, proyek atau data produksi. Foto historis Drive **tidak disalin, ditimpa, dihapus, atau ditulis ulang**.

## Koreksi setelah log Cloud Shell (22 November 2026)
- Gate awal tidak mencapai transaksi QC. Browser gagal melakukan `import('/src/qcOperationalFormBridge.ts')` karena Vite dikonfigurasi dengan `base:'/react/'`; URL modul yang benar adalah `/react/src/qcOperationalFormBridge.ts`. Pemanggilan modul adaptor dan cache foto dalam skrip pengujian juga telah diperbaiki ke root `/react/src/`.
- Tambahan preflight mengambil URL modul yang sudah ditransformasi Vite, menolak HTTP gagal/HTML fallback, dan memberi error `VITE_NATIVE_BRIDGE_MODULE_UNAVAILABLE` bila jalur berubah.
- Perbaikan hanya menyentuh skrip browser UAT, tidak mengubah kode aplikasi utama, Firestore Rules, database, akses foto Google Drive, bucket Supabase, atau data produksi.
- **Belum ada klaim empat tes lulus** sampai gate di bawah dijalankan ulang di Cloud Shell.

## Satu perintah Cloud Shell
```bash
cd ~/QC-Form-Web
git switch feature/firebase-auth-claims-supabase
git pull --ff-only origin feature/firebase-auth-claims-supabase
npm run test:cutover:native-qc-save
```

Hanya 4 skenario baru (queue, atomic QC/Actual/audit + foto cache, retry tanpa duplikasi, zero live egress), ditambah satu pemeriksaan sumber singkat. Tidak mengulang gate login 4/4 yang sudah lulus, tidak membutuhkan secret Supabase, dan otomatis memulai/menutup emulator. Playwright menggunakan `QC_UAT_PLAYWRIGHT_DIR` bila tersedia, atau lokasi Cloud Shell `~/qc-uat-playwright`.

Bila berhasil:
```text
PASS: actual SprayForm bridge persists synthetic QC and photo change in account-scoped IndexedDB
PASS: actual operational adapter atomically writes QC, Actual and immutable revision audit
PASS: empty retry never duplicates committed QC, Actual, audit or queue job
PASS: zero Apps Script, production Firebase or live Supabase egress during QC save
SUCCESS: 4 native operational QC queue, photo-cache, atomic Firestore and egress browser checks passed (DEMO ONLY, NO LIVE UPLOAD)
```

## Release blockers sesudah gate
1. Backend Supabase produksi untuk **foto baru** dan akses signed photo perlu dibuktikan cocok dengan adaptor portal React, termasuk keamanan upload/role dan retry tanpa duplikasi; gate ini sengaja tidak menghubungi Storage.
2. UAT form Spray & Fertilizer dengan seluruh field, shift, Multi-Paddock, HK, NK/DAP, QC Draft/Ready/Uploaded harus dilakukan pada portal nyata. Gate ini hanya menguji **form bridge + adaptor Spray sintetis**.
3. Kecocokan ekspor Excel/report lama, data QC/Plan/Master yang sudah ada di Firestore, backup/rollback, serta Hosted egress/no Apps Script masih harus diperiksa sebelum deploy.
4. Foto historis Google Drive tetap di Drive, **tidak dimigrasi**. Modul gudang IN/OUT ditunda. Tidak ada Cloud Billing, project baru, perubahan Hosting atau Rules produksi.

Status: kandidat pengujian sudah di-commit; **belum dieksekusi di Cloud Shell pengguna**. Rilis tetap `BLOCKED` hingga gate yang sesuai selesai.
