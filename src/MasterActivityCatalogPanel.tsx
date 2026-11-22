import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDoc, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore'
import { firebaseAuth, firestoreDb } from './firebase'
import { canEditAccess } from './accessControl'
import type { User } from './types'
import { ACTIVITY_COA_COLLECTION, ACTIVITY_CATALOG_HISTORY, ACTIVITY_COLUMNS,
  catalogValuesEqual, catText, opCatalogId, parseActivityCatalogImport, parseCoaActivity,
  type ActivityCatalogInput, type CoaActivity } from './activityCatalogModel'

export { ACTIVITY_COA_COLLECTION, parseCoaActivity, type CoaActivity } from './activityCatalogModel'

type PreviewRow={value:ActivityCatalogInput;line:number;status:'NEW'|'UPDATE'|'SAME';prior?:CoaActivity}
const empty:ActivityCatalogInput={department:'',operationCode:'',coaCode:'',activityCategory:'',name:''}
const headers=[...ACTIVITY_COLUMNS]
const limit=220

export default function MasterActivityCatalogPanel({user}:{user:User}){
 const [rows,setRows]=useState<CoaActivity[]>([])
 const [form,setForm]=useState<ActivityCatalogInput>(empty)
 const [editing,setEditing]=useState('')
 const [busy,setBusy]=useState(false)
 const [message,setMessage]=useState('')
 const [search,setSearch]=useState('')
 const [status,setStatus]=useState<'ACTIVE'|'ARCHIVED'|'ALL'>('ACTIVE')
 const [preview,setPreview]=useState<PreviewRow[]>([])
 const [errors,setErrors]=useState<string[]>([])
 const [fileName,setFileName]=useState('')
 const editable=canEditAccess(user,'data_master_activity_resources')
 const selected=rows.find(r=>r.id===editing)
 const shown=useMemo(()=>rows.filter(r=>(status==='ALL'||(status==='ACTIVE'?r.active:!r.active))&&
   [r.department,r.operationCode,r.coaCode,r.activityCategory,r.name].join(' ').toLowerCase().includes(search.trim().toLowerCase())),[rows,status,search])

 async function load(note=''){
   if(!firestoreDb)return
   setBusy(true)
   try{
     const snap=await getDocs(collection(firestoreDb,ACTIVITY_COA_COLLECTION))
     setRows(snap.docs.map(d=>parseCoaActivity(d.id,d.data() as Record<string,unknown>))
       .filter(r=>r.name).sort((a,b)=>a.department.localeCompare(b.department)||a.activityCategory.localeCompare(b.activityCategory)||a.name.localeCompare(b.name)))
     if(note)setMessage(note)
   }catch(e){setMessage(e instanceof Error?e.message:'Master Activity gagal dimuat.')}
   finally{setBusy(false)}
 }
 useEffect(()=>{void load()},[])
 function patch(key:keyof ActivityCatalogInput,value:string){setForm(s=>({...s,[key]:value}))}
 function reset(){setEditing('');setForm(empty)}
 function startEdit(row:CoaActivity){
   if(!row.operationCode){setMessage('Record legacy belum mempunyai Operation Code. Tambahkan kode baru, lalu arsipkan legacy bila diperlukan; data lama tetap ada.');return}
   setEditing(row.id);setForm({department:row.department,operationCode:row.operationCode,coaCode:row.coaCode,activityCategory:row.activityCategory,name:row.name});setMessage('')
 }
 async function writer(){
   if(!editable)throw new Error('Akses Edit Master Resource diperlukan.')
   if(!firestoreDb||!firebaseAuth?.currentUser)throw new Error('Sesi Firebase tidak tersedia.')
   const p=await getDoc(doc(firestoreDb,'users',firebaseAuth.currentUser.uid))
   if(!p.exists()||p.data().active!==true)throw new Error('Profil Firebase tidak aktif.')
   return{db:firestoreDb,username:catText(p.data().username)||user.username}
 }
 function audit(batch:ReturnType<typeof writeBatch>,db:NonNullable<typeof firestoreDb>,
    before:CoaActivity|undefined,after:ActivityCatalogInput,active:boolean,who:string,action:string,id:string){
   const ref=doc(collection(db,ACTIVITY_CATALOG_HISTORY))
   batch.set(ref,{catalogId:id,action,createdBy:who,createdAt:serverTimestamp(),
     before:before?{department:before.department,operationCode:before.operationCode,coaCode:before.coaCode,
       activityCategory:before.activityCategory,name:before.name,active:before.active}:null,
     after:{...after,active}})
 }
 async function save(){
   let next:ActivityCatalogInput
   try{next=parseActivityCatalogImport({Departement:form.department,'Operation Code':form.operationCode,
      COA:form.coaCode,'Activity Category':form.activityCategory,Activity:form.name})}
   catch(e){setMessage(e instanceof Error?e.message:'Activity tidak valid.');return}
   const id=editing||opCatalogId(next.operationCode)
   if(selected&&selected.operationCode!==next.operationCode){setMessage('Operation Code tidak boleh diubah. Buat kode baru lalu arsipkan kode lama.');return}
   if(rows.some(r=>r.id!==id&&r.operationCode===next.operationCode)){setMessage('Operation Code sudah dipakai baris lain.');return}
   setBusy(true)
   try{
     const{db,username}=await writer(),old=rows.find(r=>r.id===id)
     if(old&&catalogValuesEqual(old,next)){setMessage('Tidak ada perubahan.');return}
     const batch=writeBatch(db),active=old?.active!==false
     batch.set(doc(db,ACTIVITY_COA_COLLECTION,id),{...next,active,source:'WEB_MANUAL',
       updatedAt:serverTimestamp(),updatedBy:username,...(!old?{createdAt:serverTimestamp(),createdBy:username}:{})},{merge:true})
     audit(batch,db,old,next,active,username,old?'EDIT':'CREATE',id)
     await batch.commit();reset();await load('Activity berhasil disimpan. Riwayat dan referensi lama tetap ada.')
   }catch(e){setMessage(e instanceof Error?e.message:'Gagal menyimpan Activity.')}
   finally{setBusy(false)}
 }
 async function archive(row:CoaActivity){
   const nextActive=!row.active
   if(!window.confirm((nextActive?'Aktifkan':'Arsipkan')+' '+row.name+'? Semua riwayat Plan/QC tetap disimpan.'))return
   setBusy(true)
   try{
     const{db,username}=await writer(),batch=writeBatch(db)
     batch.set(doc(db,ACTIVITY_COA_COLLECTION,row.id),{active:nextActive,updatedAt:serverTimestamp(),updatedBy:username},{merge:true})
     audit(batch,db,row,{department:row.department,operationCode:row.operationCode,
       coaCode:row.coaCode,activityCategory:row.activityCategory,name:row.name},
       nextActive,username,nextActive?'RESTORE':'ARCHIVE',row.id)
     await batch.commit();await load(nextActive?'Activity aktif kembali.':'Activity diarsipkan tanpa menghapus record.')
   }catch(e){setMessage(e instanceof Error?e.message:'Gagal mengubah status.')}
   finally{setBusy(false)}
 }
 async function exportFile(){
   setBusy(true)
   try{
     const XLSX=await import('xlsx')
     const book=XLSX.utils.book_new()
     const cells=(r:CoaActivity)=>[r.department,r.operationCode,r.coaCode,r.activityCategory,r.name]
     XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([headers,...rows.filter(r=>r.active&&r.operationCode).map(cells)]),'Activity')
     XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([[...headers,'Status'],...rows.filter(r=>!r.active).map(r=>[...cells(r),'ARCHIVED'])]),'Arsip')
     XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([[...headers,'Status'],...rows.filter(r=>r.active&&!r.operationCode).map(r=>[...cells(r),'LEGACY'])]),'Legacy')
     XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([
       ['Keterangan','Petunjuk'],['Activity','Lima kolom sesuai file Activity.ods; hanya item ACTIVE dengan Operation Code.'],
       ['Import','Tidak menghapus item yang tidak ada di file. Perubahan ditampilkan sebelum disimpan.'],
       ['Arsip','Baris diarsipkan tetap ada; sheet Arsip tidak ikut diimport.'],
       ['Legacy','Master lama tanpa Operation Code disimpan terpisah, tidak dihapus.'],
       ['COA kosong','Boleh di master; Monthly Plan harus memiliki COA.'],
     ]),'Petunjuk')
     XLSX.writeFile(book,'Master_Activity_'+new Date().toISOString().slice(0,10)+'.xlsx')
     setMessage('Export selesai, termasuk Arsip dan Legacy pada sheet terpisah.')
   }catch(e){setMessage(e instanceof Error?e.message:'Export gagal.')}
   finally{setBusy(false)}
 }
 async function chooseFile(file:File|null){
   setPreview([]);setErrors([]);setFileName(file?.name||'')
   if(!file)return
   if(!/\.(ods|xlsx|xls)$/i.test(file.name)){setErrors(['Gunakan format .ods, .xlsx atau .xls.']);return}
   if(file.size>2_000_000){setErrors(['Ukuran maksimum file 2 MB.']);return}
   setBusy(true)
   try{
     const XLSX=await import('xlsx'),wb=XLSX.read(await file.arrayBuffer(),{type:'array'})
     const sheet=wb.Sheets.Activity||wb.Sheets[wb.SheetNames[0]]
     if(!sheet)throw new Error('Sheet Activity tidak ditemukan.')
     const header=(XLSX.utils.sheet_to_json<string[]>(sheet,{header:1,raw:false,defval:''})[0]||[]).map(catText)
     if(!['Operation Code','COA','Activity Category','Activity'].every(v=>header.includes(v))||
        !(header.includes('Departement')||header.includes('Department')))
       throw new Error('Header harus: Departement, Operation Code, COA, Activity Category, Activity.')
     const data=XLSX.utils.sheet_to_json<Record<string,unknown>>(sheet,{raw:false,defval:''})
     if(!data.length)throw new Error('Sheet Activity kosong.')
     if(data.length>limit)throw new Error('Import dibatasi '+limit+' baris agar transaksi tetap atomik.')
     const seen=new Set<string>(),valid:PreviewRow[]=[],invalid:string[]=[]
     data.forEach((r,i)=>{
       try{
         const value=parseActivityCatalogImport(r)
         if(seen.has(value.operationCode))throw new Error('Operation Code duplikat dalam file.')
         seen.add(value.operationCode)
         const matches=rows.filter(x=>x.operationCode===value.operationCode)
         if(matches.length>1)throw new Error('Operation Code duplikat pada database.')
         const prior=matches[0]||rows.find(x=>x.id===opCatalogId(value.operationCode))
         valid.push({value,line:i+2,prior,status:prior?(catalogValuesEqual(prior,value)?'SAME':'UPDATE'):'NEW'})
       }catch(e){invalid.push('Baris '+(i+2)+': '+(e instanceof Error?e.message:'Format tidak valid.'))}
     })
     setPreview(valid);setErrors(invalid)
     setMessage(invalid.length?'Perbaiki error sebelum import.':'Preview berhasil. Belum ada perubahan Firestore.')
   }catch(e){setErrors([e instanceof Error?e.message:'File tidak dapat dibaca.'])}
   finally{setBusy(false)}
 }
 async function importFile(){
   if(!preview.length||errors.length)return
   const changes=preview.filter(r=>r.status!=='SAME')
   if(!changes.length){setMessage('Semua baris sama dengan data master.');return}
   if(!window.confirm('Import '+changes.length+' perubahan dari '+fileName+'? Item yang tidak ada di file tidak akan dihapus.'))return
   setBusy(true)
   try{
     const{db,username}=await writer(),snap=await getDocs(collection(db,ACTIVITY_COA_COLLECTION))
     const latest=snap.docs.map(d=>parseCoaActivity(d.id,d.data() as Record<string,unknown>))
     for(const r of preview){
       const now=latest.find(x=>x.operationCode===r.value.operationCode||x.id===opCatalogId(r.value.operationCode))
       if((now?.id||'')!==(r.prior?.id||'')||
          (now&&r.prior&&(!catalogValuesEqual(now,r.prior)||now.active!==r.prior.active)))
         throw new Error('Master Activity berubah sejak preview. Refresh dan ulangi import.')
     }
     const batch=writeBatch(db)
     for(const r of changes){
       const id=r.prior?.id||opCatalogId(r.value.operationCode),active=r.prior?.active!==false
       batch.set(doc(db,ACTIVITY_COA_COLLECTION,id),{...r.value,active,
         source:'EXCEL_IMPORT',updatedBy:username,updatedAt:serverTimestamp(),
         ...(!r.prior?{createdAt:serverTimestamp(),createdBy:username}:{})},{merge:true})
       audit(batch,db,r.prior,r.value,active,username,r.prior?'IMPORT_UPDATE':'IMPORT_CREATE',id)
     }
     await batch.commit()
     setPreview([]);setErrors([]);setFileName('')
     await load('Import berhasil: '+changes.length+' perubahan. Master historis dan arsip tidak dihapus.')
   }catch(e){setMessage(e instanceof Error?e.message:'Import gagal.')}
   finally{setBusy(false)}
 }
 return <section className="master-activity-unified">
   <div className="section-head"><div><h2>Klasifikasi Activity</h2><p className="muted">Tabel tunggal 5 kolom seperti Activity.ods. Operation Code merupakan identitas unik; Activity dan COA dapat digunakan lebih dari satu departemen.</p></div><span className="badge">{rows.filter(x=>x.active).length} ACTIVE · {rows.filter(x=>!x.active).length} ARSIP</span></div>
   {message&&<div className="alert" role="status">{message}</div>}
   <div className="panel form-stack">
     <div className="section-head"><h3>{editing?'Edit Klasifikasi Activity':'Tambah Klasifikasi Activity'}</h3></div>
     <div className="form-grid">
       <label>Departement<input value={form.department} disabled={!editable||busy} onChange={e=>patch('department',e.target.value)} placeholder="Upkeep Manuring-Plant"/></label>
       <label>Operation Code<input value={form.operationCode} disabled={!editable||busy||Boolean(editing)} inputMode="numeric" maxLength={20} onChange={e=>patch('operationCode',e.target.value.replace(/[^0-9]/g,''))}/></label>
       <label>COA<input value={form.coaCode} disabled={!editable||busy} inputMode="numeric" maxLength={20} onChange={e=>patch('coaCode',e.target.value.replace(/[^0-9]/g,''))} placeholder="Boleh kosong bila belum tersedia"/></label>
       <label>Activity Category<input value={form.activityCategory} disabled={!editable||busy} onChange={e=>patch('activityCategory',e.target.value)} placeholder="Fertilizing"/></label>
       <label>Activity<input value={form.name} disabled={!editable||busy} onChange={e=>patch('name',e.target.value)} placeholder="Top Dressing"/></label>
     </div>
     <small>Operation Code tidak dapat diubah setelah tersimpan. Untuk mengganti kode, buat record baru dan arsipkan yang lama.</small>
     <div className="row-actions"><button type="button" className="primary" disabled={!editable||busy} onClick={()=>void save()}>{editing?'Simpan Perubahan':'Tambah Activity'}</button>{editing&&<button type="button" onClick={reset}>Batal Edit</button>}</div>
   </div>
   <div className="panel form-stack">
     <div className="section-head"><div><h3>Import / Export</h3><p className="muted">Import .ods/.xlsx/.xls; pratinjau, validasi, lalu konfirmasi. Tidak menghapus Activity yang tidak ada pada file.</p></div>
       <button type="button" disabled={busy} onClick={()=>void exportFile()}>Export Excel</button></div>
     <label>Import Activity (5 kolom)<input type="file" accept=".ods,.xlsx,.xls" disabled={!editable||busy} onChange={e=>void chooseFile(e.target.files?.[0]||null)}/></label>
     <small>COA kosong boleh di master, tetapi tidak dapat dipakai untuk Monthly baru. Arsip dan Legacy diekspor di sheet tersendiri.</small>
     {errors.length>0&&<div className="alert" role="alert">{errors.slice(0,15).map((err,i)=><div key={i}>{err}</div>)}</div>}
     {preview.length>0&&<><div className="row-actions"><span className="badge">Baru {preview.filter(x=>x.status==='NEW').length}</span><span className="badge">Update {preview.filter(x=>x.status==='UPDATE').length}</span><span className="badge">Sama {preview.filter(x=>x.status==='SAME').length}</span></div>
       <div className="table-wrap"><table><thead><tr><th>Baris</th>{headers.map(h=><th key={h}>{h}</th>)}<th>Hasil</th></tr></thead><tbody>{preview.slice(0,80).map(x=><tr key={x.line}><td>{x.line}</td><td>{x.value.department}</td><td>{x.value.operationCode}</td><td>{x.value.coaCode||'-'}</td><td>{x.value.activityCategory}</td><td>{x.value.name}</td><td>{x.status}</td></tr>)}</tbody></table></div>
       {preview.length>80&&<small>80 dari {preview.length} baris ditampilkan; seluruh baris tetap diproses.</small>}
       <div className="row-actions"><button type="button" className="primary" disabled={!editable||busy||errors.length>0} onClick={()=>void importFile()}>Konfirmasi Import ({preview.filter(x=>x.status!=='SAME').length} perubahan)</button><button type="button" disabled={busy} onClick={()=>{setPreview([]);setErrors([])}}>Batal</button></div></>}
   </div>
   <div className="panel form-stack">
     <div className="section-head"><div><h3>Daftar Activity</h3><p className="muted">Hapus diganti Arsipkan. Data dan seluruh riwayat tetap tersimpan.</p></div><button type="button" disabled={busy} onClick={()=>void load()}>Refresh</button></div>
     <div className="form-grid"><label>Cari di semua kolom<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Activity / Operation / COA"/></label><label>Status<select value={status} onChange={e=>setStatus(e.target.value as typeof status)}><option value="ACTIVE">ACTIVE</option><option value="ARCHIVED">ARSIP</option><option value="ALL">Semua / Legacy</option></select></label></div>
     <div className="table-wrap"><table><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}<th>Status</th><th>Aksi</th></tr></thead><tbody>{shown.map(r=><tr key={r.id}>
       <td>{r.department||'Legacy'}</td><td><code>{r.operationCode||'-'}</code></td><td><code>{r.coaCode||'-'}</code></td><td>{r.activityCategory||'-'}</td><td><strong>{r.name}</strong></td><td>{r.active?'ACTIVE':'ARSIP'}</td><td><div className="row-actions"><button type="button" disabled={!editable||busy||!r.operationCode} onClick={()=>startEdit(r)}>Edit</button><button type="button" disabled={!editable||busy} onClick={()=>void archive(r)}>{r.active?'Arsipkan':'Aktifkan'}</button></div></td>
     </tr>)}{!shown.length&&<tr><td colSpan={7} className="empty">Tidak ada Activity sesuai filter.</td></tr>}</tbody></table></div>
   </div>
 </section>
}
