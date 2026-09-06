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

CI terbaru sudah lolos regression checks, TypeScript typecheck, dan Vite production build.

## Runtime smoke test Apps Script

Smoke test nyata ke deployment Apps Script ditambahkan melalui `tests/runtime_smoke.mjs`.

Hasil public smoke sebelumnya:
- `health`: PASS
- `masterData`: PASS
- invalid session/token rejection: PASS
- deployment aktif sebelumnya melaporkan **API v46.0.0**

Pada 2026-09-06 backend kemudian dideploy ulang oleh Owner dengan `Code.gs` v46.1.0 pada deployment `/exec` yang sama dan repository secrets `SMOKE_OWNER_USERNAME` serta `SMOKE_OWNER_PASSWORD` sudah dikonfigurasi. Commit ini digunakan untuk memicu authenticated runtime smoke test baru dan memverifikasi versi backend aktif.

Authenticated Owner smoke test bersifat read-only dan otomatis berjalan jika repository Actions Secrets berikut tersedia:
- `SMOKE_OWNER_USERNAME`
- `SMOKE_OWNER_PASSWORD`

Test tersebut memeriksa login Owner, `me`, `records`, `users`, `logs`, dan logout. Credential tidak disimpan di source code dan tidak dicetak ke log.

## Sebelum merge / cutover

1. Verifikasi `health` deployment aktif melaporkan `v46.1.0`.
2. Jalankan authenticated Owner smoke test.
3. Lakukan smoke test write/finalize dengan data uji terkontrol untuk Spraying dan Fertilizer, termasuk foto Drive dan offline → online.
4. Uji role non-Owner agar permission backend sesuai.
5. Setelah seluruh runtime test lulus, baru pertimbangkan mengubah PR dari Draft dan melakukan cutover.

PR migrasi tetap Draft sampai langkah runtime di atas selesai.
