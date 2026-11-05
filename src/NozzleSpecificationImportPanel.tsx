import { useState } from 'react'
import { collection,doc,getDoc,getDocs,serverTimestamp,writeBatch } from 'firebase/firestore'
import { firebaseAuth,firestoreDb } from './firebase'
import { canEditAccess } from './accessControl'
import type { User } from './types'
import { NOZZLE_SPEC_COLLECTION,findNozzleSpec,matchingNozzleCode,nozzleSpecFromData,nozzleSpecId,type NozzleSpec } from './nozzlePerformance'
import { parseNozzleWorkbook } from './nozzleSpecificationImport'
import { OPERATIONAL_RESOURCE_COLLECTIONS } from './masterOperationalResources'

type Props={user:User;onImported:()=>void|Promise<void>}
type ExistingNozzle={id:string;name:string;active:boolean}
type Preview={specs:NozzleSpec[];fileName:string;errors:string[];sourceSheet:string}
type ExistingSpec=NozzleSpec&{id:string}
const filenameValid=(name:string)=>/\.(xlsx|xls)$/i.test(name)

export default function NozzleSpecificationImportPanel({user,onImported}:Props){
 const[preview,setPreview]=useState<Preview|null>(null)
 const[busy,setBusy]=useState(false)
 const[message,setMessage]=useState('')
 const[existing,setExisting]=useState<ExistingSpec[]>([])
 const[existingNozzles,setExistingNozzles]=useState<ExistingNozzle[]>([])
 const[activateInactive,setActivateInactive]=useState(false)
 const canWrite=canEditAccess(user,'data_master_activity_resources')

 async function handleFile(file:File|null){
  if(!file)return
  setPreview(null);setMessage('');setActivateInactive(false);setBusy(true)
  try{
   if(!filenameValid(file.name))throw new Error('Hanya file Excel .xlsx atau .xls.')
   if(!firestoreDb)throw new Error('Firestore belum siap.')
   const parsed=await parseNozzleWorkbook(file)
   const[specSnap,masterSnap]=await Promise.all([
    getDocs(collection(firestoreDb,NOZZLE_SPEC_COLLECTION)),
    getDocs(collection(firestoreDb,OPERATIONAL_RESOURCE_COLLECTIONS.nozzle)),
   ])
   setExisting(specSnap.docs.flatMap(d=>{const spec=nozzleSpecFromData(d.data() as Record<string,unknown>);return spec?[{...spec,id:d.id}]:[]}))
   setExistingNozzles(masterSnap.docs.map(d=>({id:d.id,name:String((d.data() as Record<string,unknown>).name||''),active:(d.data() as Record<string,unknown>).active!==false})))
   setPreview({specs:parsed.specs,fileName:file.name,errors:parsed.errors,sourceSheet:parsed.sheet})
   setMessage(parsed.errors.length?'Ada kesalahan validasi. File belum dapat disimpan.':'File siap dipreview. Data Firestore tidak akan diubah sebelum tombol Konfirmasi ditekan.')
  }catch(error){setMessage(error instanceof Error?error.message:'Gagal membaca Excel.')}
  finally{setBusy(false)}
 }

 async function save(){
  if(!preview||preview.errors.length||!preview.specs.length||!canWrite)return
  const pendingReactivation=preview.specs.filter(spec=>{const matches=existingNozzles.filter(row=>matchingNozzleCode(row.name,spec.code));return matches.length>0&&!matches.some(row=>row.active)}).length
  if(!window.confirm('Simpan '+preview.specs.length+' model nozzle dari '+preview.fileName+'? Data tekanan lama untuk MODEL YANG SAMA akan diganti dengan tabel upload; model lain tetap ada.'+(activateInactive?'\n\nAktifkan '+pendingReactivation+' model Master Nozzle yang saat ini INACTIVE?':'\n\nStatus ACTIVE/INACTIVE Master Nozzle akan tetap dipertahankan.')))return
  setBusy(true)
  try{
   if(!firestoreDb||!firebaseAuth?.currentUser)throw new Error('Sesi Firebase belum aktif.')
   const db=firestoreDb
   const profile=await getDoc(doc(db,'users',firebaseAuth.currentUser.uid))
   if(!profile.exists()||profile.data().active!==true)throw new Error('Akun tidak aktif atau tidak ditemukan.')
   const changedAt=serverTimestamp()
   // The import is atomic for a typical reference table; never partially persist invalid rows.
   const batch=writeBatch(db)
   let createdMaster=0,activatedMaster=0
   for(const spec of preview.specs){
    const id=nozzleSpecId(spec.code)
    const matching=existing.find(item=>matchingNozzleCode(item.code,spec.code))
    batch.set(doc(db,NOZZLE_SPEC_COLLECTION,matching?.id||id),{
      code:spec.code,color:spec.color,points:spec.points,
      sourceFileName:preview.fileName,sourceSheet:preview.sourceSheet,
      source:'NOZZLE_EXCEL_IMPORT',updatedBy:user.username,updatedAt:changedAt,
    })
    const matches=existingNozzles.filter(row=>matchingNozzleCode(row.name,spec.code))
    const registered=matches.length>0
    if(registered&&activateInactive&&!matches.some(row=>row.active)){
      const selected=matches.slice().sort((a,b)=>a.id.localeCompare(b.id))[0]
      batch.set(doc(db,OPERATIONAL_RESOURCE_COLLECTIONS.nozzle,selected.id),{active:true,updatedBy:user.username,updatedAt:changedAt},{merge:true})
      activatedMaster++
    }
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
   if(preview.specs.length+createdMaster+activatedMaster>490)throw new Error('File terlalu besar untuk satu transaksi (maksimum 490 record). Pisahkan per model.')
   await batch.commit()
   setMessage('Berhasil: '+preview.specs.length+' spesifikasi nozzle disimpan; '+createdMaster+' master baru; '+activatedMaster+' master lama diaktifkan.'+(pendingReactivation>0&&!activateInactive?' '+pendingReactivation+' model lama tetap INACTIVE sesuai pengaturan Anda.':'')+' Kalkulator membaca data Firestore yang sama.')
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
     <div className="nozzle-import-help"><strong>Aturan import</strong><span>1 model = beberapa baris tekanan. Semua kombinasi nozzle + bar wajib unik dan debit harus lebih besar dari 0.</span><span>Upload ulang model yang sama akan mengganti seluruh tabel tekanan model tersebut. Model lain tidak terhapus.</span><span>Nama nozzle manual tetap dipertahankan; kode yang belum ada dibuat otomatis di Master Nozzle.</span><span>Status INACTIVE lama tidak berubah kecuali Anda memilih mengaktifkannya di preview import.</span></div>
   </div>
   {message&&<div className={'alert '+(preview?.errors.length?'danger':'')}>{message}</div>}
   {preview&&<>
    {preview.specs.some(spec=>{const matches=existingNozzles.filter(row=>matchingNozzleCode(row.name,spec.code));return matches.length>0&&!matches.some(row=>row.active)})&&<label className="nozzle-import-activation"><input type="checkbox" checked={activateInactive} onChange={event=>setActivateInactive(event.target.checked)}/><span><strong>Aktifkan nozzle lama yang saat ini INACTIVE</strong><small>Opsional. Tanpa centang, status ACTIVE/INACTIVE yang sudah ada tidak diubah. Duplikat yang sudah memiliki satu entry ACTIVE tidak otomatis diaktifkan.</small></span></label>}
    <div className="section-head nozzle-import-preview-title"><div><h4>Preview {preview.fileName}</h4><p className="muted">{preview.sourceSheet||'Sheet tidak terdeteksi'} · {preview.specs.length} model · {preview.specs.reduce((n,s)=>n+s.points.length,0)} kombinasi tekanan</p></div>
     <button type="button" className="primary" disabled={busy||!canWrite||!!preview.errors.length||!preview.specs.length} onClick={()=>void save()}>Konfirmasi Update / Import Nozzle</button>
    </div>
    {preview.errors.length>0&&<div className="alert danger">{preview.errors.slice(0,15).map(error=><div key={error}>{error}</div>)}{preview.errors.length>15&&<small>+ {preview.errors.length-15} masalah lainnya.</small>}</div>}
    <div className="table-wrap"><table><thead><tr><th>Kode Nozzle</th><th>Warna</th><th>Bar tersedia</th><th>Kategori droplet</th><th>Master Nozzle</th><th>Spesifikasi</th></tr></thead><tbody>{preview.specs.map(spec=><tr key={spec.code}><td><strong>{spec.code}</strong></td><td>{spec.color}</td><td>{spec.points.map(p=>p.bar).join(', ')}</td><td>{[...new Set(spec.points.map(p=>p.droplet))].join(', ')}</td><td>{(()=>{const matches=existingNozzles.filter(row=>matchingNozzleCode(row.name,spec.code));return !matches.length?'Belum ada (dibuat ACTIVE)':matches.some(row=>row.active)?'ACTIVE'+(matches.length>1?' · '+matches.length+' alias':''):'INACTIVE'+(activateInactive?' → ACTIVE':' (tetap)')})()}</td><td>{findNozzleSpec(spec.code,existing)?'UPDATE':'NEW'} · {spec.points.length} tekanan</td></tr>)}</tbody></table></div>
   </>}
  </div>
}
