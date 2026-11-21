# Cutover berikutnya — pertahankan foto historis Google Drive (22 November 2026)

## Keputusan yang tidak boleh dilanggar

- **Tidak ada ekspor, unduh massal, salin, migrasi, upload ulang, atau penghapusan foto QC historis dari Google Drive ke Supabase.**
- Pertahankan apa adanya `photoDriveUrl`, `scanReportDriveUrl`, dan `holdIntervals[].photoDriveUrl` (termasuk `downtimeList[].photoDriveUrl` bila ada) di dokumen Firestore dan pada laporan lama. Tidak ada rewrite ID, URL atau rekaman historis.
- Tidak ada impor ulang akun, QC, MP/DP/AP dan master data. Data tersebut **sudah ada** di Firestore `form-qc-unm`; lakukan hanya perbandingan read-only, audit koneksi, dan backup sebelum rilis.
- Hanya **upload foto baru** setelah cutover boleh memakai Supabase privat, melalui backend tepercaya, Firebase Auth dan permission. Ini bukan alasan mengubah foto yang sudah disimpan di Drive.
- Modul material gudang IN/OUT **ditunda**. Tidak mengaktifkan Google Cloud Billing, membuat project baru, mendeploy ke Hosting/Rules produksi atau menulis data live melalui tahap ini.

## Kondisi kode yang diperiksa

- `src/App.tsx` masih mempunyai `driveImageUrl` untuk foto utama, Scan Report, dan HOLD record historis non-`qc-v2-`.
- `src/qcOperationalPhotoManifest.mjs` memisahkan byte foto baru dari metadata dan `stripOperationalPhotoPayload` mempertahankan URL Drive.
- `src/api.ts` **masih menyediakan** pemanggilan Apps Script untuk login/register, `syncRecord`, `finalizeRecord`, administrasi, dan fallback Data QC. `src/qcNativePortalConfig.ts` memerlukan flag yang konsisten untuk mematikan jalur tersebut. Keberadaan jalur lama tidak berarti semua request saat ini menggunakannya; audit runtime browser setelah mode native aktif tetap diperlukan.
- Modul UAT browser + emulator dan bucket foto privat yang lulus pengujian bukan bukti bahwa backend itu sudah diterapkan pada alur produksi.
- `scripts/audit-qc-apps-script-dependencies.mjs` membutuhkan parser TypeScript. Kegagalan `AUDIT_PARSER_UNAVAILABLE` sebelumnya **tidak boleh dianggap sebagai lolos audit**.

## Satu gate singkat tanpa migrasi

```bash
cd ~/QC-Form-Web
git switch feature/firebase-auth-claims-supabase
git pull --ff-only origin feature/firebase-auth-claims-supabase
npm run test:cutover:drive-retention
```

Gate hanya menguji bahwa URL Drive asli masih utuh sesudah pemrosesan metadata, upload Supabase baru tidak menerima URL Drive sebagai file, laporan lama masih mengakses fallback Drive, dan kode Apps Script lama **masih terdeteksi sebagai blocker**. Semua pemeriksaan offline, tanpa Firebase Emulator, Supabase key, Cloud Billing, atau write.

Hasil `SUCCESS` berarti **kontrak preservasi foto** lulus, **bukan** rilis produksi siap. Baris `RELEASE_STATUS: BLOCKED` adalah hasil yang diharapkan saat jalur Apps Script belum diputus.

## Syarat rilis yang masih harus dibuktikan

1. Jalur login yang di-host sudah memakai Firebase Auth dan pengguna aktif dapat masuk dengan izin yang benar, tanpa panggilan Apps Script.
2. QC, Planning, master dan histori membaca Firestore produksi yang ada; penyimpanan QC baru memakai endpoint tepercaya dan tetap menghasilkan audit serta Actual atomik, tanpa ketergantungan Spreadsheet.
3. Foto **baru** menggunakan Supabase privat dengan akses role; laporan historis Drive masih dapat dibuka secara alami, tanpa pemindahan.
4. Antrean browser lama, 717 QC, Planning, ekspor Excel dan rekonsiliasi record dibandingkan **read-only** sebelum perubahan; jangan overwrite metadata lama.
5. Backup, rollback dan izin deploy terverifikasi sebelum menerbitkan versi baru. Foto historis Drive tidak termasuk cakupan migrasi/rollback data.

**Status:** keputusan preservasi dan gate commit di branch fitur; bukan deployment atau migrasi produksi.
