import type {legacyQueueInventory} from './offline'
import {useEffect,useRef,useState,type ReactNode,type FormEvent} from 'react'
import {onIdTokenChanged,signInWithEmailAndPassword,signOut} from 'firebase/auth'
import {firebaseAuth,firebaseAuthPersistenceReady} from './firebase'
import {isProfileQuotaError,safeFirebaseLoginMessage,safeFirebaseProfileMessage} from './qcNativeLoginDiagnostics.mjs'
import {readApprovedFirebaseSession} from './qcFirebaseSession'
import {checkNativePortalConfig} from './qcNativePortalConfig'
import {qcLocalUat} from './qcLocalUat'
import {NATIVE_SESSION_MARKER} from './qcNativePortalPolicy.mjs'
import {nativeRegistrationRoles,submitNativeRegistration,type NativeRegistrationRole} from './qcNativeRegistration'
import type {User} from './types'

function clearCompatibilitySession(){
 let available=true
 for(const key of ['sessionStorage','localStorage'] as const){
  try{const store=window[key];store.removeItem('qc_token');store.removeItem('qc_user')}
  catch{available=false}
 }
 return available
}
function publishCompatibilitySession(user:User){
 // This marker is not a credential. API boundary rejects it unconditionally.
 try{
  for(const store of [sessionStorage,localStorage]){store.setItem('qc_user',JSON.stringify(user));store.setItem('qc_token',NATIVE_SESSION_MARKER)}
 }catch{throw Error('AUTH_BROWSER_STORAGE')}
}
async function waitForLoginNetwork(){
 // A phone can briefly go offline while switching between mobile data and Wi-Fi.
 await new Promise(resolve=>window.setTimeout(resolve,1000))
 if(navigator.onLine)return true
 return new Promise<boolean>(resolve=>{
  const finish=()=>{
   window.clearTimeout(timer)
   window.removeEventListener('online',finish)
   resolve(navigator.onLine)
  }
  const timer=window.setTimeout(finish,8000)
  window.addEventListener('online',finish)
 })
}
export default function NativePortalSession({children}:{children:ReactNode}){
 const [user,setUser]=useState<User|null>(null),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[register,setRegister]=useState(false)
 const [retryUid,setRetryUid]=useState('')
 const [storageBlocked,setStorageBlocked]=useState(false)
 const retryProfile=useRef<(()=>Promise<void>)|null>(null)
 useEffect(()=>{
  if(!clearCompatibilitySession()){setStorageBlocked(true);setReady(true);return}
  try{checkNativePortalConfig()}catch{setMessage('Konfigurasi migrasi belum lengkap.');setReady(true);return}
  const auth=firebaseAuth
  if(!auth){setMessage('Firebase tidak tersedia.');setReady(true);return}
  let stopped=false,generation=0,verifiedUid=''
  let checkingUid='',cooldownUid='',retryAfter=0,lastVerifiedAt=0
  const verify=async(force=false)=>{
   const uid=auth.currentUser?.uid
   if(!force&&uid&&(checkingUid===uid||(cooldownUid===uid&&Date.now()<retryAfter)||(verifiedUid===uid&&Date.now()-lastVerifiedAt<300000)))return
   const attempt=++generation
   checkingUid=uid||''
   if(uid!==verifiedUid){clearCompatibilitySession();setUser(null);setReady(!uid);verifiedUid=''}
   if(!uid){cooldownUid='';lastVerifiedAt=0;setRetryUid('');setReady(true);return}
   try{
    const next=await readApprovedFirebaseSession()
    if(stopped||attempt!==generation||auth.currentUser?.uid!==uid)return
    publishCompatibilitySession(next);verifiedUid=uid;lastVerifiedAt=Date.now();cooldownUid='';setRetryUid('');setMessage('');setUser(next);setReady(true)
   }catch(error){
    if(stopped||attempt!==generation||auth.currentUser?.uid!==uid)return
    const code=String((error as {code?:string})?.code||'').replace(/^firestore\//,'')
    const transient=code==='unavailable'||code==='deadline-exceeded'
    cooldownUid=isProfileQuotaError(error)||transient?uid:''
    if(cooldownUid)retryAfter=Date.now()+(isProfileQuotaError(error)?300000:90000)
    setRetryUid(uid)
    verifiedUid='';clearCompatibilitySession();setUser(null);setReady(true);setMessage(safeFirebaseProfileMessage(error))
   }finally{if(attempt===generation)checkingUid=''}
  }
  retryProfile.current=()=>verify(true)
  const stop=onIdTokenChanged(auth,()=>{void verify(true)})
  const refresh=()=>{if(document.visibilityState==='visible')void verify()}
  window.addEventListener('focus',refresh);window.addEventListener('online',refresh)
  document.addEventListener('visibilitychange',refresh)
  // Explicit retry remains available at all times. Avoid repeated server reads
  // from every open tab while Firestore is degraded or quotas are constrained.
  const timer=window.setInterval(()=>{if(navigator.onLine)refresh()},300000)
  return()=>{stopped=true;generation++;retryProfile.current=null;stop();window.clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('online',refresh);document.removeEventListener('visibilitychange',refresh);clearCompatibilitySession()}
 },[])
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setBusy(true);setMessage('')
  const form=event.currentTarget,data=new FormData(form)
  try{
   checkNativePortalConfig()
   if(!firebaseAuth)throw Error('Firebase tidak tersedia.')
   if(register){
    const status=await submitNativeRegistration({email:String(data.get('email')||''),password:String(data.get('password')||''),username:String(data.get('username')||''),fullName:String(data.get('fullName')||''),requestedRole:String(data.get('role')) as NativeRegistrationRole},data.get('resume')==='on')
    setMessage('Status: '+status+'. Verifikasi email dan tunggu aktivasi Owner.');form.reset();setRegister(false)
   }else{
    // Do not sign out an existing authenticated session before a new login
    // succeeds. Firebase signInWithEmailAndPassword replaces it on success.
    // A failed retry must not discard a valid (but not-yet-hydrated) session.
    await firebaseAuthPersistenceReady
    if(typeof firebaseAuth.authStateReady==='function')await firebaseAuth.authStateReady()
    const email=String(data.get('email')||'').trim(),secret=String(data.get('password')||'')
    try{
     await signInWithEmailAndPassword(firebaseAuth,email,secret)
    }catch(error){
     if((error as {code?:string})?.code!=='auth/network-request-failed')throw error
     setMessage('Menunggu koneksi untuk mencoba login sekali lagi…')
     if(!await waitForLoginNetwork())throw error
     await signInWithEmailAndPassword(firebaseAuth,email,secret)
    }
    const password=form.elements.namedItem('password')
    if(password instanceof HTMLInputElement)password.value=''
   }
  }catch(error){
    setMessage(register?'Pendaftaran belum berhasil. Periksa data dan koneksi; jangan membuat akun baru berulang-ulang.':safeFirebaseLoginMessage(error))
    // Keep the address for correction, but do not retain a password on error.
    const password=form.elements.namedItem('password')
    if(password instanceof HTMLInputElement)password.value=''
  }finally{setBusy(false)}
 }
 async function switchAccount(){
  if(!firebaseAuth||busy)return
  setBusy(true)
  try{await signOut(firebaseAuth);setRetryUid('');setMessage('');setRegister(false)}
  catch(error){setMessage(safeFirebaseLoginMessage(error))}
  finally{setBusy(false)}
 }
 const recoveryUser=retryUid&&retryUid===firebaseAuth?.currentUser?.uid?firebaseAuth.currentUser:null
 if(storageBlocked)return <main className="auth-page"><section className="auth-card"><h1>QC Form Web</h1><p role="alert">Browser memblokir penyimpanan situs. Izinkan penyimpanan atau buka portal di browser utama perangkat.</p><button type="button" onClick={()=>window.location.reload()}>Coba lagi</button></section></main>
 if(!ready)return <main className="auth-page"><p>Memverifikasi sesi Firebase…</p></main>
 if(user)return <div key={user.firebaseUid+'|'+user.role+'|'+JSON.stringify(user.permissions)}><LegacyQueueNotice/>{children}</div>
 return <main className="auth-page"><section className="auth-card"><h1>QC Form Web</h1><p>{qcLocalUat?'Preview lokal · gunakan akun demo':'Firebase Authentication'}</p>{!recoveryUser&&<div className="segmented"><button disabled={busy} onClick={()=>setRegister(false)}>Masuk</button><button disabled={busy} onClick={()=>setRegister(true)}>Daftar</button></div>}{message&&<p role="alert">{message}</p>}
  {recoveryUser?<div className="form-stack"><p>Akun yang diperiksa <strong>{recoveryUser.email}</strong></p><button type="button" disabled={busy} onClick={async()=>{
    setBusy(true)
    try{await retryProfile.current?.()}finally{setBusy(false)}
  }}>Periksa ulang akses akun</button><button type="button" disabled={busy} onClick={()=>void switchAccount()}>Gunakan akun lain</button></div>:
  <form className="form-stack" onSubmit={submit}>{register&&<><label>Nama lengkap<input name="fullName" required/></label><label>Username<input name="username" pattern="[a-z0-9_]{3,40}" required/></label><label>Role<select name="role" defaultValue="pengunjung">{nativeRegistrationRoles.map(r=><option key={r}>{r}</option>)}</select></label><label><input type="checkbox" name="resume"/> Lanjutkan registrasi sebelumnya</label></>}<label>Email<input type="email" name="email" autoCapitalize="none" spellCheck={false} autoComplete="username" required/></label><label>Password<input type="password" name="password" autoComplete={register?'new-password':'current-password'} required/></label><button className="primary" disabled={busy}>{busy?'Memproses…':register?'Daftar':'Masuk'}</button></form>}</section></main>
}

function LegacyQueueNotice(){
 const [summary,setSummary]=useState<Awaited<ReturnType<typeof legacyQueueInventory>>|null>(null),[failed,setFailed]=useState(false)
 useEffect(()=>{let stopped=false;const read=()=>{void import('./offline').then(module=>module.legacyQueueInventory()).then(v=>{if(!stopped){setSummary(v);setFailed(false)}}).catch(()=>{if(!stopped)setFailed(true)})};read();window.addEventListener('focus',read);return()=>{stopped=true;window.removeEventListener('focus',read)}},[])
 if(failed)return <p role="alert">Antrean lama tidak dapat diperiksa. Jangan hapus data browser atau lakukan cutover.</p>
 if(!summary||!summary.total)return null
 return <details className="qc-legacy-queue-notice">
   <summary>Antrean QC lama · {summary.total}</summary>
   <div>
     <p>Akun ini: {summary.own} · Akun lain: {summary.other} · Tanpa identitas: {summary.unattributed} · Konflik: {summary.conflicting}</p>
     <p>Antrean tetap tersimpan di perangkat. Selesaikan lewat versi lama dan verifikasi hasilnya sebelum migrasi.</p>
   </div>
 </details>
}
