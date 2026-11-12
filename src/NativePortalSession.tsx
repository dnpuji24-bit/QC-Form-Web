import {useEffect,useState,type ReactNode,type FormEvent} from 'react'
import {onIdTokenChanged,signInWithEmailAndPassword,signOut} from 'firebase/auth'
import {firebaseAuth} from './firebase'
import {readApprovedFirebaseSession} from './qcFirebaseSession'
import {checkNativePortalConfig} from './qcNativePortalConfig'
import {NATIVE_SESSION_MARKER} from './qcNativePortalPolicy.mjs'
import {nativeRegistrationRoles,submitNativeRegistration,type NativeRegistrationRole} from './qcNativeRegistration'
import type {User} from './types'

function clearCompatibilitySession(){
 for(const store of [sessionStorage,localStorage]){store.removeItem('qc_token');store.removeItem('qc_user')}
}
function publishCompatibilitySession(user:User){
 // This marker is not a credential. API boundary rejects it unconditionally.
 for(const store of [sessionStorage,localStorage]){store.setItem('qc_token',NATIVE_SESSION_MARKER);store.setItem('qc_user',JSON.stringify(user))}
}
export default function NativePortalSession({children}:{children:ReactNode}){
 const [user,setUser]=useState<User|null>(null),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[register,setRegister]=useState(false)
 useEffect(()=>{
  clearCompatibilitySession()
  try{checkNativePortalConfig()}catch{setMessage('Konfigurasi migrasi belum lengkap.');setReady(true);return}
  const auth=firebaseAuth
  if(!auth){setMessage('Firebase tidak tersedia.');setReady(true);return}
  let stopped=false,generation=0
  const verify=async()=>{
   const attempt=++generation,uid=auth.currentUser?.uid
   if(!uid){clearCompatibilitySession();setUser(null);setReady(true);return}
   try{
    const next=await readApprovedFirebaseSession()
    if(stopped||attempt!==generation||auth.currentUser?.uid!==uid)return
    publishCompatibilitySession(next);setUser(next);setReady(true)
   }catch{
    if(stopped||attempt!==generation)return
    clearCompatibilitySession();setUser(null);setReady(true);setMessage('Sesi atau profil tidak dapat diverifikasi. Sambungkan internet dan masuk kembali.')
   }
  }
  const stop=onIdTokenChanged(auth,()=>{void verify()})
  const refresh=()=>{void verify()}
  window.addEventListener('focus',refresh);window.addEventListener('online',refresh)
  const timer=window.setInterval(()=>{if(navigator.onLine)void verify()},60000)
  return()=>{stopped=true;generation++;stop();window.clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('online',refresh);clearCompatibilitySession()}
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
    if(firebaseAuth.currentUser)await signOut(firebaseAuth)
    await signInWithEmailAndPassword(firebaseAuth,String(data.get('email')||'').trim(),String(data.get('password')||''))
    form.reset()
   }
  }catch{setMessage('Permintaan gagal. Periksa akun, koneksi, atau konfigurasi.');form.reset()}finally{setBusy(false)}
 }
 if(!ready)return <main className="auth-page"><p>Memverifikasi sesi Firebase…</p></main>
 if(user)return <div key={user.firebaseUid+'|'+user.role+'|'+JSON.stringify(user.permissions)}>{children}</div>
 return <main className="auth-page"><section className="auth-card"><h1>QC Form Web</h1><p>Firebase Authentication</p><div className="segmented"><button onClick={()=>setRegister(false)}>Masuk</button><button onClick={()=>setRegister(true)}>Daftar</button></div>{message&&<p role="alert">{message}</p>}<form className="form-stack" onSubmit={submit}>{register&&<><label>Nama lengkap<input name="fullName" required/></label><label>Username<input name="username" pattern="[a-z0-9_]{3,40}" required/></label><label>Role<select name="role" defaultValue="pengunjung">{nativeRegistrationRoles.map(r=><option key={r}>{r}</option>)}</select></label><label><input type="checkbox" name="resume"/> Lanjutkan registrasi sebelumnya</label></>}<label>Email<input type="email" name="email" autoComplete="username" required/></label><label>Password<input type="password" name="password" autoComplete={register?'new-password':'current-password'} required/></label><button className="primary" disabled={busy}>{busy?'Memproses…':register?'Daftar':'Masuk'}</button></form></section></main>
}
