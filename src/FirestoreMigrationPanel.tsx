import { useEffect, useState } from 'react'
import { doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { onAuthStateChanged, type Auth, type User as FirebaseUser } from 'firebase/auth'
import { qcApi } from './api'
import { firebaseAuth, firestoreDb } from './firebase'
import { getFirebaseBridgeStatus, signInFirebaseBridge } from './firebaseAuthBridge'
import type { QcRecord } from './types'

type Props={token:string}
type OwnerProfile={active?:boolean;role?:string;username?:string}

function cleanRecord(record:QcRecord){
  const clean=JSON.parse(JSON.stringify(record)) as QcRecord
  clean.photoBase64=''
  if(Array.isArray(clean.holdIntervals)) clean.holdIntervals=clean.holdIntervals.map(hold=>({...hold,photoBase64:''}))
  return clean
}

async function waitForAuthReady(auth:Auth,timeoutMs=5000):Promise<FirebaseUser|null>{
  if(auth.currentUser)return auth.currentUser
  return await new Promise<FirebaseUser|null>((resolve)=>{
    let done=false
    let unsub:()=>void=()=>{}
    const finish=(user:FirebaseUser|null)=>{if(done)return;done=true;window.clearTimeout(timer);unsub();resolve(user)}
    const timer=window.setTimeout(()=>finish(auth.currentUser),timeoutMs)
    unsub=onAuthStateChanged(auth,user=>{if(user)finish(user)})
  })
}

async function ownerContext(){
  const auth=firebaseAuth,db=firestoreDb
  if(!db||!auth)throw new Error('Firebase belum terkonfigurasi.')
  const current=await waitForAuthReady(auth)
  if(!current){
    const bridge=getFirebaseBridgeStatus()
    if(bridge.error)throw new Error(`Firebase Auth belum login. ${bridge.error}`)
    throw new Error('Firebase Auth belum login. Gunakan Hubungkan Firebase di panel ini.')
  }
  const profile=await getDoc(doc(db,'users',current.uid))
  if(!profile.exists())throw new Error('Profil users/{UID} tidak ditemukan di Firestore.')
  const data=profile.data() as OwnerProfile
  if(data.active!==true)throw new Error('Profil Firebase tidak aktif.')
  if(data.role!=='owner')throw new Error(`Role Firebase saat ini ${data.role||'-'}, bukan owner.`)
  return{current,data}
}

async function loadRecords(token:string){
  const result=await qcApi.records(token)
  return (result.records||(Array.isArray(result.data)?result.data:[])) as QcRecord[]
}

export default function FirestoreMigrationPanel({token}:Props){
  const[busy,setBusy]=useState(false)
  const[message,setMessage]=useState('')
  const[count,setCount]=useState<number|null>(null)
  const[email,setEmail]=useState('')
  const[password,setPassword]=useState('')
  const[bridgeStatus,setBridgeStatus]=useState(()=>getFirebaseBridgeStatus())

  useEffect(()=>{
    let active=true
    void qcApi.me(token).then(result=>{
      if(active&&result.user?.email)setEmail(String(result.user.email))
    }).catch(()=>{})
    return()=>{active=false}
  },[token])

  async function connectFirebase(){
    setBusy(true);setMessage('')
    try{
      if(!email.trim())throw new Error('Isi email Owner Firebase terlebih dahulu.')
      if(!password)throw new Error('Isi password Firebase terlebih dahulu.')
      const ok=await signInFirebaseBridge(email,password)
      setPassword('')
      const status=getFirebaseBridgeStatus();setBridgeStatus(status)
      if(!ok)throw new Error(status.error||'Firebase Auth gagal login.')
      const{current}=await ownerContext()
      setMessage(`Firebase Auth terhubung. UID ${current.uid.slice(0,8)}…`)
    }catch(error){
      setPassword('')
      setBridgeStatus(getFirebaseBridgeStatus())
      setMessage(error instanceof Error?error.message:'Firebase Auth gagal login.')
    }finally{setBusy(false)}
  }

  async function verify(){
    setBusy(true);setMessage('')
    try{
      const{current}=await ownerContext()
      const records=await loadRecords(token)
      setCount(records.length)
      setBridgeStatus(getFirebaseBridgeStatus())
      setMessage(`Firestore terhubung. UID ${current.uid.slice(0,8)}… • role owner • ${records.length} record dari Apps Script siap dimigrasikan.`)
    }catch(error){setBridgeStatus(getFirebaseBridgeStatus());setMessage(error instanceof Error?error.message:'Verifikasi Firestore gagal.')}finally{setBusy(false)}
  }

  async function migrate(){
    setBusy(true);setMessage('')
    try{
      const{data}=await ownerContext()
      const records=await loadRecords(token)
      const unique=[...new Map(records.filter(r=>r.id).map(r=>[r.id,r])).values()]
      if(!unique.length)throw new Error('Tidak ada record QC dari Apps Script yang dapat dimigrasikan.')
      if(!window.confirm(`Import ${unique.length} record QC ke Firestore? Spreadsheet tidak akan diubah atau dihapus.`))return
      let written=0
      for(let start=0;start<unique.length;start+=300){
        const batch=writeBatch(firestoreDb!)
        const chunk=unique.slice(start,start+300)
        for(const record of chunk){
          batch.set(doc(firestoreDb!,'qc_records',record.id),{
            ...cleanRecord(record),
            migratedFrom:'apps_script_spreadsheet',
            migratedBy:data.username||'owner',
            migratedAt:serverTimestamp(),
            updatedAt:serverTimestamp(),
          },{merge:true})
        }
        await batch.commit()
        written+=chunk.length
        setMessage(`Migrasi berjalan: ${written}/${unique.length} record…`)
      }
      setCount(unique.length)
      setMessage(`Migrasi selesai: ${written} record masuk ke collection qc_records. Spreadsheet tetap tidak berubah.`)
    }catch(error){setMessage(error instanceof Error?error.message:'Migrasi Firestore gagal.')}finally{setBusy(false)}
  }

  return <section className="panel form-stack">
    <div><div className="eyebrow">FIRESTORE HYBRID</div><h3>Migrasi Data QC</h3></div>
    <p className="muted">Tahap ini menyalin Data QC dari Apps Script/Spreadsheet ke Firestore. Foto Base64 tidak disalin; URL Google Drive tetap dipertahankan. Spreadsheet tidak dihapus atau dimodifikasi.</p>
    <div className="panel form-stack">
      <strong>Hubungkan Firebase Owner</strong>
      <p className="muted">Gunakan akun yang dibuat di Firebase Authentication. Password hanya dipakai untuk proses login ini dan tidak disimpan.</p>
      <label>Email Firebase<input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" placeholder="owner@email.com"/></label>
      <label>Password Firebase<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password"/></label>
      <div className="row-actions"><button type="button" disabled={busy} onClick={()=>void connectFirebase()}>Hubungkan Firebase</button><span className="badge">Auth: {firebaseAuth?.currentUser?'signed-in':bridgeStatus.status}</span></div>
    </div>
    <div className="row-actions"><button type="button" disabled={busy} onClick={()=>void verify()}>Verifikasi Firestore</button><button type="button" className="primary" disabled={busy} onClick={()=>void migrate()}>{busy?'Memproses…':count===null?'Import Data QC':`Import ${count} Record`}</button></div>
    {message&&<div className="alert">{message}</div>}
  </section>
}
