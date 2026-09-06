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

### Form Spraying React

Sudah dipindahkan ke `src/SprayForm.tsx`:

- Common field: tanggal, shift, status, start/end time, mandor, asisten, unit multi-select, No. Unit multi-select, luas aktual.
- Dependency program: Activity → Deskripsi → Type → Paddock → Variety.
- Luas target otomatis dari Plan saat Paddock dipilih.
- Dropper, Nozzle, Droplet Size, Height, Row Spacing, Speed.
- Pesticide 1–4 otomatis berdasarkan Deskripsi dari master Bahan.
- Estimated Usage pestisida = dosis/Ha × luas aktual.
- Actual Usage pestisida.
- Adjuvant, dosis mL/L, Estimated Usage adjuvant, Actual Usage adjuvant.
- Water Rate, Water Quality, Actual Usage Air, Wind Speed, Temperature, Humidity, Delta T, Weather Condition.
- HOLD berulang dan validasi interval terhadap jam Working.
- Kalkulasi Working, total HOLD, dan Effective Working.
- Catatan.
- Payload tetap memakai nama key lama (`pesticide1..4`, `dosage1..4`, `estUsagePesticide1..4`, `actUsagePesticide1..4`, `holdIntervals`, dan seterusnya).
- Penyimpanan menggunakan endpoint `syncRecord` yang sama dengan frontend lama.
- Menu Input Spraying hanya tampil untuk `owner`, `asisten`, dan `mandor_spraying`; otorisasi final tetap divalidasi backend.

## Belum dipindahkan sebelum frontend React boleh menggantikan versi lama

- Upload foto QC utama dan foto per HOLD.
- Draft lokal, offline queue, dan sinkronisasi otomatis.
- Finalize/upload record dari halaman Data QC.
- Edit/delete record dengan semua pembatasan role di UI.
- Form Fertilizer lengkap termasuk multiple pengisian.
- PWA/service worker versi React.
- Halaman Users/approval.
- Activity Logs.
- Dashboard operasional setara versi lama.
- Pengujian regresi penuh mapping 52 kolom Spray dan 23 kolom Fertilizer.

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
