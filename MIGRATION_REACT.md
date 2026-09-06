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

- Common field: tanggal, shift, status, start/end time, mandor, asisten, unit multi-select, No. Unit multi-select, **Luas Aktual manual**.
- Nilai luas dari sheet Plan tidak digunakan untuk mengisi atau mereset Luas Aktual.
- Dependency program: Activity → Deskripsi → Type → Paddock → Variety.
- Dropper, Nozzle, Droplet Size, Height, Row Spacing, Speed.
- Pesticide 1–4 otomatis berdasarkan Deskripsi dari master Bahan.
- Estimated Usage pestisida otomatis = dosis/Ha × Luas Aktual.
- Actual Usage pestisida.
- Adjuvant, dosis mL/L, Estimated Usage adjuvant otomatis = dosis × water rate × luas ÷ 1.000, Actual Usage adjuvant.
- Water Rate, Water Quality, Actual Usage Air, Wind Speed, Temperature, Humidity, Delta T, Weather Condition.
- HOLD berulang dan validasi interval terhadap jam Working.
- Kalkulasi Working, total HOLD, dan Effective Working.
- Foto QC utama dan foto per HOLD, dikompresi sebelum dikirim ke backend.
- Catatan.
- Payload tetap memakai nama key lama (`pesticide1..4`, `dosage1..4`, `estUsagePesticide1..4`, `actUsagePesticide1..4`, `holdIntervals`, `photoBase64`, dan seterusnya).
- Penyimpanan menggunakan endpoint `syncRecord` yang sama dengan frontend lama.
- Offline queue React di `src/offline.ts`; record disimpan ke antrean saat jaringan putus dan otomatis dicoba kembali saat online.
- Finalize/upload dari halaman Data QC memakai endpoint `finalizeRecord`; bila offline, upload juga masuk antrean.
- Menu Input Spraying hanya tampil untuk `owner`, `asisten`, dan `mandor_spraying`; otorisasi final tetap divalidasi backend.
- Regression checker `tests/spray_react_mapping_check.py` memastikan 52 kolom, formula estimated usage, area manual, foto, dan offline path tetap terpetakan.

## Belum dipindahkan sebelum frontend React boleh menggantikan versi lama

- Edit/delete record dengan semua pembatasan role di UI.
- Form Fertilizer lengkap termasuk multiple pengisian.
- PWA/service worker versi React.
- Halaman Users/approval.
- Activity Logs.
- Dashboard operasional setara versi lama.
- Pengujian regresi 23 kolom Fertilizer.
- Pengujian build/runtime nyata (`npm run typecheck`, `npm run build`) sebelum cutover.

## Menjalankan lokal

```bash
npm install
npm run typecheck
python3 tests/spray_react_mapping_check.py
npm run build
npm run dev
```

Hasil build berada di `public/react/`. Setelah itu Firebase Hosting dapat dideploy seperti biasa:

```bash
firebase deploy --only hosting
```

URL lama tetap `/`, sedangkan build React tersedia di `/react/`.

> Jangan menjadikan `/react/` sebagai frontend utama sebelum seluruh item parity di atas selesai diuji. Backend server tetap menjadi sumber otorisasi; pembatasan UI React bukan pengganti validasi role di `Code.gs`.
