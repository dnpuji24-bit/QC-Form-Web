# Migrasi React + TypeScript + Vite

Migrasi dilakukan bertahap agar aplikasi operasional lama tetap aman.

## Prinsip utama

- `Code.gs` dan struktur Spreadsheet tetap menjadi backend/sumber data operasional.
- Endpoint Apps Script, token sesi, role, Record ID, dan format data tidak diubah oleh migrasi frontend.
- Aplikasi lama tetap berada di `/`.
- Build React ditempatkan di `/react/` untuk pengujian paralel sebelum cutover.

## Status migrasi

### Spraying

Sudah tersedia di React:
- field umum dan dependency Activity → Deskripsi → Type → Paddock → Variety
- luas aktual manual
- Unit / No. Unit
- Dropper, Nozzle, Droplet Size, Height, Row Spacing, Speed
- Pesticide 1–4 otomatis dari master material
- Estimated / Actual Usage
- Adjuvant dan perhitungan estimated usage
- Water Rate / Water Quality / Actual Usage
- kondisi cuaca
- HOLD berulang + validasi waktu
- foto QC utama dan foto HOLD
- draft/offline queue + auto sync
- edit draft
- finalize/upload
- role guard dan delete sesuai model backend
- regression check terhadap 52 kolom backend

### Fertilizer

Sudah tersedia di React:
- Daily Session berbasis `sessionId`
- multi Unit Card
- pengisian per unit
- dosis aktual otomatis
- downtime
- foto
- edit session
- upload seluruh session
- regression check struktur 23 kolom backend

### Administrasi dan monitoring

- Dashboard operasional dengan KPI, filter, rekap Activity, area Spray/Fertilizer, pupuk, unit, progress upload, dan Plan sebagai referensi.
- Users & Approval untuk Owner.
- Activity Logs untuk Owner/Manager/Admin/Asisten.
- indikator online/offline dan jumlah antrean lokal.

## UI / UX

Theme modern profesional disimpan terpisah di `src/theme.css` agar perubahan visual tidak mengganggu logika form. UI mencakup header/nav sticky, hierarchy yang lebih jelas, card/table/form yang bersih, Unit Card Fertilizer, dashboard hero, progress bar, status upload, focus state, dan responsive layout untuk desktop/mobile.

## CI dan regression checks

GitHub Actions `.github/workflows/react-ci.yml` menjalankan:

```bash
python tests/*_check.py
npm run typecheck
npm run build
node tests/runtime_smoke.mjs
```

Runtime smoke yang menyentuh backend hanya dijalankan pada push branch migrasi agar tidak terjadi double-run bersamaan dengan event pull request.

CI terbaru sudah lolos regression checks, TypeScript typecheck, dan Vite production build.

## Runtime smoke test Apps Script

Smoke test nyata ke deployment Apps Script tersedia melalui `tests/runtime_smoke.mjs`.

Backend aktif sudah diverifikasi sebagai **API v46.1.0**.

Authenticated Owner smoke test memeriksa:
- login Owner
- `me`
- `records`
- `users`
- `logs`
- logout

Controlled write/finalize smoke test juga sudah berhasil untuk:
- Spray draft sync
- Spray edit/upsert pada Record ID yang sama
- Spray finalize/upload
- Fertilizer Daily Session draft
- Fertilizer finalize dengan 2 pengisian
- cleanup melalui `deleteRecord`
- verifikasi record uji tidak tersisa di `Cloud_Monitoring`, `Form QC Spray`, dan `Form QC Fertilizer`

Seluruh controlled runtime smoke test terakhir berstatus **PASS**.

### Temuan schema saat smoke test

Smoke test menemukan dua schema lama yang belum mengikuti header v46.1:

1. `Users` sebelumnya hanya memiliki header lama sampai `Notes`. Header berikut kemudian ditambahkan tanpa mengubah data user yang ada:
   - `Email`
   - `PasswordHash`
   - `Salt`
   - `AllowedForm`
   - `UpdatedAt`

   Setelah header tersedia, password Owner berhasil dimigrasikan dari plaintext ke `PasswordHash + Salt` dan kolom plaintext kembali kosong.

2. `Cloud_Monitoring` sebelumnya menamai kolom L sebagai `PhotoLink`, padahal data JSON record lama memang berada di kolom L. Header diperbaiki menjadi:
   - L = `RecordJSON`
   - M = `PhotoLink`
   - N = `UpdatedBy`

   Tidak ada pemindahan record lama yang diperlukan karena isi JSON sudah berada di kolom yang benar; hanya header yang sebelumnya tidak sesuai.

Repository Actions Secrets yang digunakan:
- `SMOKE_OWNER_USERNAME`
- `SMOKE_OWNER_PASSWORD`

Credential tidak disimpan di source code dan tidak dicetak ke log.

## Sebelum merge / cutover

1. Runtime authenticated + controlled write/finalize smoke: **PASS**.
2. Masih perlu uji foto nyata ke Drive dan cleanup file foto test yang aman.
3. Masih perlu uji offline → online pada browser/device nyata.
4. Masih perlu uji role non-Owner agar permission backend sesuai untuk setiap role.
5. Setelah runtime device test di atas lulus, baru pertimbangkan mengubah PR dari Draft dan melakukan cutover.

PR migrasi tetap Draft sampai langkah runtime di atas selesai.
