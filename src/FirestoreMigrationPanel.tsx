import { useState } from 'react'
import { doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { qcApi } from './api'
import { firebaseAuth, firestoreDb } from './firebase'
import type { QcRecord } from './types'

type Props={token:string}

type OwnerProfile={active?:boolean;role?:string;username?:string}

function cleanRecord(record:QcRecord){
  const clean=JSON.parse(JSON.stringify(record)) as QcRecord
  clean.photoBase64=''
  if(Array.isArray(clean.holdIntervals)) clean.holdIntervals=clean.holdIntervals.map(hold=>({...hold,photoBase64:''}))
  return clean
}

async function ownerContext(){
  if(!firestoreDb||!firebaseAuth)throw new Error('Firebase belum terkonfigurasi.')
  const current=firebaseAuth.currentUser
  if(!current)throw new Error('Firebase Auth belum login. Keluar lalu login ulang menggunakan akun Owner yang sama.')
  const profile=await getDoc(doc(firestoreDb,'users',current.uid))
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
  const[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[count,setCount]=useState<number|null>(null)

  async function verify(){
    setBusy(true);setMessage('')
    try{
      const{current}=await ownerContext()
      const records=await loadRecords(token)
      setCount(records.length)
      setMessage(`Firestore terhubung. UID ${current.uid.slice(0,8)}… • role owner • ${records.length} record dari Apps Script siap dimigrasikan.`)
    }catch(error){setMessage(error instanceof Error?error.message:'Verifikasi Firestore gagal.')}finally{setBusy(false)}
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
    <div className="row-actions"><button type="button" disabled={busy} onClick={()=>void verify()}>Verifikasi Firestore</button><button type="button" className="primary" disabled={busy} onClick={()=>void migrate()}>{busy?'Memproses…':count===null?'Import Data QC':`Import ${count} Record`}</button></div>
    {message&&<div className="alert">{message}</div>}
  </section>
}
