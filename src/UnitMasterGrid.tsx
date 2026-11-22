import {useEffect,useMemo,useState} from 'react'
import {collection,doc,getDoc,getDocsFromServer,serverTimestamp,setDoc,writeBatch} from 'firebase/firestore'
import {firebaseAuth,firebaseAuthPersistenceReady,firestoreDb} from './firebase'
import {canEditAccess} from './accessControl'
import type {User} from './types'
import {conditionAt,dateMinute,key,normalizeEvent,type UnitCondition,type UnitEvent,type UnitNumber} from './unitDispatchModel'

type Kind={id:string;name:string}
type Status='READY'|'BREAKDOWN'|'MAINTENANCE'|'OUT_OF_SERVICE'
type Editable={kindId:string;implement:string;brand:string;model:string;notes:string;year:string;serialNo:string;status:Status}
type Props={user:User;units:UnitNumber[];kinds:Kind[];events:UnitEvent[];onSaved:()=>void}
const isEditor=(user:User)=>canEditAccess(user,'data_unit_dispatch')&&(user.role==='owner'||user.role==='asisten')
function siteNow(){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Jayapura',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date())
  const p=(k:string)=>parts.find(v=>v.type===k)?.value||''
  const date=p('year')+'-'+p('month')+'-'+p('day'),time=p('hour')+':'+p('minute')
  return{date,time,minute:dateMinute(date,time),shift:time<'15:00'?'1':'2'}
}
const fieldStyle={minWidth:105,width:'100%',padding:'7px 8px',border:'1px solid #cbd5e1',borderRadius:5,background:'#fff',fontSize:13} as const
const cellStyle={padding:'8px 7px',borderBottom:'1px solid #e2e8f0',verticalAlign:'top' as const}
function editableRow(u:UnitNumber,kinds:Kind[],events:UnitEvent[]):Editable{
  const status=conditionAt(events,u.id,siteNow().minute)
  return{kindId:u.parentUnitId||kinds.find(k=>key(k.name)===key(u.kind))?.id||'',
    implement:u.implement,brand:u.brand,model:u.model,notes:u.notes,year:u.year||'',serialNo:u.serialNo||'',
    status:status==='PENDING_INSPECTION'?'READY':status}
}
export default function UnitMasterGrid({user,units,kinds,events,onSaved}:Props){
  const editor=isEditor(user)
  const [query,setQuery]=useState(''),[filter,setFilter]=useState('ALL'),[drafts,setDrafts]=useState<Record<string,Editable>>({})
  const [newOpen,setNewOpen]=useState(false),[newCode,setNewCode]=useState(''),[newRow,setNewRow]=useState<Editable>({kindId:'',implement:'',brand:'',model:'',notes:'',year:'',serialNo:'',status:'READY'})
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('')
  useEffect(()=>{setDrafts({})},[units,events,kinds])
  const draftsFor=(u:UnitNumber)=>drafts[u.id]||editableRow(u,kinds,events)
  function dirty(u:UnitNumber){return JSON.stringify(draftsFor(u))!==JSON.stringify(editableRow(u,kinds,events))}
  const changed=units.filter(dirty)
  function patch(u:UnitNumber,field:keyof Editable,value:string){
    setDrafts(d=>({...d,[u.id]:{...draftsFor(u),[field]:value}}))
    setMessage('')
  }
  const filtered=useMemo(()=>units.filter(u=>{
    const row=drafts[u.id]||editableRow(u,kinds,events)
    const q=query.trim().toLowerCase()
    const matches=!q||[u.code,u.kind,row.implement,row.brand,row.model,row.notes,row.year,row.serialNo].some(v=>v.toLowerCase().includes(q))
    return matches&&(filter==='ALL'||row.status===filter)
  }),[units,drafts,query,filter,events,kinds])
  async function actor(){
    if(!firestoreDb||!firebaseAuth)throw Error('Firebase belum tersedia.')
    await firebaseAuthPersistenceReady
    if(typeof firebaseAuth.authStateReady==='function')await firebaseAuth.authStateReady()
    const current=firebaseAuth.currentUser
    if(!current)throw Error('Login Firebase diperlukan.')
    const profile=await getDoc(doc(firestoreDb,'users',current.uid))
    if(!profile.exists()||profile.data().active!==true)throw Error('Profil tidak aktif.')
    return{db:firestoreDb,uid:current.uid,name:String(profile.data().username||'')}
  }
  async function saveRows(rows:UnitNumber[]){
    if(!editor||busy||!rows.length)return
    setBusy(true);setMessage('')
    try{
      const {db,uid,name}=await actor(),now=siteNow()
      const latest=await getDocsFromServer(collection(db,'unit_events'))
      const latestEvents=latest.docs.map(d=>normalizeEvent(d.id,d.data()))
      const batch=writeBatch(db)
      let ops=0
      for(const u of rows){
        const desired=draftsFor(u),base=editableRow(u,kinds,events),kind=kinds.find(k=>k.id===desired.kindId)
        if(!kind)throw Error('Jenis unit untuk '+u.code+' harus dipilih.')
        if(desired.notes.length>1500)throw Error('Keterangan '+u.code+' maksimal 1.500 karakter.')
        if(desired.status!==base.status){
          if(conditionAt(latestEvents,u.id,now.minute)!==base.status)throw Error('Status '+u.code+' telah berubah dari perangkat lain. Refresh lalu edit ulang.')
          if(['BREAKDOWN','MAINTENANCE'].includes(desired.status)&&!desired.notes.trim())throw Error('Isi keterangan kerusakan atau Maintenance untuk '+u.code+'.')
          const id='ue_grid_'+u.id.replace(/[^a-zA-Z0-9_-]/g,'-')+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7)
          batch.set(doc(db,'unit_events',id),{
            unitId:u.id,unitCode:u.code,type:desired.status,date:now.date,shift:now.shift,
            effectiveMinute:now.minute,note:desired.notes.trim()||'Status diubah melalui tabel Master Unit',
            actorUid:uid,actorName:name,createdAt:serverTimestamp()
          })
          ops++
        }
        // Never change the physical unit's stable code/document ID.
        batch.update(doc(db,'master_unit_numbers',u.id),{
          parentUnitId:kind.id,parentUnitName:kind.name,implement:desired.implement,
          brand:desired.brand,model:desired.model,notes:desired.notes,year:desired.year,
          serialNo:desired.serialNo,importNeedsInspection:false,
          updatedByUid:uid,updatedBy:name,updatedAt:serverTimestamp()
        })
        ops++
      }
      if(ops>450)throw Error('Terlalu banyak baris untuk disimpan sekaligus; simpan sebagian dahulu.')
      await batch.commit()
      setMessage(rows.length+' baris unit tersimpan. Perubahan kondisi langsung berlaku untuk Shift 1 dan Shift 2.')
      setDrafts({});onSaved()
    }catch(e){setMessage(e instanceof Error?e.message:'Penyimpanan gagal.')}finally{setBusy(false)}
  }
  async function addUnit(){
    if(!editor||busy)return
    const code=newCode.trim().toUpperCase(),kind=kinds.find(k=>k.id===newRow.kindId)
    if(!code||!kind){setMessage('Kode unit dan jenis equipment wajib diisi.');return}
    if(units.some(u=>key(u.code)===key(code))){setMessage('Kode unit '+code+' sudah terdaftar.');return}
    if(['BREAKDOWN','MAINTENANCE'].includes(newRow.status)&&!newRow.notes.trim()){setMessage('Isi keterangan unit yang Breakdown atau Maintenance.');return}
    setBusy(true);setMessage('')
    try{
      const{db,uid,name}=await actor(),now=siteNow()
      const id=(kind.name+'-'+code).toLowerCase().replace(/[^a-z0-9]+/g,'-')
      const ref=doc(db,'master_unit_numbers',id)
      if((await getDoc(ref)).exists())throw Error('Kode unit sudah ada pada Firestore. Refresh untuk melihat data terbaru.')
      const batch=writeBatch(db)
      batch.set(ref,{
        name:code,parentUnitId:kind.id,parentUnitName:kind.name,active:true,
        brand:newRow.brand,model:newRow.model,implement:newRow.implement,
        year:newRow.year,serialNo:newRow.serialNo,notes:newRow.notes,
        importNeedsInspection:false,createdBy:name,createdByUid:uid,
        createdAt:serverTimestamp(),updatedAt:serverTimestamp()
      })
      if(newRow.status!=='READY'){
        batch.set(doc(db,'unit_events','ue_grid_'+id+'_'+Date.now().toString(36)),{
          unitId:id,unitCode:code,type:newRow.status,date:now.date,shift:now.shift,
          effectiveMinute:now.minute,note:newRow.notes,actorUid:uid,actorName:name,
          createdAt:serverTimestamp()
        })
      }
      await batch.commit()
      setNewOpen(false);setNewCode('')
      setNewRow({kindId:'',implement:'',brand:'',model:'',notes:'',year:'',serialNo:'',status:'READY'})
      setMessage('Unit '+code+' ditambahkan dan tersedia untuk kedua shift selama kondisinya Ready.')
      onSaved()
    }catch(e){setMessage(e instanceof Error?e.message:'Unit gagal ditambahkan.')}finally{setBusy(false)}
  }
  return <section className="panel unit-master-sheet" style={{marginTop:12}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
      <div><h3>Master Unit — Tabel Edit Cepat</h3>
      <p className="muted">Semua unit dapat dipakai di Shift 1 maupun Shift 2. Klik sel untuk mengedit. Status langsung berlaku tanpa approval; penugasan tetap mencegah jam bertabrakan.</p></div>
      {editor&&<div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        <button type="button" onClick={()=>setNewOpen(v=>!v)} disabled={busy}>＋ Tambah Unit</button>
        <button type="button" className="primary" disabled={busy||!changed.length} onClick={()=>void saveRows(changed)}>Simpan Semua Perubahan ({changed.length})</button>
      </div>}
    </div>
    {message&&<p role="status" className="alert">{message}</p>}
    <div style={{display:'flex',gap:10,flexWrap:'wrap',margin:'12px 0'}}>
      <label style={{flex:'2 1 220px'}}>Cari Unit / Implement / Keterangan
        <input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Contoh DT123T atau WATER TANK"/>
      </label>
      <label style={{flex:'1 1 150px'}}>Filter kondisi
        <select value={filter} onChange={e=>setFilter(e.target.value)}>
          <option value="ALL">Semua</option><option value="READY">Ready</option>
          <option value="BREAKDOWN">Breakdown</option><option value="MAINTENANCE">Maintenance</option>
          <option value="OUT_OF_SERVICE">Out of Service</option>
        </select>
      </label>
    </div>
    {newOpen&&editor&&<div style={{padding:12,borderRadius:8,background:'#f3f7fb',marginBottom:10,display:'grid',gap:8}}>
      <strong>Tambah unit fisik</strong>
      <div className="form-grid">
        <label>Kode Unit<input value={newCode} onChange={e=>setNewCode(e.target.value.toUpperCase())} placeholder="DT123T"/></label>
        <label>Jenis Unit<select value={newRow.kindId} onChange={e=>setNewRow(r=>({...r,kindId:e.target.value}))}><option value="">Pilih jenis</option>{kinds.map(k=><option key={k.id} value={k.id}>{k.name}</option>)}</select></label>
        <label>Implement<input value={newRow.implement} onChange={e=>setNewRow(r=>({...r,implement:e.target.value}))}/></label>
        <label>Brand<input value={newRow.brand} onChange={e=>setNewRow(r=>({...r,brand:e.target.value}))}/></label>
        <label>Model<input value={newRow.model} onChange={e=>setNewRow(r=>({...r,model:e.target.value}))}/></label>
        <label>Kondisi<select value={newRow.status} onChange={e=>setNewRow(r=>({...r,status:e.target.value as Status}))}>
          <option value="READY">Ready</option><option value="BREAKDOWN">Breakdown</option><option value="MAINTENANCE">Maintenance</option><option value="OUT_OF_SERVICE">Out of Service</option>
        </select></label>
      </div>
      <label>Keterangan<textarea rows={2} value={newRow.notes} onChange={e=>setNewRow(r=>({...r,notes:e.target.value}))}/></label>
      <button type="button" className="primary" disabled={busy} onClick={()=>void addUnit()}>Simpan Unit Baru</button>
    </div>}
    <div className="table-wrap" style={{maxHeight:610,overflow:'auto',border:'1px solid #d8e0ec',borderRadius:8}}>
      <table style={{width:'100%',minWidth:1110,borderCollapse:'separate',borderSpacing:0,fontSize:13}}>
        <thead><tr>{['No','Kode Unit','Jenis Equipment','Implement','Brand','Model','Tahun','Serial No','Kondisi','Shift','Keterangan','Aksi'].map(h=>
          <th key={h} style={{...cellStyle,position:'sticky',top:0,background:'#eaf0f7',zIndex:1,whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead>
        <tbody>{filtered.map((u,i)=>{
          const row=draftsFor(u),changedRow=dirty(u)
          const field=(name:keyof Editable,placeholder='')=><input aria-label={name+' '+u.code} style={fieldStyle} value={row[name]} placeholder={placeholder} disabled={!editor||busy} onChange={e=>patch(u,name,e.target.value)}/>
          return <tr key={u.id} style={{background:changedRow?'#fff8e4':i%2?'#f8fafc':'#fff'}}>
            <td style={cellStyle}>{i+1}</td><td style={{...cellStyle,whiteSpace:'nowrap'}}><strong>{u.code}</strong></td>
            <td style={cellStyle}><select style={fieldStyle} disabled={!editor||busy} value={row.kindId} onChange={e=>patch(u,'kindId',e.target.value)}>{!row.kindId&&<option value="">Pilih</option>}{kinds.map(k=><option key={k.id} value={k.id}>{k.name}</option>)}</select></td>
            <td style={cellStyle}>{field('implement')}</td>
            <td style={cellStyle}>{field('brand')}</td>
            <td style={cellStyle}>{field('model')}</td>
            <td style={cellStyle}>{field('year')}</td>
            <td style={cellStyle}>{field('serialNo')}</td>
            <td style={cellStyle}><select style={{...fieldStyle,minWidth:140,fontWeight:600}} disabled={!editor||busy} value={row.status} onChange={e=>patch(u,'status',e.target.value)}>
              <option value="READY">Ready</option><option value="BREAKDOWN">Breakdown</option><option value="MAINTENANCE">Maintenance</option><option value="OUT_OF_SERVICE">Out of Service</option>
            </select></td>
            <td style={{...cellStyle,whiteSpace:'nowrap'}}>1 &amp; 2</td>
            <td style={cellStyle}><textarea aria-label={'Keterangan '+u.code} rows={2} style={{...fieldStyle,minWidth:210,resize:'vertical'}} value={row.notes} disabled={!editor||busy} onChange={e=>patch(u,'notes',e.target.value)}/></td>
            <td style={cellStyle}>{editor&&<button type="button" disabled={!changedRow||busy} onClick={()=>void saveRows([u])}>Simpan</button>}{changedRow&&<span style={{display:'block',fontSize:11,color:'#a16207'}}>Belum disimpan</span>}</td>
          </tr>
        })}</tbody>
      </table>
    </div>
    {!filtered.length&&<p className="muted">Tidak ada unit sesuai pencarian.</p>}
    <small className="muted">Menampilkan {filtered.length} dari {units.length} unit. Geser tabel secara horizontal untuk melihat seluruh kolom. Kode unit yang sudah tercatat tidak diedit agar relasi Daily Plan tetap aman.</small>
  </section>
}
