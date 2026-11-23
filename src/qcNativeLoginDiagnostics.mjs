// Never display raw Firebase errors: they may contain email, API keys or request details.
// Display only a verified error code and a fixed, actionable message.
const descriptions={
  'auth/invalid-credential':'Email atau password tidak cocok. Periksa data login dan gunakan metode pemulihan akun jika diperlukan.',
  'auth/wrong-password':'Email atau password tidak cocok. Periksa data login dan gunakan metode pemulihan akun jika diperlukan.',
  'auth/user-not-found':'Email atau password tidak cocok. Periksa data login dan gunakan metode pemulihan akun jika diperlukan.',
  'auth/invalid-login-credentials':'Email atau password tidak cocok. Periksa data login dan gunakan metode pemulihan akun jika diperlukan.',
  'auth/invalid-email':'Format email tidak valid.',
  'auth/missing-password':'Password belum diisi.',
  'auth/too-many-requests':'Firebase membatasi percobaan login sementara. Jangan mencoba berulang-ulang; ikuti proses pemulihan akun bila diperlukan.',
  'auth/user-disabled':'Akun Firebase Authentication dinonaktifkan. Owner perlu memeriksa status akun melalui konsol Firebase.',
  'auth/network-request-failed':'Permintaan ke Firebase gagal karena koneksi atau pemblokiran jaringan. Periksa jaringan, VPN, dan domain Google/Firebase yang diizinkan.',
  'auth/operation-not-allowed':'Metode login email/password belum diaktifkan dalam Firebase Authentication.',
  'auth/unauthorized-domain':'Domain halaman belum diizinkan untuk autentikasi Firebase.',
  'auth/invalid-api-key':'Konfigurasi Firebase Authentication tidak valid.',
  'auth/app-not-authorized':'Aplikasi web belum diizinkan menggunakan Firebase Authentication.',
  'auth/app-check-token-is-invalid':'Verifikasi keamanan aplikasi Firebase gagal. Periksa konfigurasi App Check dan domain browser.',
  'auth/invalid-app-credential':'Verifikasi keamanan Firebase gagal. Periksa konfigurasi App Check dan domain browser.',
  'auth/internal-error':'Firebase Authentication mengembalikan kesalahan internal. Periksa status layanan dan ulangi setelah koneksi normal.',
  'auth/web-storage-unsupported':'Browser memblokir penyimpanan sesi Firebase. Periksa pengaturan privasi atau gunakan profil browser biasa.'
}
export function safeFirebaseLoginMessage(error){
 const code=typeof error?.code==='string'?error.code:''
 if(Object.hasOwn(descriptions,code))return descriptions[code]+' (Kode: '+code+')'
 if(code.startsWith('auth/')&&/^auth\/[a-z0-9-]{1,70}$/.test(code))
   return 'Firebase Authentication menolak permintaan. Sampaikan kode berikut untuk pemeriksaan lebih lanjut: '+code
 if(error?.message==='QC_NATIVE_CONFIG_INVALID')return 'Konfigurasi portal Firebase belum lengkap. Hubungi administrator.'
 return 'Login belum berhasil. Kesalahan belum dapat diklasifikasikan. Periksa koneksi lalu hubungi administrator; jangan kirim password.'
}
export function safeFirebaseProfileMessage(error){
 const code=typeof error?.code==='string'?error.code:''
 const cause=typeof error?.message==='string'?error.message:''
 if(code==='permission-denied'||code==='firestore/permission-denied')
   return 'Firebase Authentication mungkin sudah menerima login, tetapi Firestore menolak akses profil. Periksa status pengguna Owner dan Firestore Rules. (Kode: permission-denied)'
 if(code==='unavailable'||code==='firestore/unavailable')
   return 'Firebase Authentication aktif, tetapi profil Firestore tidak dapat diakses karena layanan/koneksi belum tersedia. (Kode: unavailable)'
 if(cause==='AUTH_PROFILE_NOT_APPROVED')
   return 'Akun Firebase dikenali, tetapi profil aplikasi belum aktif atau belum disetujui. Periksa field active dan status di Firestore /users.'
 if(cause==='AUTH_PROFILE_IDENTITY_MISMATCH')
   return 'Akun Firebase dikenali, tetapi UID/email tidak cocok dengan profil Firestore. Perlu pemeriksaan Owner tanpa mengubah data.'
 if(cause==='AUTH_PROFILE_INVALID')
   return 'Akun Firebase dikenali, tetapi struktur role atau profil Firestore tidak valid.'
 if(cause==='AUTH_SESSION_CHANGED'||cause==='AUTH_REQUIRED')
   return 'Sesi Firebase berubah saat memverifikasi profil. Ulangi login dengan akun yang benar.'
 return 'Sesi Firebase telah terbentuk, tetapi profil aplikasi belum dapat dikonfirmasi. Periksa koneksi dan izin Firestore; jangan hapus data browser.'
}
