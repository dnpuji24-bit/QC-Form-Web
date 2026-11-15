# UAT browser cutover QC

Target pengujian adalah Firebase `daily-plan-and-report-unm`, database Firestore
`dailyplan`, dan Supabase `tcmtqgbpafwciaflgsaa` dengan bucket privat `qc-photos-uat`.
Gunakan akun dan data sintetis yang ada di staging. Jalur produksi tetap memakai
konfigurasi sebelumnya.

## Siapkan staging sekali

- Di Firebase staging, siapkan Hosting, Web App, dua akun Email/Password
  terverifikasi beserta profil aktif di `users/{uid}` dengan email dan UID yang
  cocok. Gunakan Owner pengujian untuk Spraying, Data QC dan Actual. Beri akun
  kedua role `pengunjung` dengan template `role_access/pengunjung` tanpa izin
  Data QC. Siapkan satu Daily Plan, paddock, unit dan master yang sesuai dengan
  Spraying di `dailyplan`. Pakai label unik, misalnya `UAT-CUTOVER-01`.
- Pastikan database staging memakai rules dan indeks calon rilis. Jika perlu,
  jalankan blok berikut dari root repo. Ini mengubah database staging bernama
  `dailyplan`.

```bash
(
  set -euo pipefail
  qc_config=$(mktemp -p . .firebase-uat.XXXXXX.json)
  trap 'rm -f -- "$qc_config"' EXIT
  printf '%s\n' '{"firestore":[{"database":"dailyplan","rules":"firestore.rules","indexes":"firestore.indexes.json"}]}' >"$qc_config"
  npx --yes firebase-tools deploy --project daily-plan-and-report-unm \
    --config "$qc_config" --only firestore:rules,firestore:indexes
)
```

- Buat environment GitHub Actions `qc-uat`. Isi variable
  `QC_UAT_FIREBASE_API_KEY` dan `QC_UAT_FIREBASE_APP_ID` dari Web App staging.
  Isi `QC_UAT_RECAPTCHA_ENTERPRISE_SITE_KEY` jika memakai App Check di browser.
  Isi secret `QC_UAT_FIREBASE_HOSTING_SERVICE_ACCOUNT` dengan kredensial akun
  yang diberi akses Firebase Hosting di staging. Jalankan **Firebase Hosting
  Preview** secara manual pada branch fitur dan ambil URL dari ringkasan job.
  Workflow hanya mengirim direktori React ke channel `qc-cutover`.
- Runtime kedua Edge Functions memakai akun staging yang sudah ada,
  `qc-signer-uat@daily-plan-and-report-unm.iam.gserviceaccount.com`. Akun ini
  perlu `roles/firebaseauth.viewer`, `roles/datastore.viewer`, dan
  `roles/serviceusage.serviceUsageConsumer` pada staging. Masukkan kredensial
  JSON akun tersebut melalui Supabase Edge Function Secrets di proyek UAT
  dengan nama `GOOGLE_SERVICE_ACCOUNT_JSON`. Simpan kredensial di server.
  Atur `QC_OPERATIONAL_PHOTO_ALLOWED_ORIGIN` ke origin preview persis tanpa
  `/react/` atau trailing slash, lalu `QC_OPERATIONAL_PHOTO_ENABLED=true`.
  Tambahkan domain preview ke konfigurasi staging jika pembatasan Auth, API key,
  atau App Check mengharuskannya.
- Skrip smoke membaca QC dan Actual dari Firestore REST memakai ID token staging.
  Jika staging menerapkan App Check untuk Firestore, jalankan verifikasi
  QC/Actual melalui sesi browser yang punya App Check atau atur lingkungan UAT
  yang mendukung panggilan REST tersebut. Pertahankan pengaturan produksi.

Dari root checkout GitHub, login ke Supabase CLI lalu jalankan:

```bash
(
  set -euo pipefail
  qc_uat_ref=tcmtqgbpafwciaflgsaa
  supabase functions deploy qc-photo-upload-uat --project-ref "$qc_uat_ref" --no-verify-jwt
  supabase functions deploy qc-photo-sign-uat --project-ref "$qc_uat_ref" --no-verify-jwt
  supabase functions list --project-ref "$qc_uat_ref"
)
```

Gateway Supabase melewatkan token Firebase ke handler. Handler memverifikasi
tanda tangan, issuer, audience, status akun dan izin sebelum mengakses bucket.

## Jalankan satu uji browser

Di desktop yang memiliki Node.js dan browser grafis, buka terminal pada checkout
repo. Perintah ini menginstal Playwright secara lokal tanpa mengubah lockfile.
Gunakan URL preview yang ditampilkan GitHub, akhiri dengan `/react/`.

```bash
npm install --no-save --package-lock=false playwright
npx playwright install chromium
node scripts/test-qc-hosted-uat.mjs 'URL-PREVIEW-DARI-GITHUB/react/'
```

Ikuti petunjuk terminal. Login akun berizin, pilih Daily Plan sintetis dan satu
foto utama, isi Actual 1 Ha, klik **Simpan Semua Unit**, lalu **Upload** pada Data QC.
Tekan Enter ketika row sudah Uploaded. Setelah skrip memuat ulang, buka
**Laporan**. Masuk sebagai akun tanpa izin pada browser kedua yang dibuka skrip.
Skrip memeriksa bucket respons, status dan relasi dokumen QC/Actual, unduhan
foto baru setelah reload, gambar yang berhasil didekode di Laporan, dan
penolakan 403 untuk akun kedua. Permintaan Apps Script atau produksi yang
terdeteksi membuat tes gagal.

Simpan keluaran PASS. Gunakan record dan objek sintetis untuk pembersihan di
staging setelah bukti dicatat. UAT ini menutup alur foto/QC. Sebelum rilis live,
endpoint foto dan admin operasional tetap perlu tersedia pada target live,
dan antrean lama harus diselesaikan sebelum writer Apps Script ditutup.
