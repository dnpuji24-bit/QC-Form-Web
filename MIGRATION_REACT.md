# Migrasi React + TypeScript + Vite

Cabang `migrate/react-typescript-vite` adalah jalur migrasi aman dari frontend lama di `public/`.

## Prinsip
- Frontend lama tetap di `/`; React berjalan paralel di `/react/`.
- Google Spreadsheet tetap menjadi sumber data operasional.
- Form QC Spray tetap 52 kolom dan Form QC Fertilizer tetap 23 kolom.
- Otorisasi final selalu di backend Apps Script.

## Sudah dimigrasikan
- React + TypeScript + Vite.
- Auth/session/login/register/logout.
- API client bertipe.
- PWA React scope `/react/` + offline queue/auto-sync.
- Monitoring Data QC, edit/delete sesuai role, finalize/upload.

### Form Spraying
- Luas Aktual manual; luas Plan tidak mengisi/reset form.
- Activity → Deskripsi → Type → Paddock → Variety.
- Unit/No Unit multi-select.
- Pesticide 1–4, estimated usage otomatis, actual usage.
- Adjuvant estimated usage otomatis.
- HOLD, Working/Effective Working, foto utama/foto HOLD.
- Edit draft, upload/finalize, offline queue.
- Regression checker 52 kolom.

### Form Fertilizer
- Daily Session unit-centric dengan banyak Unit Card.
- `sessionId` mengelompokkan banyak unit tanpa mengubah Record ID per unit.
- Edit seluruh session bersama dan upload seluruh unit dalam session.
- Per Pengisian: Dosis Target, Hose, Jenis Pupuk, Jumlah, Hasil Kerja, Dosis Aktual otomatis, Meratakan Pupuk.
- Duplicate Unit Card dan Tambah Pengisian cepat.
- Downtime/Issue tersimpan dalam JSON dan diringkas ke Catatan saat final upload.
- Foto QC, offline queue, backward-compatible backend `writeFertilizer_` v46.1.
- Tombol Foto Laporan disiapkan untuk OCR masa depan.
- Regression checker 23 kolom + session grouping.

### Users & Approval
- Menu Users hanya tampil untuk `owner`.
- Daftar pending/approved user.
- Owner dapat memilih role lalu Approve/Reject.
- Menggunakan endpoint backend `users`, `approveUser`, dan `rejectUser` yang sudah ada.
- Backend tetap membatasi endpoint Users/approval hanya untuk Owner.

### Activity Logs
- Menu Activity Logs tampil untuk `owner`, `manager`, `admin`, dan `asisten`.
- Menampilkan Timestamp, User, Role, ActionType, Description, dan IP/Device.
- Search/filter teks pada audit trail.
- Menggunakan endpoint backend `logs` yang sudah ada.

### Dashboard Operasional
- Filter Semua/Spraying/Fertilizer dan pencarian paddock/unit/activity/mandor.
- KPI Total record, Uploaded, Draft/Queue, Paddock aktif.
- KPI Spray Area, Fertilizer Area, Pupuk tercatat, Unit Fertilizer.
- Rekap per Activity: jumlah record, area, uploaded, progress upload.
- Ringkasan jumlah baris Plan dan total luas Plan hanya sebagai referensi; tidak memengaruhi Luas Aktual Form Spray.
- Dashboard tersedia untuk seluruh user yang berhasil login; visibilitas data tetap mengikuti hasil endpoint `records` dari backend.

### Navigasi berdasarkan role
- Owner: Dashboard, Spray, Fertilizer, Data QC, Users, Activity Logs, Pengaturan.
- Asisten: Dashboard, Spray, Fertilizer, Data QC, Activity Logs, Pengaturan.
- Manager/Admin: Dashboard, Data QC, Activity Logs, Pengaturan.
- Mandor Spraying: Dashboard, Input Spraying, Data QC, Pengaturan.
- Mandor Fertilizer: Dashboard, Input Fertilizer, Data QC, Pengaturan.
- Pengunjung: Dashboard, Data QC, Pengaturan.

## Regression checks
```bash
python3 tests/spray_react_mapping_check.py
python3 tests/fertilizer_react_mapping_check.py
python3 tests/admin_dashboard_react_check.py
```

## Masih wajib sebelum cutover
- `npm install`
- `npm run typecheck`
- `npm run build`
- Runtime/regression test dengan backend Apps Script aktual.
- Uji role Owner/Manager/Admin/Asisten/Mandor Spraying/Mandor Fertilizer/Pengunjung.
- Uji offline → reconnect → sync serta upload foto di perangkat lapangan.
- Setelah seluruh parity lolos, baru pertimbangkan mengganti `/` dengan React.

Tahap fitur utama React sekarang mencakup Spraying, Fertilizer, Users/Approval, Activity Logs, dan Dashboard operasional. Fokus berikutnya adalah verifikasi build/runtime dan hardening sebelum cutover produksi.

> Jangan merge/cutover ke produksi sebelum build dan runtime test berhasil. Backend Apps Script tetap menjadi sumber otorisasi dan Spreadsheet tetap menjadi sumber data utama.
