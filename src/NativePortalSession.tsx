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
import OfflinePortal from './OfflinePortal'
import {NativeOfflineContext,setVerifiedOnlineUid} from './nativeOfflineRuntime'
import {createOfflineLease,readOfflineLease,isOfflineTransportFailure,OFFLINE_PROFILE_KEY,type OfflineLease} from './qcOfflineLease.mjs'

function forgetOfflineProfile(){try{localStorage.removeItem(OFFLINE_PROFILE_KEY)}catch{}}
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
 const [offlineLease,setOfflineLease]=useState<OfflineLease|null>(null)
 const [retainedOffline,setRetainedOffline]=useState(false)
 const [storageBlocked,setStorageBlocked]=useState(false)
 const retryProfile=useRef<(()=>Promise<void>)|null>(null)
 useEffect(()=>{
  setVerifiedOnlineUid('')
  if(!clearCompatibilitySession()){setStorageBlocked(true);setReady(true);return}
  try{checkNativePortalConfig()}catch{setMessage('Konfigurasi migrasi belum lengkap.');setReady(true);return}
  const auth=firebaseAuth
  if(!auth){setMessage('Firebase tidak tersedia.');setReady(true);return}
  let stopped=false,generation=0,verifiedUid=''
  let checkingUid='',cooldownUid='',retryAfter=0,lastVerifiedAt=0,degraded=false
  const projectId=auth.app.options.projectId||''
  const leaseForCurrent=()=>{
   const identity=auth.currentUser
   if(!identity)return null
   try{return readOfflineLease(localStorage.getItem(OFFLINE_PROFILE_KEY),identity,projectId)}
   catch{return null}
  }
  const allowOffline=(uid:string)=>{
   const lease=leaseForCurrent()
   if(!lease||lease.user.firebaseUid!==uid)return false
   degraded=true;setVerifiedOnlineUid('')
   setRetryUid('');setMessage('');setReady(true)
   if(verifiedUid===uid){
    // Preserve already-mounted forms and unsaved input during a disconnect.
    // A fresh load never mounts the full workspace from shared Firestore cache.
    setRetainedOffline(true);setOfflineLease(null)
   }else{
    clearCompatibilitySession();setUser(null);setRetainedOffline(false);setOfflineLease(lease)
   }
   return true
  }
  const verify=async(force=false)=>{
   const uid=auth.currentUser?.uid
   if(!force&&uid&&(checkingUid===uid||(cooldownUid===uid&&Date.now()<retryAfter)||(verifiedUid===uid&&!degraded&&navigator.onLine&&Date.now()-lastVerifiedAt<300000)))return
   const attempt=++generation
   checkingUid=uid||''
   if(uid!==verifiedUid){setVerifiedOnlineUid('');clearCompatibilitySession();setUser(null);setReady(!uid);verifiedUid='';setRetainedOffline(false);setOfflineLease(null)}
   if(!uid){forgetOfflineProfile();degraded=false;cooldownUid='';lastVerifiedAt=0;checkingUid='';setRetryUid('');setReady(true);return}
   if(!navigator.onLine){
    setVerifiedOnlineUid('');checkingUid=''
    if(allowOffline(uid))return
    verifiedUid='';degraded=false;clearCompatibilitySession();setUser(null);setRetainedOffline(false);setOfflineLease(null)
    setRetryUid(uid);setReady(true);setMessage('Mode offline tidak tersedia: profil belum diverifikasi di perangkat ini atau masa akses lokal telah berakhir. Sambungkan internet.')
    return
   }
   try{
    const next=await readApprovedFirebaseSession()
    if(stopped||attempt!==generation||auth.currentUser?.uid!==uid)return
    publishCompatibilitySession(next);setVerifiedOnlineUid(uid);verifiedUid=uid;lastVerifiedAt=Date.now();cooldownUid='';degraded=false
    const lease=createOfflineLease(next,auth.currentUser!,projectId,lastVerifiedAt)
    try{if(lease)localStorage.setItem(OFFLINE_PROFILE_KEY,JSON.stringify(lease));else forgetOfflineProfile()}catch{}
    setOfflineLease(null);setRetainedOffline(false);setRetryUid('');setMessage('');setUser(next);setReady(true)
   }catch(error){
    if(stopped||attempt!==generation||auth.currentUser?.uid!==uid)return
    const code=String((error as {code?:string})?.code||'').replace(/^firestore\//,'')
    const transient=code==='unavailable'||code==='deadline-exceeded'
    cooldownUid=isProfileQuotaError(error)||transient?uid:''
    if(cooldownUid)retryAfter=Date.now()+(isProfileQuotaError(error)?300000:90000)
    setVerifiedOnlineUid('')
    if(isOfflineTransportFailure(error)&&allowOffline(uid))return
    // Explicit permission, identity, account-status, and quota failures never
    // grant a new offline session. Revoke the saved lease after a profile denial.
    if(!transient)forgetOfflineProfile()
    degraded=false;setOfflineLease(null);setRetainedOffline(false);setRetryUid(uid)
    verifiedUid='';clearCompatibilitySession();setUser(null);setReady(true);setMessage(safeFirebaseProfileMessage(error))
   }finally{if(attempt===generation)checkingUid=''}
  }
  retryProfile.current=()=>verify(true)
  const stop=onIdTokenChanged(auth,()=>{void verify(true)})
  const refresh=()=>{if(document.visibilityState==='visible')void verify()}
  const reconnect=()=>{void verify(true)}
  const disconnect=()=>{void verify(true)}
  window.addEventListener('focus',refresh);window.addEventListener('online',reconnect);window.addEventListener('offline',disconnect)
  document.addEventListener('visibilitychange',refresh)
  // Explicit retry remains available at all times. Avoid repeated server reads
  // from every open tab while Firestore is degraded or quotas are constrained.
  const timer=window.setInterval(()=>{if(navigator.onLine)refresh()},300000)
  const leaseTimer=window.setInterval(()=>{
   if(degraded&&!leaseForCurrent())void verify(true)
  },30000)
  return()=>{stopped=true;setVerifiedOnlineUid('');generation++;retryProfile.current=null;stop();window.clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('online',reconnect);window.removeEventListener('offline',disconnect);window.clearInterval(leaseTimer);document.removeEventListener('visibilitychange',refresh);clearCompatibilitySession()}
 },[])
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setBusy(true);setMessage('')
  const form=event.currentTarget,data=new FormData(form)
  try{
   checkNativePortalConfig()
   if(!firebaseAuth)throw Error('Firebase tidak tersedia.')
   if(!navigator.onLine)throw Error('OFFLINE_LOGIN_REQUIRES_PREVIOUS_SESSION')
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
    setMessage(!navigator.onLine?'Login baru membutuhkan internet. Gunakan sesi yang pernah terverifikasi di perangkat ini.':register?'Pendaftaran belum berhasil. Periksa data dan koneksi; jangan membuat akun baru berulang-ulang.':safeFirebaseLoginMessage(error))
    // Keep the address for correction, but do not retain a password on error.
    const password=form.elements.namedItem('password')
    if(password instanceof HTMLInputElement)password.value=''
  }finally{setBusy(false)}
 }
 async function switchAccount(){
  if(!firebaseAuth||busy)return
  setBusy(true)
  try{await signOut(firebaseAuth);forgetOfflineProfile();setOfflineLease(null);setRetainedOffline(false);setRetryUid('');setMessage('');setRegister(false)}
  catch(error){setMessage(safeFirebaseLoginMessage(error))}
  finally{setBusy(false)}
 }
 const recoveryUser=retryUid&&retryUid===firebaseAuth?.currentUser?.uid?firebaseAuth.currentUser:null
 if(storageBlocked)return <main className="auth-page"><section className="auth-card"><h1>QC Form Web</h1><p role="alert">Browser memblokir penyimpanan situs. Izinkan penyimpanan atau buka portal di browser utama perangkat.</p><button type="button" onClick={()=>window.location.reload()}>Coba lagi</button></section></main>
 if(!ready)return <main className="auth-page"><p>Memverifikasi sesi Firebase…</p></main>
 if(offlineLease)return <OfflinePortal key={offlineLease.user.firebaseUid} lease={offlineLease} onRetry={async()=>{await retryProfile.current?.()}} onLogout={switchAccount}/>
 if(user)return <div key={user.firebaseUid+'|'+user.role+'|'+JSON.stringify(user.permissions)}>{retainedOffline&&<div role="status" style={{position:'relative',zIndex:100,padding:'10px 16px',background:'#fff7e6',color:'#874d00'}}>Mode offline · Sesi terakhir terverifikasi. Data mungkin tidak terbaru; simpan draft lokal dan verifikasi ulang saat online. <button type="button" onClick={()=>void retryProfile.current?.()}>Periksa koneksi</button></div>}<LegacyQueueNotice/><NativeOfflineContext.Provider value={retainedOffline}>{children}</NativeOfflineContext.Provider></div>
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
