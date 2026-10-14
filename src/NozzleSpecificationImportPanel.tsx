import { useState } from 'react'
import { collection,doc,getDoc,getDocs,serverTimestamp,writeBatch } from 'firebase/firestore'
import { firebaseAuth,firestoreDb } from './firebase'
import { canEditAccess } from './accessControl'
import type { User } from './types'
import { NOZZLE_SPEC_COLLECTION,findNozzleSpec,matchingNozzleCode,nozzleSpecFromData,nozzleSpecId,type NozzleSpec } from './nozzlePerformance'
import { parseNozzleWorkbook } from './nozzleSpecificationImport'
import { OPERATIONAL_RESOURCE_COLLECTIONS } from './masterOperationalResources'

type Props={user:User;onImported:()=>void|Promise<void>}
type ExistingNozzle={id:string;name:string}
type Preview={specs:NozzleSpec[];fileName:string;errors:string[];sourceSheet:string}
type ExistingSpec=NozzleSpec&{id:string}
const filenameValid=(name:string)=>/\.(xlsx|xls)$/i.test(name)

export default function NozzleSpecificationImportPanel({user,onImported}:Props){
 const[preview,setPreview]=useState<Preview|null>(null)
 const[busy,setBusy]=useState(false)
 const[message,setMessage]=useState('')
 const[existing,setExisting]=useState<ExistingSpec[]>([])
 const[existingNozzles,setExistingNozzles]=useState<ExistingNozzle[]>([])
 const canWrite=canEditAccess(user,'data_master_activity_resources')

 async function handleFile(file:File|null){
  if(!file)return
  setPreview(null);setMessage('');setBusy(true)
  try{
   if(!filenameValid(file.name))throw new Error('Hanya file Excel .xlsx atau .xls.')
   if(!firestoreDb)throw new Error('Firestore belum siap.')
   const parsed=await parseNozzleWorkbook(file)
   const[specSnap,masterSnap]=await Promise.all([
    getDocs(collection(firestoreDb,NOZZLE_SPEC_COLLECTION)),
    getDocs(collection(firestoreDb,OPERATIONAL_RESOURCE_COLLECTIONS.nozzle)),
   ])
   setExisting(specSnap.docs.flatMap(d=>{const spec=nozzleSpecFromData(d.data() as Record<string,unknown>);return spec?[{...spec,id:d.id}]:[]}))
   setExistingNozzles(masterSnap.docs.map(d=>({id:d.id,name:String((d.data() as Record<string,unknown>).name||'')})))
   setPreview({specs:parsed.specs,fileName:file.name,errors:parsed.errors,sourceSheet:parsed.sheet})
   setMessage(parsed.errors.length?'Ada kesalahan validasi. File belum dapat disimpan.':'File siap dipreview. Data Firestore tidak akan diubah sebelum tombol Konfirmasi ditekan.')
  }catch(error){setMessage(error instanceof Error?error.message:'Gagal membaca Excel.')}
  finally{setBusy(false)}
 }

 async function save(){
  if(!preview||preview.errors.length||!preview.specs.length||!canWrite)return
  if(!window.confirm('Simpan '+preview.specs.length+' model nozzle dari '+preview.fileName+'? Data tekanan lama untuk MODEL YANG SAMA akan diganti dengan tabel upload; model lain tetap ada.'))return
  setBusy(true)
  try{
   if(!firestoreDb||!firebaseAuth?.currentUser)throw new Error('Sesi Firebase belum aktif.')
   const db=firestoreDb
   const profile=await getDoc(doc(db,'users',firebaseAuth.currentUser.uid))
   if(!profile.exists()||profile.data().active!==true)throw new Error('Akun tidak aktif atau tidak ditemukan.')
   const changedAt=serverTimestamp()
   // The import is atomic for a typical reference table; never partially persist invalid rows.
   const batch=writeBatch(db)
   let createdMaster=0
   for(const spec of preview.specs){
    const id=nozzleSpecId(spec.code)
    const matching=existing.find(item=>matchingNozzleCode(item.code,spec.code))
    batch.set(doc(db,NOZZLE_SPEC_COLLECTION,matching?.id||id),{
      code:spec.code,color:spec.color,points:spec.points,
      sourceFileName:preview.fileName,sourceSheet:preview.sourceSheet,
      source:'NOZZLE_EXCEL_IMPORT',updatedBy:user.username,updatedAt:changedAt,
    })
    const registered=existingNozzles.some(row=>matchingNozzleCode(row.name,spec.code))
    if(!registered){
      const masterId=id
      batch.set(doc(db,OPERATIONAL_RESOURCE_COLLECTIONS.nozzle,masterId),{
       name:spec.code+' ('+spec.color+')',active:true,source:'NOZZLE_EXCEL_IMPORT',
       updatedBy:user.username,updatedAt:changedAt,
      },{merge:true})
      createdMaster++
    }
   }
   // One batch supports <= 500 writes; the uploaded manufacturer sheet is deliberately limited.
   if(preview.specs.length+createdMaster>490)throw new Error('File terlalu besar untuk satu transaksi (maksimum 490 record). Pisahkan per model.')
   await batch.commit()
   setMessage('Berhasil: '+preview.specs.length+' spesifikasi nozzle disimpan; '+createdMaster+' jenis nozzle baru ditambahkan ke Master Nozzle. Kalkulator membaca data Firestore yang sama.')
   setPreview(null)
   await onImported()
  }catch(error){setMessage(error instanceof Error?error.message:'Import nozzle gagal.')}
  finally{setBusy(false)}
 }

 return <div className="panel nozzle-import-panel">
   <div className="section-head"><div><div className="eyebrow">MASTER NOZZLE · SUMBER DATA RESMI</div><h3>Upload Tabel Spesifikasi Nozzle</h3><p className="muted">Import file Excel TeeJet seperti yang Anda gunakan. Spesifikasi disimpan di Firestore dan dipakai kalkulator terpisah, bukan tabel bawaan aplikasi.</p></div></div>
   <div className="nozzle-import-grid">
     <label>Upload Ketentuan Nozzle (.xlsx / .xls)
      <input type="file" accept=".xlsx,.xls" disabled={busy||!canWrite} onChange={event=>void handleFile(event.target.files?.[0]||null)} />
      <small>Format halaman 21: Warna Nozzle | Jenis Nozzle | Tekanan (bar) | Ukuran Droplet | LERAP Rating | Debit (L/menit). Kolom water rate tambahan boleh tetap ada.</small>
     </label>
     <div className="nozzle-import-help"><strong>Aturan import</strong><span>1 model = beberapa baris tekanan. Semua kombinasi nozzle + bar wajib unik dan debit harus lebih besar dari 0.</span><span>Upload ulang model yang sama akan mengganti seluruh tabel tekanan model tersebut. Model lain tidak terhapus.</span><span>Nama nozzle manual tetap dipertahankan; kode yang belum ada dibuat otomatis di Master Nozzle.</span></div>
   </div>
   {message&&<div className={'alert '+(preview?.errors.length?'danger':'')}>{message}</div>}
   {preview&&<>
    <div className="section-head nozzle-import-preview-title"><div><h4>Preview {preview.fileName}</h4><p className="muted">{preview.sourceSheet||'Sheet tidak terdeteksi'} · {preview.specs.length} model · {preview.specs.reduce((n,s)=>n+s.points.length,0)} kombinasi tekanan</p></div>
     <button type="button" className="primary" disabled={busy||!canWrite||!!preview.errors.length||!preview.specs.length} onClick={()=>void save()}>Konfirmasi Update / Import Nozzle</button>
    </div>
    {preview.errors.length>0&&<div className="alert danger">{preview.errors.slice(0,15).map(error=><div key={error}>{error}</div>)}{preview.errors.length>15&&<small>+ {preview.errors.length-15} masalah lainnya.</small>}</div>}
    <div className="table-wrap"><table><thead><tr><th>Kode Nozzle</th><th>Warna</th><th>Bar tersedia</th><th>Kategori droplet</th><th>Status</th></tr></thead><tbody>{preview.specs.map(spec=><tr key={spec.code}><td><strong>{spec.code}</strong></td><td>{spec.color}</td><td>{spec.points.map(p=>p.bar).join(', ')}</td><td>{[...new Set(spec.points.map(p=>p.droplet))].join(', ')}</td><td>{findNozzleSpec(spec.code,existing)?'UPDATE':'NEW'}</td></tr>)}</tbody></table></div>
   </>}
  </div>
}
