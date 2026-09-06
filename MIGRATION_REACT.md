# Migrasi React + TypeScript + Vite

Cabang `migrate/react-typescript-vite` dibuat sebagai jalur migrasi aman dari frontend lama di `public/`.

## Prinsip migrasi

- `Code.gs` tidak diubah.
- Google Spreadsheet tetap menjadi sumber data operasional.
- Endpoint Apps Script lama tetap digunakan.
- Format token sesi, role, Record ID, dan record lama tidak diubah.
- Frontend produksi di `main` tetap utuh sampai migrasi selesai dan diuji.

## Sudah dimigrasikan

- Toolchain React + TypeScript + Vite.
- Client API Apps Script bertipe (`src/api.ts`).
- Model data dasar (`src/types.ts`).
- Login dan registrasi.
- Validasi sesi melalui endpoint `me`.
- Logout.
- Dashboard ringkas.
- Monitoring record dari endpoint `records`.
- Filter jenis dan pencarian record.
- Pengaturan URL deployment Apps Script.
- Firebase Hosting diarahkan ke output Vite `dist/` pada cabang migrasi.

## Belum dipindahkan sebelum cabang boleh digabung ke `main`

- Form Spraying lengkap beserta seluruh dependency Activity → Deskripsi → Paddock → Variety.
- Form Fertilizer lengkap termasuk multiple pengisian.
- Perhitungan bahan, adjuvant, water rate, dan estimated/actual usage.
- Upload foto QC.
- Draft lokal, offline queue, dan sinkronisasi otomatis.
- PWA/service worker versi Vite.
- Halaman Users/approval.
- Activity Logs.
- Edit/delete record dengan semua pembatasan role di UI.
- Dashboard operasional setara versi lama.
- Pengujian regresi seluruh 52 kolom Spray dan 23 kolom Fertilizer.

## Menjalankan lokal

```bash
npm install
npm run dev
```

Build produksi:

```bash
npm run build
firebase deploy --only hosting
```

> Jangan deploy cabang migrasi ke hosting produksi sebelum seluruh item parity di atas selesai diuji. Backend server tetap menjadi sumber otorisasi; pembatasan UI React bukan pengganti validasi role di `Code.gs`.
