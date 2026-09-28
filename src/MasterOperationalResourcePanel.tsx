import { useEffect, useMemo, useState } from 'react'
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore'
import { firebaseAuth, firestoreDb } from './firebase'
import type { User } from './types'
import { canEditAccess } from './accessControl'
import { OPERATIONAL_RESOURCE_COLLECTIONS, type OperationalResourceKind } from './masterOperationalResources'
import YinYangRefreshButton from './YinYangRefreshButton'

type Props={user:User}
type Row={id:string;name:string;active:boolean;parentUnitId?:string;parentUnitName?:string}
type Profile={active?:boolean;role?:string;username?:string}
type GroupKey='unit'|'supervision'|'field'

const GROUPS:Record<GroupKey,{label:string;hint:string;kinds:OperationalResourceKind[]}>={
  unit:{label:'Unit & Equipment',hint:'Jenis unit, nomor unit, nozzle, dan dropper.',kinds:['unit','unit_number','nozzle','dropper']},
  supervision:{label:'Supervisi',hint:'Shift, Mandor / Foreman, dan Asisten.',kinds:['shift','foreman','assistant']},
  field:{label:'Kondisi Lapangan',hint:'Water Quality dan Weather Condition.',kinds:['water_quality','weather_condition']},
}

const META:Record<OperationalResourceKind,{title:string;singular:string;placeholder:string;example:string}>={
  unit:{title:'Jenis Unit / Equipment',singular:'Jenis Unit / Equipment',placeholder:'Contoh: Stool Splitter',example:'Ketik S → Stool Splitter'},
  unit_number:{title:'No. Unit',singular:'No. Unit',placeholder:'Contoh: TR072G',example:'No. Unit wajib terhubung ke Jenis Unit / Equipment'},
  nozzle:{title:'Nozzle',singular:'Nozzle',placeholder:'Contoh: AIXR 11004',example:'Ketik A → AIXR 11004'},
  dropper:{title:'Dropper',singular:'Dropper',placeholder:'Contoh: Yes / No / Dropper 30 cm',example:'Pilihan dropper untuk Form QC Spraying'},
  shift:{title:'Shift',singular:'Shift',placeholder:'Contoh: 1',example:'Ketik 1 → Shift 1'},
  foreman:{title:'Mandor / Foreman',singular:'Mandor / Foreman',placeholder:'Contoh: Gusti',example:'Ketik G → Gusti'},
  assistant:{title:'Asisten',singular:'Asisten',placeholder:'Contoh: Alberto',example:'Nama Asisten untuk Form QC'},
  water_quality:{title:'Water Quality',singular:'Water Quality',placeholder:'Contoh: Clear / Good',example:'Kualitas air untuk Form QC Spraying'},
  weather_condition:{title:'Weather Condition',singular:'Weather Condition',placeholder:'Contoh: Cerah',example:'Kondisi cuaca untuk Form QC Spraying'},
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
  if(!canEditAccess(appUser,'data_master_activity_resources'))throw new Error('Hak akses Edit Master Resource belum diberikan.')
  return{db,username:profile.username||appUser.username}
}

