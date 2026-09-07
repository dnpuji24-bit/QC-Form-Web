import { signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { firebaseAuth } from './firebase'

const STATUS_KEY='qc_firebase_auth_status'
const ERROR_KEY='qc_firebase_auth_error'

function describeAuthError(error:unknown){
  const raw=String((error as {code?:string;message?:string})?.code||(error as {message?:string})?.message||error||'')
  if(raw.includes('auth/invalid-credential'))return 'Email atau password Firebase Auth tidak cocok dengan akun QC.'
  if(raw.includes('auth/user-not-found'))return 'Akun email ini belum ada di Firebase Authentication.'
  if(raw.includes('auth/wrong-password'))return 'Password Firebase Auth berbeda dari password QC.'
  if(raw.includes('auth/invalid-email'))return 'Email pada akun QC tidak valid untuk Firebase Authentication.'
  if(raw.includes('auth/too-many-requests'))return 'Firebase Authentication memblokir percobaan sementara karena terlalu banyak login. Coba beberapa menit lagi.'
  if(raw.includes('auth/network-request-failed'))return 'Firebase Authentication gagal terhubung ke jaringan.'
  if(raw.includes('auth/operation-not-allowed'))return 'Provider Email/Password Firebase belum aktif.'
  return raw?`Firebase Auth gagal: ${raw}`:'Firebase Auth gagal tanpa detail error.'
}

export function getFirebaseBridgeStatus(){
  return {
    status:sessionStorage.getItem(STATUS_KEY)||'unknown',
    error:sessionStorage.getItem(ERROR_KEY)||'',
  }
}

export async function signInFirebaseBridge(email:string,password:string):Promise<boolean>{
  if(!firebaseAuth||!email||!password){
    sessionStorage.setItem(STATUS_KEY,'skipped')
    sessionStorage.setItem(ERROR_KEY,'Konfigurasi Firebase, email, atau password tidak tersedia.')
    return false
  }
  sessionStorage.setItem(STATUS_KEY,'pending')
  sessionStorage.removeItem(ERROR_KEY)
  try{
    await signInWithEmailAndPassword(firebaseAuth,email.trim().toLowerCase(),password)
    sessionStorage.setItem(STATUS_KEY,'signed-in')
    sessionStorage.removeItem(ERROR_KEY)
    return true
  }catch(error){
    const detail=describeAuthError(error)
    sessionStorage.setItem(STATUS_KEY,'failed')
    sessionStorage.setItem(ERROR_KEY,detail)
    console.info('Firebase Auth bridge gagal.', error)
    return false
  }
}

export async function signOutFirebaseBridge():Promise<void>{
  sessionStorage.removeItem(STATUS_KEY)
  sessionStorage.removeItem(ERROR_KEY)
  if(!firebaseAuth)return
  try{await signOut(firebaseAuth)}catch(error){console.info('Firebase sign-out dilewati.',error)}
}
