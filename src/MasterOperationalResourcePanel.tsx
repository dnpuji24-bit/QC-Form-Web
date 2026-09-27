import { useEffect, useMemo, useState } from 'react'
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore'
import { firebaseAuth, firestoreDb } from './firebase'
import type { User } from './types'
import type { OperationalResourceKind } from './masterOperationalResources'

type Props={user:User}
type Row={id:string;name:string;active:boolean}
type Profile={active?:boolean;role?:string;username?:string}

const META:Record<OperationalResourceKind,{title:string;singular:string;collection:string;placeholder:string;example:string}>={
  unit:{title:'Master Unit',singular:'Unit',collection:'master_units',placeholder:'Contoh: Stool Splitter',example:'Ketik S → Stool Splitter'},
  shift:{title:'Master Shift',singular:'Shift',collection:'master_shifts',placeholder:'Contoh: 1',example:'Ketik 1 → Shift 1'},
  foreman:{title:'Master Mandor / Foreman',singular:'Mandor / Foreman',collection:'master_foremen',placeholder:'Contoh: Gusti',example:'Ketik G → Gusti'},
}

function text(value:unknown){return value===null||value===undefined?'':String(value).trim()}
function slug(value:string){const s=value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');return s.slice(0,80)||'item'}

async function writerContext(appUser:User){
  const db=firestoreDb,auth=firebaseAuth
  if(!db||!auth)throw new Error('Firebase belum tersedia.')
  const current=auth.currentUser
  if(!current)throw new Error('Sesi Firebase belum aktif. Login ulang lalu coba lagi.')
  const snap=await getDoc(doc(db,'users',current.uid))
  if(!snap.exists())throw new Error('Profil Firebase user tidak ditemukan.')
  const profile=snap.data() as Profile
  if(profile.active!==true)throw new Error('Profil Firebase tidak aktif.')
  if(!['owner','asisten'].includes(profile.role||'')||!['owner','asisten'].includes(appUser.role))throw new Error('Hanya Owner/Asisten yang dapat mengubah Master Resource.')
  return{db,username:profile.username||appUser.username}
}

export default function MasterOperationalResourcePanel({user}:Props){
  const[kind,setKind]=useState<OperationalResourceKind>('unit')
  const[rows,setRows]=useState<Row[]>([])
  const[value,setValue]=useState('')
  const[editingId,setEditingId]=useState('')
  const[busy,setBusy]=useState(false)
  const[message,setMessage]=useState('')
  const meta=META[kind]

  async function load(nextMessage=''){
    if(!firestoreDb)return
    setBusy(true)
    try{
      const snap=await getDocs(collection(firestoreDb,meta.collection))
      const next=snap.docs.map(item=>{const row=item.data() as Record<string,unknown>;return{id:item.id,name:text(row.name||row.label||row.value||item.id),active:row.active!==false}}).filter(row=>row.name).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}))
      setRows(next)
      if(nextMessage)setMessage(nextMessage)
    }catch(error){setMessage(error instanceof Error?error.message:'Master Resource gagal dimuat.')}
    finally{setBusy(false)}
  }

  useEffect(()=>{setValue('');setEditingId('');setMessage('');void load()},[kind])

  const activeCount=useMemo(()=>rows.filter(row=>row.active).length,[rows])

  async function save(){
    const name=value.trim()
    if(!name){setMessage(meta.singular+' wajib diisi.');return}
    const duplicate=rows.find(row=>row.id!==editingId&&row.name.toLowerCase()===name.toLowerCase())
    if(duplicate){setMessage(meta.singular+' tersebut sudah ada.');return}
    setBusy(true)
    try{
      const context=await writerContext(user),targetId=slug(name)
      await setDoc(doc(context.db,meta.collection,targetId),{name,active:true,updatedAt:serverTimestamp(),updatedBy:context.username,source:'WEB_MANUAL'},{merge:true})
      if(editingId&&editingId!==targetId)await deleteDoc(doc(context.db,meta.collection,editingId))
      setValue('');setEditingId('')
      await load(meta.singular+' berhasil disimpan.')
    }catch(error){setMessage(error instanceof Error?error.message:'Master Resource gagal disimpan.')}
    finally{setBusy(false)}
  }

  async function toggle(row:Row){
    setBusy(true)
    try{
      const context=await writerContext(user)
      await setDoc(doc(context.db,meta.collection,row.id),{active:!row.active,updatedAt:serverTimestamp(),updatedBy:context.username},{merge:true})
      await load(row.name+' '+(!row.active?'diaktifkan.':'dinonaktifkan.'))
    }catch(error){setMessage(error instanceof Error?error.message:'Status gagal diubah.')}
    finally{setBusy(false)}
  }

  async function remove(row:Row){
    if(user.role!=='owner'){setMessage('Hanya Owner yang dapat menghapus Master Resource.');return}
    if(!window.confirm('Hapus '+meta.singular+' "'+row.name+'"?'))return
    setBusy(true)
    try{
      const context=await writerContext(user)
      await deleteDoc(doc(context.db,meta.collection,row.id))
      if(editingId===row.id){setEditingId('');setValue('')}
      await load(row.name+' dihapus.')
    }catch(error){setMessage(error instanceof Error?error.message:'Data gagal dihapus.')}
    finally{setBusy(false)}
  }

  return <section>
    <div className="section-head"><div><div className="eyebrow">SMART SEARCH SOURCE</div><h2>Master Resource Operasional</h2><p className="muted">Unit, Shift, dan Mandor disimpan terpisah dari Activity. Data ini dipakai sebagai sumber smart search di Daily Plan, Actual Plan, dan Form QC.</p></div><button type="button" disabled={busy} onClick={()=>void load()}>{busy?'Memuat…':'Refresh'}</button></div>

    <div className="segmented" aria-label="Jenis Master Resource">
      <button type="button" className={kind==='unit'?'active':''} onClick={()=>setKind('unit')}>Unit</button>
      <button type="button" className={kind==='shift'?'active':''} onClick={()=>setKind('shift')}>Shift</button>
      <button type="button" className={kind==='foreman'?'active':''} onClick={()=>setKind('foreman')}>Mandor / Foreman</button>
    </div>

    {message&&<div className="alert">{message}</div>}

    <div className="panel form-stack">
      <div className="section-head"><div><h3>{editingId?'Edit ':'Tambah '}{meta.singular}</h3><p className="muted">{meta.example}. Smart search tidak mengikat resource ke Activity tertentu.</p></div><span className="badge">{activeCount} ACTIVE</span></div>
      <div className="form-grid">
        <label>{meta.singular}<input value={value} onChange={e=>setValue(e.target.value)} placeholder={meta.placeholder} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void save()}}}/></label>
        <div className="row-actions" style={{alignItems:'end'}}><button type="button" className="primary" disabled={busy} onClick={()=>void save()}>{editingId?'Simpan Perubahan':'Tambah'}</button>{editingId&&<button type="button" onClick={()=>{setEditingId('');setValue('')}}>Batal</button>}</div>
      </div>
    </div>

    <div className="panel">
      <div className="section-head"><div><h3>{meta.title}</h3><p className="muted">ACTIVE muncul pada smart search. INACTIVE tetap tersimpan tetapi tidak ditawarkan.</p></div><span className="badge">{rows.length} data</span></div>
      <div className="table-wrap"><table><thead><tr><th>{meta.singular}</th><th>Status</th><th>Aksi</th></tr></thead><tbody>
        {rows.map(row=><tr key={row.id}><td><strong>{row.name}</strong></td><td><span className="badge">{row.active?'ACTIVE':'INACTIVE'}</span></td><td><div className="row-actions"><button type="button" onClick={()=>{setEditingId(row.id);setValue(row.name)}}>Edit</button><button type="button" onClick={()=>void toggle(row)}>{row.active?'Nonaktifkan':'Aktifkan'}</button><button type="button" className="danger" disabled={user.role!=='owner'} onClick={()=>void remove(row)}>Hapus</button></div></td></tr>)}
        {!rows.length&&<tr><td colSpan={3} className="empty">Belum ada data {meta.singular}.</td></tr>}
      </tbody></table></div>
    </div>
  </section>
}
