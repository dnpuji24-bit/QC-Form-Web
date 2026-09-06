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
- Login, registrasi, validasi sesi, logout.
- Dashboard ringkas dan monitoring record.
- Filter jenis dan pencarian record.
- Pengaturan URL deployment Apps Script.
- Build Vite diarahkan ke `public/react/` dengan base path `/react/`.
- Firebase Hosting tetap menyajikan `public/`, sehingga frontend lama di `/` tidak terganggu.

### Form Spraying React

- Common field lengkap dengan **Luas Aktual manual**; luas Plan tidak mengisi atau mereset field ini.
- Activity → Deskripsi → Type → Paddock → Variety.
- Unit/No. Unit multi-select, Dropper, Nozzle, Droplet Size, Height, Row Spacing, Speed.
- Pesticide 1–4 otomatis berdasarkan Deskripsi.
- Estimated Usage pestisida otomatis = dosis/Ha × Luas Aktual.
- Estimated Usage adjuvant otomatis = dosis mL/L × Water Rate × Luas Aktual ÷ 1.000.
- Actual Usage pestisida/adjuvant, Water Rate/Quality, kondisi cuaca.
- HOLD berulang, validasi interval, Working/HOLD/Effective Working.
- Foto QC utama dan foto per HOLD dengan kompresi sebelum dikirim ke backend Drive.
- Offline queue + auto-sync.
- Finalize/upload melalui endpoint `finalizeRecord`.
- Edit draft Spraying mempertahankan Record ID yang sama dan foto lama jika foto baru tidak dipilih.
- Mandor Spraying hanya dapat mengedit draft miliknya sendiri; Owner/Asisten dapat mengedit draft Spraying yang dapat mereka akses.
- Record `uploaded` tidak dibuka untuk edit langsung.
- Delete mengikuti role backend: Owner/Manager/Admin/Asisten. Delete hanya saat online dan membersihkan antrean offline stale agar record tidak muncul kembali.
- Regression checker `tests/spray_react_mapping_check.py` untuk mapping 52 kolom dan jalur utama Spraying.

### PWA / Offline React

- Manifest: `public/react/manifest.webmanifest`.
- Service worker: `public/react/sw.js` dengan scope hanya `/react/` agar tidak mengganggu aplikasi lama.
- Shell dan asset React yang pernah dimuat dicache untuk pembukaan offline berikutnya.
- Data form tetap memakai `src/offline.ts`; perubahan disimpan dalam antrean ketika jaringan terputus dan dikirim lagi saat online.
- Finalize menghapus antrean draft stale untuk Record ID yang sama.
- Delete membersihkan seluruh antrean untuk Record ID yang dihapus.

## Belum dipindahkan sebelum frontend React boleh menggantikan versi lama

- Form Fertilizer lengkap termasuk multiple pengisian.
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
