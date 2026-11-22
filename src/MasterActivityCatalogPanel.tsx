import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore'
import { firebaseAuth, firestoreDb } from './firebase'
import { canEditAccess } from './accessControl'
import type { User } from './types'

export const ACTIVITY_COA_COLLECTION = 'master_activity_catalog'
export type CoaActivity = { id:string; name:string; coaCode:string; active:boolean }

function text(value:unknown):string { return String(value ?? '').trim() }
function catalogId(name:string):string {
  return name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,90)
}
export function parseCoaActivity(id:string,value:Record<string,unknown>):CoaActivity {
  return {id,name:text(value.name),coaCode:text(value.coaCode),active:value.active!==false}
}

export default function MasterActivityCatalogPanel({user}:{user:User}){
  const [rows,setRows]=useState<CoaActivity[]>([])
  const [name,setName]=useState('')
  const [coaCode,setCoaCode]=useState('')
  const [editing,setEditing]=useState('')
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const editable=canEditAccess(user,'data_master_activity_resources')
  const current=useMemo(()=>rows.find(row=>row.id===editing),[rows,editing])

  async function load(){
    if(!firestoreDb)return
    setBusy(true)
    try{
      const snap=await getDocs(collection(firestoreDb,ACTIVITY_COA_COLLECTION))
      setRows(snap.docs.map(d=>parseCoaActivity(d.id,d.data() as Record<string,unknown>)).filter(x=>x.name).sort((a,b)=>a.name.localeCompare(b.name,'id')))
    }catch(error){setMessage(error instanceof Error?error.message:'Gagal memuat Master Activity dan CoA.')}
    finally{setBusy(false)}
  }
  useEffect(()=>{void load()},[])

  function startEdit(row:CoaActivity){setEditing(row.id);setName(row.name);setCoaCode(row.coaCode);setMessage('')}
  function reset(){setEditing('');setName('');setCoaCode('')}
  async function writer(){
    if(!editable)throw new Error('Akses Edit Master Resource diperlukan.')
    if(!firestoreDb||!firebaseAuth?.currentUser)throw new Error('Sesi Firebase tidak tersedia.')
    const snap=await getDoc(doc(firestoreDb,'users',firebaseAuth.currentUser.uid))
    if(!snap.exists()||snap.data().active!==true)throw new Error('Akun Firebase tidak aktif.')
    return {db:firestoreDb,username:text(snap.data().username)||user.username}
  }
  async function save(){
    const cleanName=name.trim(),cleanCoa=coaCode.trim()
    if(!cleanName){setMessage('Nama Activity wajib diisi.');return}
    if(!/^\d{1,20}$/.test(cleanCoa)){setMessage('CoA harus berupa 1–20 digit. Kode berawalan nol tetap disimpan sebagai teks.');return}
    const id=editing||catalogId(cleanName)
    if(!id){setMessage('Nama Activity tidak valid.');return}
    if(rows.some(x=>x.id!==id&&x.name.toLocaleLowerCase('id-ID')===cleanName.toLocaleLowerCase('id-ID'))){setMessage('Nama Activity sudah dipakai.');return}
    if(rows.some(x=>x.id!==id&&x.active&&x.coaCode===cleanCoa)){setMessage('Kode CoA sudah digunakan Activity ACTIVE lain.');return}
    setBusy(true)
    try{
      const ctx=await writer()
      await setDoc(doc(ctx.db,ACTIVITY_COA_COLLECTION,id),{name:cleanName,coaCode:cleanCoa,active:current?.active!==false,updatedAt:serverTimestamp(),updatedBy:ctx.username,source:'WEB_MANUAL'},{merge:true})
      reset();await load();setMessage('Master Activity dan CoA berhasil disimpan. List Validasi sekarang dapat memilihnya.')
    }catch(err){setMessage(err instanceof Error?err.message:'Master Activity gagal disimpan.')}
    finally{setBusy(false)}
  }
  async function toggle(row:CoaActivity){
    setBusy(true)
    try{
      const ctx=await writer()
      await setDoc(doc(ctx.db,ACTIVITY_COA_COLLECTION,row.id),{active:!row.active,updatedAt:serverTimestamp(),updatedBy:ctx.username},{merge:true})
      await load();setMessage('Status Activity diperbarui tanpa menghapus riwayat.')
    }catch(err){setMessage(err instanceof Error?err.message:'Status gagal diubah.')}
    finally{setBusy(false)}
  }

  return <div className="master-activity-coa-catalog">
    <div className="panel form-stack">
      <div className="section-head"><div><h3>Master Activity & CoA</h3><p className="muted">Sumber Activity untuk List Validasi dan Monthly Plan. Setiap Activity mempunyai satu kode CoA. Kode disimpan sebagai teks.</p></div><span className="badge">{rows.filter(x=>x.active).length} ACTIVE</span></div>
      {message&&<div className="alert" role="status">{message}</div>}
      <div className="form-grid">
        <label>Activity<input value={name} readOnly={Boolean(editing)} disabled={!editable} onChange={e=>setName(e.target.value)} placeholder="Contoh: Top Dressing"/></label>
        <label>Kode CoA<input value={coaCode} disabled={!editable} onChange={e=>setCoaCode(e.target.value.replace(/[^0-9]/g,''))} inputMode="numeric" placeholder="Contoh: 1109087" maxLength={20}/><small>Kode manual. Jika berubah, WO yang sudah disimpan tetap memakai snapshot CoA historis.</small></label>
      </div>
      <div className="row-actions"><button type="button" className="primary" disabled={busy||!editable} onClick={()=>void save()}>{editing?'Simpan Perubahan CoA':'Tambah Master Activity'}</button>{editing&&<button type="button" onClick={reset}>Batal Edit</button>}</div>
    </div>
    <div className="panel"><div className="section-head"><h3>Daftar Activity–CoA</h3><button type="button" onClick={()=>void load()} disabled={busy}>Refresh</button></div>
      <div className="table-wrap"><table><thead><tr><th>Activity</th><th>CoA</th><th>Status</th><th>Aksi</th></tr></thead><tbody>
        {rows.map(row=><tr key={row.id}><td><strong>{row.name}</strong></td><td><code>{row.coaCode||'-'}</code></td><td>{row.active?'ACTIVE':'INACTIVE'}</td><td><div className="row-actions"><button type="button" disabled={!editable||busy} onClick={()=>startEdit(row)}>Edit CoA</button><button type="button" disabled={!editable||busy} onClick={()=>void toggle(row)}>{row.active?'Nonaktifkan':'Aktifkan'}</button></div></td></tr>)}
        {!rows.length&&<tr><td colSpan={4} className="empty">Belum ada Master Activity. Tambahkan Activity dan CoA di atas.</td></tr>}
      </tbody></table></div>
    </div>
  </div>
}