export default function MasterOperationalResourcePanel({user}:Props){
  const[group,setGroup]=useState<GroupKey>('unit')
  const[kind,setKind]=useState<OperationalResourceKind>('unit')
  const[rows,setRows]=useState<Row[]>([])
  const[unitRows,setUnitRows]=useState<Row[]>([])
  const[value,setValue]=useState('')
  const[parentUnitId,setParentUnitId]=useState('')
  const[editingId,setEditingId]=useState('')
  const[busy,setBusy]=useState(false)
  const[message,setMessage]=useState('')
  const meta=META[kind]
  const collectionName=OPERATIONAL_RESOURCE_COLLECTIONS[kind]

  async function load(nextMessage=''){
    if(!firestoreDb)return
    setBusy(true)
    try{
      const [snap,unitsSnap]=await Promise.all([
        getDocs(collection(firestoreDb,collectionName)),
        getDocs(collection(firestoreDb,OPERATIONAL_RESOURCE_COLLECTIONS.unit)),
      ])
      const next=snap.docs.map(item=>{const row=item.data() as Record<string,unknown>;return{id:item.id,name:text(row.name||row.label||row.value||item.id),active:row.active!==false,parentUnitId:text(row.parentUnitId)||undefined,parentUnitName:text(row.parentUnitName)||undefined}}).filter(row=>row.name).sort((a,b)=>(a.parentUnitName||'').localeCompare(b.parentUnitName||'',undefined,{numeric:true})||a.name.localeCompare(b.name,undefined,{numeric:true}))
      const units=unitsSnap.docs.map(item=>{const row=item.data() as Record<string,unknown>;return{id:item.id,name:text(row.name||row.label||row.value||item.id),active:row.active!==false}}).filter(row=>row.name&&row.active).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}))
      setRows(next);setUnitRows(units)
      if(nextMessage)setMessage(nextMessage)
    }catch(error){setMessage(error instanceof Error?error.message:'Master Resource gagal dimuat.')}
    finally{setBusy(false)}
  }

  useEffect(()=>{setValue('');setParentUnitId('');setEditingId('');setMessage('');void load()},[kind])

  const activeCount=useMemo(()=>rows.filter(row=>row.active).length,[rows])
  const selectedParent=unitRows.find(row=>row.id===parentUnitId)

  function switchGroup(next:GroupKey){setGroup(next);setKind(GROUPS[next].kinds[0])}

  async function save(){
    const name=value.trim()
    if(!name){setMessage(meta.singular+' wajib diisi.');return}
    if(kind==='unit_number'&&!selectedParent){setMessage('Pilih Jenis Unit / Equipment untuk No. Unit tersebut.');return}
    const duplicate=rows.find(row=>row.id!==editingId&&row.name.toLowerCase()===name.toLowerCase()&&(kind!=='unit_number'||row.parentUnitId===selectedParent?.id))
    if(duplicate){setMessage(meta.singular+' tersebut sudah ada.');return}
    setBusy(true)
    try{
      const context=await writerContext(user)
      const targetId=kind==='unit_number'?slug((selectedParent?.name||'unit')+'-'+name):slug(name)
      const payload:Record<string,unknown>={name,active:true,updatedAt:serverTimestamp(),updatedBy:context.username,source:'WEB_MANUAL'}
      if(kind==='unit_number'){payload.parentUnitId=selectedParent?.id||'';payload.parentUnitName=selectedParent?.name||''}
      await setDoc(doc(context.db,collectionName,targetId),payload,{merge:true})
      if(kind==='unit'&&editingId){
        const numberSnap=await getDocs(collection(context.db,OPERATIONAL_RESOURCE_COLLECTIONS.unit_number))
        await Promise.all(numberSnap.docs.filter(item=>text((item.data() as Record<string,unknown>).parentUnitId)===editingId).map(item=>setDoc(doc(context.db,OPERATIONAL_RESOURCE_COLLECTIONS.unit_number,item.id),{parentUnitId:targetId,parentUnitName:name,updatedAt:serverTimestamp(),updatedBy:context.username},{merge:true})))
      }
      if(editingId&&editingId!==targetId)await deleteDoc(doc(context.db,collectionName,editingId))
      setValue('');setParentUnitId('');setEditingId('')
      await load(meta.singular+' berhasil disimpan.')
    }catch(error){setMessage(error instanceof Error?error.message:'Master Resource gagal disimpan.')}
    finally{setBusy(false)}
  }

  async function toggle(row:Row){
    setBusy(true)
    try{
      const context=await writerContext(user)
      await setDoc(doc(context.db,collectionName,row.id),{active:!row.active,updatedAt:serverTimestamp(),updatedBy:context.username},{merge:true})
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
      await deleteDoc(doc(context.db,collectionName,row.id))
      if(editingId===row.id){setEditingId('');setValue('');setParentUnitId('')}
      await load(row.name+' dihapus.')
    }catch(error){setMessage(error instanceof Error?error.message:'Data gagal dihapus.')}
    finally{setBusy(false)}
  }

  function startEdit(row:Row){setEditingId(row.id);setValue(row.name);setParentUnitId(row.parentUnitId||'')}

  return <section className="master-resource-panel">
    <div className="section-head master-resource-title"><div><div className="eyebrow">FIRESTORE INPUT MASTER</div><h2>Master Resource Operasional</h2></div><YinYangRefreshButton busy={busy} label="Refresh" onClick={()=>void load()}/></div>

    <div className="resource-group-grid">
      {(Object.keys(GROUPS) as GroupKey[]).map(key=><button type="button" key={key} className={`resource-group-card ${group===key?'active':''}`} onClick={()=>switchGroup(key)}><strong>{GROUPS[key].label}</strong><small>{GROUPS[key].hint}</small></button>)}
    </div>

    <div className="segmented resource-kind-tabs" aria-label="Jenis Master Resource">
      {GROUPS[group].kinds.map(item=><button type="button" key={item} className={kind===item?'active':''} onClick={()=>setKind(item)}>{META[item].title}</button>)}
    </div>

    {message&&<div className="alert">{message}</div>}

    <div className="panel resource-editor">
      <div className="section-head"><div><h3>{editingId?'Edit ':'Tambah '}{meta.singular}</h3></div><span className="badge">{activeCount} ACTIVE</span></div>
      <div className={`form-grid ${kind==='unit_number'?'resource-unit-link-grid':''}`}>
        {kind==='unit_number'&&<label>Jenis Unit / Equipment<select value={parentUnitId} onChange={e=>setParentUnitId(e.target.value)}><option value="">Pilih Jenis Unit…</option>{unitRows.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}
        <label>{meta.singular}<input value={value} onChange={e=>setValue(e.target.value)} placeholder={meta.placeholder} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void save()}}}/><small>{meta.example}</small></label>
        <div className="row-actions resource-save-actions"><button type="button" className="primary" disabled={busy} onClick={()=>void save()}>{editingId?'Simpan Perubahan':'Tambah'}</button>{editingId&&<button type="button" onClick={()=>{setEditingId('');setValue('');setParentUnitId('')}}>Batal</button>}</div>
      </div>
    </div>

    <div className="panel resource-table-panel">
      <div className="section-head"><div><h3>{meta.title}</h3></div><span className="badge">{rows.length} data</span></div>
      <div className="table-wrap"><table><thead><tr><th>{meta.singular}</th>{kind==='unit_number'&&<th>Jenis Unit / Equipment</th>}<th>Status</th><th>Aksi</th></tr></thead><tbody>
        {rows.map(row=><tr key={row.id}><td><strong>{row.name}</strong></td>{kind==='unit_number'&&<td>{row.parentUnitName||'-'}</td>}<td><span className="badge">{row.active?'ACTIVE':'INACTIVE'}</span></td><td><div className="row-actions"><button type="button" onClick={()=>startEdit(row)}>Edit</button><button type="button" onClick={()=>void toggle(row)}>{row.active?'Nonaktifkan':'Aktifkan'}</button><button type="button" className="danger" disabled={user.role!=='owner'} onClick={()=>void remove(row)}>Hapus</button></div></td></tr>)}
        {!rows.length&&<tr><td colSpan={kind==='unit_number'?4:3} className="empty">Belum ada data {meta.singular}.</td></tr>}
      </tbody></table></div>
    </div>
  </section>
}
