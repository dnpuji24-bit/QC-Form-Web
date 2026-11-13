import {NativeNameRequest} from './NativeNameRequests'
import {useRef,useState,type FormEvent} from 'react'
import {EmailAuthProvider,reauthenticateWithCredential,updatePassword} from 'firebase/auth'
import {firebaseAuth} from './firebase'
import {readApprovedFirebaseSession} from './qcFirebaseSession'
import {nativePortalEnabled} from './qcNativePortalConfig'
import {canEditAccess} from './accessControl'
import {changeNativePassword} from './qcNativeAccountPolicy.mjs'
import type {User} from './types'

const passwordEnabled=nativePortalEnabled&&import.meta.env.VITE_QC_NATIVE_ACCOUNT_PASSWORD==='true'
const messages:Record<string,string>={
 NATIVE_PASSWORD_DISABLED:'Perubahan password ditahan sampai autentikasi lama dipensiunkan.',
 NATIVE_PASSWORD_OFFLINE:'Perubahan password membutuhkan internet.',
 NATIVE_PASSWORD_SESSION_CHANGED:'Sesi berubah. Masuk kembali dengan akun yang sesuai.',
 NATIVE_PASSWORD_FORBIDDEN:'Akses Pengaturan Edit diperlukan.',
 NATIVE_PASSWORD_INVALID:'Password baru harus berbeda, minimal 8 karakter, maksimal 256 karakter, dan cocok dengan konfirmasi.',
 'auth/wrong-password':'Password saat ini tidak sesuai.',
 'auth/invalid-credential':'Kredensial saat ini tidak sesuai.',
 'auth/weak-password':'Password baru tidak memenuhi kebijakan Firebase.',
 'auth/too-many-requests':'Terlalu banyak percobaan. Coba lagi nanti.',
 'auth/requires-recent-login':'Verifikasi ulang diperlukan. Masuk kembali.',
 'auth/network-request-failed':'Koneksi gagal. Periksa status password sebelum mencoba kembali.'
}
export function NativeAccountSettings({user}:{user:User}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('')
 const locked=useRef(false)
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault()
  if(locked.current||!user.firebaseUid||!passwordEnabled||!canEditAccess(user,'qc_settings'))return
  const form=event.currentTarget,data=new FormData(form)
  locked.current=true;setBusy(true);setMessage('')
  try{
   const result=await changeNativePassword({native:nativePortalEnabled,enabled:passwordEnabled,online:()=>navigator.onLine,expectedUid:user.firebaseUid,current:String(data.get('current')||''),next:String(data.get('next')||''),confirm:String(data.get('confirm')||''),readProfile:readApprovedFirebaseSession,getIdentity:()=>firebaseAuth?.currentUser||null,reauthenticate:(identity,current)=>reauthenticateWithCredential(identity,EmailAuthProvider.credential(identity.email!,current)),update:updatePassword})
   setMessage(result.sessionChanged?'Password diperbarui. Masuk kembali menggunakan password baru.':'Password Firebase berhasil diperbarui.')
  }catch(e){
   const code=String((e as {code?:string;message?:string})?.code||(e as Error)?.message||'')
   setMessage(messages[code]||'Perubahan belum terkonfirmasi. Periksa sesi atau koneksi sebelum mencoba lagi.')
  }finally{form.reset();locked.current=false;setBusy(false)}
 }
 return <section><div className="section-head"><div><div className="eyebrow">FIREBASE AUTHENTICATION</div><h2>Pengaturan Akun</h2></div></div>
  <div className="panel form-stack"><label>Nama lengkap<input readOnly value={user.fullName}/></label><label>Username<input readOnly value={user.username}/></label><label>Email<input readOnly value={user.email||''}/></label><label>Role<input readOnly value={user.role.replaceAll('_',' ')}/></label><p>Identitas penginput dan role tidak dapat diubah dari halaman ini. Data operasional berasal dari Firestore; URL Apps Script tidak dapat dikonfigurasi dalam mode native.</p></div>
  {canEditAccess(user,'qc_settings')?<form className="panel form-stack" onSubmit={e=>void submit(e)}><h3>Ubah password</h3>{!passwordEnabled&&<p className="alert">Perubahan password ditahan selama sistem login lama masih digunakan.</p>}<fieldset disabled={busy||!passwordEnabled}><label>Password saat ini<input name="current" type="password" autoComplete="current-password" required/></label><label>Password baru<input name="next" type="password" autoComplete="new-password" minLength={8} maxLength={256} required/></label><label>Konfirmasi password baru<input name="confirm" type="password" autoComplete="new-password" minLength={8} maxLength={256} required/></label><button className="primary" disabled={busy||!passwordEnabled}>{busy?'Memverifikasi…':'Ubah password'}</button></fieldset></form>:<p>Akses Pengaturan hanya lihat.</p>}
  <NativeNameRequest user={user} key={user.firebaseUid}/>
  {message&&<p role="status">{message}</p>}
 </section>
}
