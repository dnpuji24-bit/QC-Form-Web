import { useState } from 'react'
import { doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { firebaseAuth, firestoreDb } from './firebase'
import type { QcRecord, User } from './types'

type Props={user:User;records:QcRecord[]}

function cleanRecord(record:QcRecord){
  const clean=JSON.parse(JSON.stringify(record)) as QcRecord
  clean.photoBase64=''
  if(Array.isArray(clean.holdIntervals)) clean.holdIntervals=clean.holdIntervals.map(hold=>({...hold,photoBase64:''}))
  return clean
}

export default function FirestoreMigrationPanel({user,records}:Props){
  const[busy,setBusy]=useState(false),[message,setMessage]=useState('')

  async function verify(){
    setBusy(true);setMessage('')
    try{
      if(!firestoreDb||!firebaseAuth)throw new Error('Firebase belum terkonfigurasi.')
      const current=firebaseAuth.currentUser
      if(!current)throw new Error('Firebase Auth belum login. Keluar lalu login ulang menggunakan akun Owner yang sama.')
      const profile=await getDoc(doc(firestoreDb,'users',current.uid))
      if(!profile.exists())throw new Error('Profil users/{UID} tidak ditemukan di Firestore.')
      const data=profile.data() as {active?:boolean;role?:string;username?:string}
      if(data.active!==true)throw new Error('Profil Firebase tidak aktif.')
      if(data.role!=='owner')throw new Error(`Role Firebase saat ini ${data.role||'-'}, bukan owner.`)
      setMessage(`Firestore terhubung. UID ${current.uid.slice(0,8)}… • role owner • ${records.length} record siap dimigrasikan.`)
    }catch(error){setMessage(error instanceof Error?error.message:'Verifikasi Firestore gagal.')}finally{setBusy(false)}
  }

  async function migrate(){
    if(!window.confirm(`Import ${records.length} record QC ke Firestore? Spreadsheet tidak akan diubah atau dihapus.`))return
    setBusy(true);setMessage('')
    try{
      if(!firestoreDb||!firebaseAuth?.currentUser)throw new Error('Firebase Auth belum login. Verifikasi Firestore terlebih dahulu.')
      const unique=[...new Map(records.filter(r=>r.id).map(r=>[r.id,r])).values()]
      let written=0
      for(let start=0;start<unique.length;start+=300){
        const batch=writeBatch(firestoreDb)
        const chunk=unique.slice(start,start+300)
        for(const record of chunk){
          batch.set(doc(firestoreDb,'qc_records',record.id),{
            ...cleanRecord(record),
            migratedFrom:'apps_script_spreadsheet',
            migratedBy:user.username,
            migratedAt:serverTimestamp(),
            updatedAt:serverTimestamp(),
          },{merge:true})
        }
        await batch.commit()
        written+=chunk.length
        setMessage(`Migrasi berjalan: ${written}/${unique.length} record…`)
      }
      setMessage(`Migrasi selesai: ${written} record masuk ke collection qc_records. Spreadsheet tetap tidak berubah.`)
    }catch(error){setMessage(error instanceof Error?error.message:'Migrasi Firestore gagal.')}finally{setBusy(false)}
  }

  if(user.role!=='owner')return null
  return <section className="panel form-stack">
    <div><div className="eyebrow">FIRESTORE HYBRID</div><h3>Migrasi Data QC</h3></div>
    <p className="muted">Tahap ini menyalin record Data QC dari aplikasi ke Firestore. Foto Base64 tidak disalin; URL Google Drive tetap dipertahankan. Spreadsheet tidak dihapus atau dimodifikasi.</p>
    <div className="row-actions"><button type="button" disabled={busy} onClick={()=>void verify()}>Verifikasi Firestore</button><button type="button" className="primary" disabled={busy||!records.length} onClick={()=>void migrate()}>{busy?'Memproses…':`Import ${records.length} Record`}</button></div>
    {message&&<div className="alert">{message}</div>}
  </section>
}
