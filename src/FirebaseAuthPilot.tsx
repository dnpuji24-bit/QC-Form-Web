import {useState,type FormEvent} from 'react'
import {loginIsolatedFirebase} from './qcFirebaseSession'
import type {User} from './types'
export default function FirebaseAuthPilot(){
  const [busy,setBusy]=useState(false),[result,setResult]=useState<User|null>(null),[message,setMessage]=useState('')
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault()
    const form=event.currentTarget,data=new FormData(form)
    setBusy(true);setResult(null);setMessage('')
    try{
      const user=await loginIsolatedFirebase(String(data.get('email')||''),String(data.get('password')||''))
      setResult(user);setMessage('PASS: Firebase login dan profil aktif terverifikasi. Sesi uji telah ditutup.')
    }catch{setMessage('DITOLAK: login, profil, hak akses atau koneksi tidak dapat diverifikasi.')}
    finally{form.reset();setBusy(false)}
  }
  return <main style={{maxWidth:760,margin:'60px auto',padding:24}}><h1>Firebase-only Authentication Pilot</h1><p>Login email/password langsung ke Firebase. Sesi terisolasi, tanpa token Apps Script, tanpa penulisan Firestore, tanpa perubahan sesi operasional.</p><form onSubmit={submit} className="form-stack"><label>Email<input name="email" type="email" autoComplete="username" required/></label><label>Password<input name="password" type="password" autoComplete="current-password" required/></label><button className="primary" disabled={busy}>{busy?'Memverifikasi…':'Uji Login Firebase'}</button></form>{message&&<p role="status">{message}</p>}{result&&<section><h2>Profil terverifikasi</h2><p>{result.fullName} — {result.role}</p><p>Data QC: {result.permissions?.qc_records}</p><p>Input Spraying: {result.permissions?.qc_spraying}</p><p>Input Fertilizer: {result.permissions?.qc_fertilizer}</p><p>Hak akses lainnya mengikuti template role.</p></section>}</main>
}
