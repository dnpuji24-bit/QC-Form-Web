# Migrasi React + TypeScript + Vite

Cabang `migrate/react-typescript-vite` dibuat sebagai jalur migrasi aman dari frontend lama di `public/`.

## Prinsip migrasi

- `Code.gs` tidak diubah.
- Google Spreadsheet tetap menjadi sumber data operasional.
- Endpoint Apps Script lama tetap digunakan.
- Format token sesi, role, Record ID, dan record lama tidak diubah.
- Frontend lama tetap tersedia di `/` selama masa migrasi.
- Frontend React dibangun paralel di `/react/` untuk pengujian sebelum cutover.

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
- Build Vite diarahkan ke `public/react/` dengan base path `/react/`.
- Firebase Hosting tetap menyajikan `public/`, sehingga frontend lama di `/` tidak terganggu.

## Belum dipindahkan sebelum frontend React boleh menggantikan versi lama

- Form Spraying lengkap beserta seluruh dependency Activity → Deskripsi → Paddock → Variety.
- Form Fertilizer lengkap termasuk multiple pengisian.
- Perhitungan bahan, adjuvant, water rate, dan estimated/actual usage.
- Upload foto QC.
- Draft lokal, offline queue, dan sinkronisasi otomatis.
- PWA/service worker versi React.
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

Build React paralel:

```bash
npm run build
```

Hasil build berada di `public/react/`. Setelah itu Firebase Hosting dapat dideploy seperti biasa:

```bash
firebase deploy --only hosting
```

URL lama tetap `/`, sedangkan build React tersedia di `/react/`.

> Jangan menjadikan `/react/` sebagai frontend utama sebelum seluruh item parity di atas selesai diuji. Backend server tetap menjadi sumber otorisasi; pembatasan UI React bukan pengganti validasi role di `Code.gs`.
