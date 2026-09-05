# QC Form Web v46

PWA input Quality Control untuk kegiatan **Spraying** dan **Fertilizer** PT. Global Papua Abadi. Spreadsheet `Application QC Form` tetap menjadi sumber data operasional. Frontend berada hanya di `public/`; file `index.html` di root sekadar mengarahkan GitHub Pages ke aplikasi yang sama.

## Perbaikan utama v46

- Autentikasi diverifikasi oleh Apps Script, bukan `localStorage`.
- Kata sandi disimpan sebagai salted SHA-256 hash; akun lama dimigrasikan otomatis setelah login berhasil.
- Semua aksi privat menggunakan token sesi 6 jam dan validasi role di server.
- Draft offline disimpan di perangkat lalu dikirim otomatis saat koneksi kembali.
- Owner/Asisten/Manager dapat membaca data lintas perangkat dari `Cloud_Monitoring`.
- Upload final mendukung auto-split HOLD Spraying dan multiple pengisian Fertilizer.
- Header foto dan Record ID ditambahkan tanpa menghapus data lama.
- `firebase.json` disimpan di repositori, sehingga deploy tidak lagi bergantung pada file lokal Cloud Shell.
- Service Worker memakai cache bernomor versi dan tidak menggagalkan seluruh instalasi bila satu aset gagal.

## Instalasi backend (wajib lebih dulu)

1. Buka spreadsheet **Application QC Form** → **Extensions → Apps Script**.
2. Ganti isi `Code.gs` dengan file [`Code.gs`](./Code.gs).
3. Di **Project Settings**, aktifkan manifest dan samakan dengan [`appsscript.json`](./appsscript.json) bila diperlukan.
4. Jalankan fungsi `setupSystem()` satu kali dan setujui izin Spreadsheet/Drive.
5. **Deploy → Manage deployments → Edit → New version → Deploy**. Pertahankan deployment lama agar URL `/exec` tidak berubah.
6. Pilih **Execute as: Me** dan akses **Anyone**.

`setupSystem()` hanya menambah/merapikan header serta sheet sistem. Fungsi ini tidak menghapus baris data.

### Akun lama

Kolom `Password` lama masih bisa dipakai satu kali. Saat login sukses, nilainya dikosongkan dan dipindahkan ke `PasswordHash` + `Salt`. Setelah seluruh akun aktif sudah login, pastikan tidak ada kata sandi plaintext tersisa.

Jika kata sandi Owner saat ini tidak diketahui, ubah sementara sel `Users!C2` melalui spreadsheet, login satu kali, lalu backend akan langsung mengubahnya menjadi hash. Jangan menyimpan kata sandi awal di kode atau dokumentasi publik.

## Deploy frontend

```bash
git pull
firebase deploy --only hosting
```

Firebase Hosting membaca konfigurasi root `firebase.json` dan menyajikan folder `public/`.

## Model role

| Role | Input | Edit | Hapus | User approval |
|---|---|---|---|---|
| Owner | Spray + Fertilizer | Ya | Ya | Ya |
| Asisten | Spray + Fertilizer | Ya | Ya | Tidak |
| Mandor Spraying | Spray | Data sendiri | Tidak | Tidak |
| Mandor Fertilizer | Fertilizer | Data sendiri | Tidak | Tidak |
| Admin / Manager | Tidak | Monitoring | Ya | Tidak |
| Pengunjung | Tidak | Tidak | Tidak | Tidak |

## Pemeriksaan lokal

```bash
node --check public/app.js
node --check public/sw.js
cp Code.gs /tmp/qc-code.js && node --check /tmp/qc-code.js
python3 tests/static_check.py
```

Jangan commit credential, kata sandi, export spreadsheet, atau foto QC ke repositori.
