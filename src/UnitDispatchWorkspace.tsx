import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore'
import { firebaseAuth, firebaseAuthPersistenceReady, firestoreDb } from './firebase'
import { canEditAccess } from './accessControl'
import type { User } from './types'
import { assignmentConflict, clean, conditionAt, count, dateMinute, key, normalizeAssignment, normalizeEvent, normalizeUnitNumber, overlaps, shiftWindow, slotCoverage, timeWindow, unitMatches, type UnitAssignment, type UnitCondition, type UnitEvent, type UnitEventType, type UnitNumber, type UnitRequirement } from './unitDispatchModel'

type Raw = Record<string,unknown>
type Kind={id:string;name:string}
type Props={user:User; initialDate?:string}
type Tab='dispatch'|'units'|'events'
const dateToday=()=>new Date().toISOString().slice(0,10)
const idNew=()=>Math.random().toString(36).slice(2,11)+Date.now().toString(36)
const fmt=(n:number)=>n.toLocaleString('id-ID')
const isDispatchEditor=(user:User)=>canEditAccess(user,'data_unit_dispatch')&&(user.role==='owner'||user.role==='asisten')
const isReporter=(user:User)=>isDispatchEditor(user)||user.role==='mandor_spraying'||user.role==='mandor_fertilizer'
async function currentActor(){
  if(!firestoreDb||!firebaseAuth)throw Error('Firebase belum tersedia.')
  await firebaseAuthPersistenceReady
  if(typeof firebaseAuth.authStateReady==='function')await firebaseAuth.authStateReady()
  const current=firebaseAuth.currentUser
  if(!current)throw Error('Sesi Firebase tidak aktif. Silakan login ulang.')
  const profile=await getDoc(doc(firestoreDb,'users',current.uid))
  if(!profile.exists()||profile.data().active!==true)throw Error('Profil user tidak aktif.')
  return{db:firestoreDb,uid:current.uid,name:clean(profile.data().username)}
}
function buildRequirements(rows:Raw[],date:string):UnitRequirement[]{
  const groups=new Map<string,Raw[]>()
  rows.filter(r=>clean(r.date)===date).forEach(r=>{
    const id=clean(r.workGroupId||r.dailyPlanId)
    const groupKey=id+'|'+clean(r.shift)
    const existing=groups.get(groupKey)||[];existing.push(r);groups.set(groupKey,existing)
  })
  return[...groups.entries()].map(([groupKey,groupRows])=>{
    const first=groupRows[0],name=clean(first.unitName)
    return{id:groupKey,date,shift:clean(first.shift)||'1',workGroupId:clean(first.workGroupId||first.dailyPlanId),activity:clean(first.activity),woNumber:clean(first.woNumber),pids:[...new Set(groupRows.map(r=>clean(r.pid)).filter(Boolean))],unitName:name,quantity:count(first.unitRequired),preferred:Array.isArray(first.unitPreferredCodes)?first.unitPreferredCodes.map(clean):[]}
  }).sort((a,b)=>a.shift.localeCompare(b.shift)||a.activity.localeCompare(b.activity))
}
function eventConditionLabel(value:UnitCondition){return value==='PENDING_INSPECTION'?'Pending Inspection':value==='OUT_OF_SERVICE'?'Out of Service':value[0]+value.slice(1).toLowerCase()}
function dispatchBadge(value:string){return value==='READY'||value==='WORKING'?'success':value==='BREAKDOWN'?'danger':value==='MAINTENANCE'||value==='PENDING_INSPECTION'?'warning':'secondary'}

export default function UnitDispatchWorkspace({user,initialDate}:Props){
  const[tab,setTab]=useState<Tab>('dispatch')
  const[date,setDate]=useState(initialDate||dateToday()),[shift,setShift]=useState('1')
  const[kinds,setKinds]=useState<Kind[]>([]),[units,setUnits]=useState<UnitNumber[]>([]),[events,setEvents]=useState<UnitEvent[]>([]),[assignments,setAssignments]=useState<UnitAssignment[]>([]),[requirements,setRequirements]=useState<UnitRequirement[]>([])
  const[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[search,setSearch]=useState('')
  const[focusWork,setFocusWork]=useState(''),[slotUnit,setSlotUnit]=useState(''),[start,setStart]=useState('08:00'),[end,setEnd]=useState('10:00')
  const[replacementOf,setReplacementOf]=useState('')
  const[focusUnit,setFocusUnit]=useState('')
  const[eventType,setEventType]=useState<UnitEventType>('BREAKDOWN'),[eventTime,setEventTime]=useState('10:30'),[eventNote,setEventNote]=useState('')
  const[unitCode,setUnitCode]=useState(''),[unitKind,setUnitKind]=useState(''),[unitBrand,setUnitBrand]=useState(''),[unitModel,setUnitModel]=useState(''),[unitImplement,setUnitImplement]=useState(''),[unitNotes,setUnitNotes]=useState('')
  const editor=isDispatchEditor(user),reporter=isReporter(user)
  const[reload,setReload]=useState(0)
  useEffect(()=>{let alive=true;setLoading(true);setMessage('')
    async function load(){
      if(!firestoreDb)throw Error('Firestore belum tersedia.')
      const[cat,nums,ev,as,dp]=await Promise.all([
        getDocs(collection(firestoreDb,'master_units')),getDocs(collection(firestoreDb,'master_unit_numbers')),
        getDocs(collection(firestoreDb,'unit_events')),getDocs(collection(firestoreDb,'unit_assignments')),
        getDocs(query(collection(firestoreDb,'daily_plans'),where('date','==',date)))
      ])
      if(!alive)return
      setKinds(cat.docs.map(d=>({id:d.id,name:clean(d.data().name)})).filter(k=>k.name).sort((a,b)=>a.name.localeCompare(b.name)))
      setUnits(nums.docs.map(d=>normalizeUnitNumber(d.id,d.data() as Raw)).filter(u=>u.active).sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true})))
      setEvents(ev.docs.map(d=>normalizeEvent(d.id,d.data() as Raw)).sort((a,b)=>a.effectiveMinute-b.effectiveMinute))
      setAssignments(as.docs.map(d=>normalizeAssignment(d.id,d.data() as Raw)))
      setRequirements(buildRequirements(dp.docs.map(d=>d.data() as Raw),date))
    }
    void load().catch(e=>{if(alive)setMessage(e instanceof Error?e.message:'Unit Dispatch gagal dimuat.')}).finally(()=>{if(alive)setLoading(false)})
    return()=>{alive=false}
  },[date,reload])
  const refresh=()=>setReload(v=>v+1)
  const windowShift=shiftWindow(date,shift)
  const nowMinute=Math.min(windowShift.endMinute,Math.max(windowShift.startMinute,Date.now()/60000))
  const shiftAssignments=assignments.filter(a=>overlaps(a,windowShift)&&a.status!=='CANCELLED')
  const dayRequirements=requirements.filter(r=>r.shift===shift)
  const readyUnits=units.filter(u=>conditionAt(events,u.id,nowMinute)==='READY')
  const standbyUnits=readyUnits.filter(u=>!shiftAssignments.some(a=>a.unitId===u.id&&a.status!=='REPLACED'))
  const unavailable=units.filter(u=>conditionAt(events,u.id,nowMinute)!=='READY')
  const availableFor=(r:UnitRequirement)=>{
    const window=timeWindow(date,shift,start,end)
    if(!window)return[]
    return units.filter(u=>unitMatches(u,r)&&conditionAt(events,u.id,window.startMinute)==='READY'&&
      !events.some(ev=>ev.unitId===u.id&&ev.effectiveMinute>window.startMinute&&ev.effectiveMinute<window.endMinute&&ev.type!=='READY_APPROVED')&&
      !assignmentConflict(assignments,u.id,window,replacementOf))
  }
  const focused=dayRequirements.find(r=>r.id===focusWork)
  const sourceAssignment=assignments.find(a=>a.id===replacementOf)
  const assignmentFor= (r:UnitRequirement)=>assignments.filter(a=>a.workGroupId===r.workGroupId&&a.date===date&&a.shift===r.shift&&a.status!=='CANCELLED')
  async function saveAssignment(){
    if(!editor||!focused)return
    setBusy(true);setMessage('')
    try{
      const window=timeWindow(date,shift,start,end)
      if(!window)throw Error('Jam mulai dan selesai tidak valid.')
      if(focused.quantity<1)throw Error('Isi jumlah unit Required pada Daily Plan terlebih dahulu.')
      const unit=units.find(u=>u.id===slotUnit)
      if(!unit||!unitMatches(unit,focused))throw Error('Pilih unit yang sesuai jenis kebutuhan.')
      if(conditionAt(events,unit.id,window.startMinute)!=='READY')throw Error('Unit tidak berstatus Ready pada jadwal tersebut.')
      if(events.some(e=>e.unitId===unit.id&&e.effectiveMinute>window.startMinute&&e.effectiveMinute<window.endMinute&&e.type!=='READY_APPROVED'))throw Error('Ada kejadian Breakdown/Maintenance dalam interval penugasan.')
      if(assignmentConflict(assignments,unit.id,window,replacementOf))throw Error('Jadwal unit bertabrakan dengan pekerjaan lain.')
      const currentActive=assignmentFor(focused).filter(a=>a.status!=='REPLACED').length
      if(!sourceAssignment&&currentActive>=focused.quantity)throw Error('Semua slot kebutuhan sudah terisi. Batalkan penugasan lama atau gunakan Replacement.')
      if(sourceAssignment&&(sourceAssignment.workGroupId!==focused.workGroupId||sourceAssignment.date!==date))throw Error('Replacement tidak cocok dengan pekerjaan asal.')
      const{db,uid,name}=await currentActor()
      const id='ua_'+idNew(),batch=writeBatch(db)
      if(sourceAssignment){
        const changed=events.filter(e=>e.unitId===sourceAssignment.unitId&&e.type==='BREAKDOWN'&&e.effectiveMinute>=sourceAssignment.startMinute&&e.effectiveMinute<=sourceAssignment.endMinute).sort((a,b)=>a.effectiveMinute-b.effectiveMinute)[0]
        const actualEnd=changed?Math.min(changed.effectiveMinute,sourceAssignment.endMinute):Math.min(window.startMinute,sourceAssignment.endMinute)
        batch.update(doc(db,'unit_assignments',sourceAssignment.id),{status:'REPLACED',endMinute:Math.max(sourceAssignment.startMinute+1,actualEnd),updatedByUid:uid,updatedAt:serverTimestamp()})
      }
      batch.set(doc(db,'unit_assignments',id),{unitId:unit.id,unitCode:unit.code,workGroupId:focused.workGroupId,date,shift,startTime:start,endTime:end,...window,activity:focused.activity,woNumber:focused.woNumber,pids:focused.pids,status:'ASSIGNED',replacesAssignmentId:sourceAssignment?.id||'',createdByUid:uid,createdBy:name,createdAt:serverTimestamp(),updatedAt:serverTimestamp()})
      await batch.commit();setReplacementOf('');setSlotUnit('');setMessage('Penugasan unit berhasil disimpan.');refresh()
    }catch(e){setMessage(e instanceof Error?e.message:'Penugasan gagal disimpan.')}finally{setBusy(false)}
  }
  async function markAssignment(a:UnitAssignment,status:'WORKING'|'COMPLETED'|'CANCELLED'){
    if(!editor)return
    setBusy(true);try{
      const{db,uid}=await currentActor()
      await updateDoc(doc(db,'unit_assignments',a.id),{status,updatedByUid:uid,updatedAt:serverTimestamp()})
      setMessage('Status penugasan diperbarui.');refresh()
    }catch(e){setMessage(e instanceof Error?e.message:'Perubahan gagal.')}finally{setBusy(false)}
  }
  async function saveEvent(){
    if(!reporter||!focusUnit)return
    if(!editor&&eventType!=='BREAKDOWN'){setMessage('Hanya Asisten/Owner yang dapat mengesahkan perubahan kondisi unit.');return}
    const unit=units.find(u=>u.id===focusUnit)
    if(!unit)return
    if(!eventNote.trim()){setMessage('Keterangan kerusakan atau pemeliharaan wajib diisi.');return}
    let when=dateMinute(date,eventTime)
    if(!Number.isFinite(when)){setMessage('Waktu kejadian tidak valid.');return}
    if(shift==='2'&&when-dateMinute(date,'00:00')<720)when+=1440
    const previous=conditionAt(events,unit.id,when)
    if(eventType==='READY_APPROVED'&&!['BREAKDOWN','MAINTENANCE','PENDING_INSPECTION'].includes(previous)){setMessage('Unit belum mempunyai kondisi yang perlu disahkan Ready.');return}
    setBusy(true);setMessage('')
    try{
      const{db,uid,name}=await currentActor()
      const id='ue_'+idNew()
      await setDoc(doc(db,'unit_events',id),{unitId:unit.id,unitCode:unit.code,type:eventType,effectiveMinute:when,date,shift,note:eventNote.trim(),actorUid:uid,actorName:name,createdAt:serverTimestamp()})
      setEventNote('');setMessage('Kondisi unit tercatat. '+(eventType==='BREAKDOWN'?'Unit langsung tidak tersedia.':'Status berubah sesuai tahap pemeriksaan.'));refresh()
    }catch(e){setMessage(e instanceof Error?e.message:'Kejadian unit gagal dicatat.')}finally{setBusy(false)}
  }
  async function saveUnit(){
    if(!editor){setMessage('Tidak memiliki izin mengubah Master Unit.');return}
    const code=unitCode.trim().toUpperCase(),kind=kinds.find(k=>k.id===unitKind)
    if(!code||!kind){setMessage('Kode unit dan jenis equipment wajib diisi.');return}
    setBusy(true);setMessage('')
    try{
      const{db,uid,name}=await currentActor()
      const found=units.find(u=>key(u.code)===key(code))
      if(found){await updateDoc(doc(db,'master_unit_numbers',found.id),{brand:unitBrand.trim(),model:unitModel.trim(),implement:unitImplement.trim(),notes:unitNotes.trim(),updatedBy:name,updatedAt:serverTimestamp()})}
      else{
        const id=(kind.name+'-'+code).toLowerCase().replace(/[^a-z0-9]+/g,'-')
        await setDoc(doc(db,'master_unit_numbers',id),{name:code,active:true,parentUnitId:kind.id,parentUnitName:kind.name,brand:unitBrand.trim(),model:unitModel.trim(),implement:unitImplement.trim(),notes:unitNotes.trim(),createdBy:name,createdByUid:uid,createdAt:serverTimestamp(),updatedAt:serverTimestamp()})
      }
      setMessage('Master unit berhasil disimpan.');setUnitCode('');setUnitBrand('');setUnitModel('');setUnitImplement('');setUnitNotes('');refresh()
    }catch(e){setMessage(e instanceof Error?e.message:'Unit gagal disimpan.')}finally{setBusy(false)}
  }
  const filterText=search.toLowerCase()
  const filteredUnits=units.filter(u=>(u.code+' '+u.kind+' '+u.implement).toLowerCase().includes(filterText))
  const unitFocus=units.find(u=>u.id===focusUnit)
  return <section className="unit-dispatch-workspace">
    <div className="section-head"><div><div className="eyebrow">RESOURCE MANAGEMENT</div><h2>Unit Management</h2><p className="muted">Dispatch unit, Breakdown, Maintenance, dan verifikasi Ready. Operator/absensi belum dihubungkan.</p></div><button type="button" disabled={loading} onClick={refresh}>↻ Refresh</button></div>
    {message&&<div role="status" className="alert">{message}</div>}
    <div className="segmented plan-secondary-nav" aria-label="Menu Unit Management">
      <button type="button" className={tab==='dispatch'?'active':''} onClick={()=>setTab('dispatch')}>Unit Dispatch</button>
      <button type="button" className={tab==='units'?'active':''} onClick={()=>setTab('units')}>Master Unit</button>
      <button type="button" className={tab==='events'?'active':''} onClick={()=>setTab('events')}>Breakdown & Maintenance</button>
    </div>
    <div className="panel" style={{marginTop:12}}>
      <div className="form-grid">
        <label>Tanggal<input type="date" value={date} onChange={e=>{setDate(e.target.value);setFocusWork('')}}/></label>
        <label>Shift<select value={shift} onChange={e=>{setShift(e.target.value);setFocusWork('');setStart(e.target.value==='2'?'15:00':'08:00');setEnd(e.target.value==='2'?'17:00':'10:00')}}><option value="1">Shift 1</option><option value="2">Shift 2</option></select></label>
      </div>
      {loading&&<p role="status">Memuat unit, penugasan, dan kondisi terkini…</p>}
      {!loading&&<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(115px,1fr))',gap:8,marginTop:12}}>
        {[{l:'Total Unit',v:units.length},{l:'Ready',v:readyUnits.length},{l:'Standby',v:standbyUnits.length},{l:'Breakdown',v:unavailable.filter(u=>conditionAt(events,u.id,nowMinute)==='BREAKDOWN').length},{l:'Maintenance',v:unavailable.filter(u=>conditionAt(events,u.id,nowMinute)==='MAINTENANCE').length},{l:'Pending Inspection',v:unavailable.filter(u=>conditionAt(events,u.id,nowMinute)==='PENDING_INSPECTION').length}].map(x=><div key={x.l} style={{background:'#f2f6fa',borderRadius:10,padding:12}}><small style={{color:'#607086'}}>{x.l}</small><strong style={{display:'block',fontSize:20}}>{fmt(x.v)}</strong></div>)}
      </div>}
    </div>
    {tab==='dispatch'&&<div style={{display:'grid',gap:12,marginTop:12}}>
      <div className="panel"><h3>Daily Plan — Kebutuhan Unit</h3>
        {!dayRequirements.length&&<p className="muted">Belum ada Daily Plan pada tanggal ini.</p>}
        <div style={{display:'grid',gap:9}}>{dayRequirements.map(r=>{
          const covered=slotCoverage(r,assignments,events)
          return <div key={r.id} style={{border:'1px solid #e0e7ef',borderRadius:10,padding:12}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'start',gap:12,flexWrap:'wrap'}}>
              <div><strong>{r.activity||'Activity belum ada'}</strong><small style={{display:'block',color:'#64748b'}}>{r.woNumber||'Tanpa WO'} · {r.pids.join(', ')||'Tanpa PID'} · {r.unitName||'Jenis unit belum ditentukan'}</small></div>
              <span style={{fontWeight:600}}>{covered} / {r.quantity} unit</span>
            </div>
            {r.quantity===0&&<p className="muted" style={{fontSize:12}}>Jumlah unit belum ditentukan di Daily Plan. Data lama tetap ditampilkan tanpa asumsi.</p>}
            {r.preferred.length>0&&<small className="muted">Usulan dari Daily Plan: {r.preferred.join(', ')}</small>}
            <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:9}}>
              {editor&&<button type="button" onClick={()=>{setFocusWork(r.id);setReplacementOf('');setSlotUnit('')}}>Assign Unit</button>}
              <button type="button" onClick={()=>setFocusWork(focusWork===r.id?'':r.id)}>{focusWork===r.id?'Tutup':'Lihat penugasan'}</button>
            </div>
            {focusWork===r.id&&<div style={{borderTop:'1px solid #e2e8f0',marginTop:12,paddingTop:12,display:'grid',gap:8}}>
              {assignmentFor(r).map(a=><div key={a.id} style={{background:'#f6f8fb',borderRadius:8,padding:9}}>
                <strong>{a.unitCode}</strong> · {a.startTime}–{a.endTime} · {a.status}
                {a.replacesAssignmentId&&<small style={{display:'block'}}>Replacement dari {a.replacesAssignmentId}</small>}
                {editor&&a.status!=='CANCELLED'&&a.status!=='REPLACED'&&<div style={{display:'flex',gap:6,marginTop:8,flexWrap:'wrap'}}>
                  {a.status==='ASSIGNED'&&<button type="button" disabled={busy} onClick={()=>void markAssignment(a,'WORKING')}>Mulai Working</button>}
                  {a.status!=='COMPLETED'&&<button type="button" disabled={busy} onClick={()=>void markAssignment(a,'COMPLETED')}>Selesai</button>}
                  <button type="button" disabled={busy} onClick={()=>{setReplacementOf(a.id);setSlotUnit('');setStart(a.endTime)}}>Replace</button>
                  {a.status==='ASSIGNED'&&<button type="button" disabled={busy} onClick={()=>void markAssignment(a,'CANCELLED')}>Batalkan</button>}
                </div>}
              </div>)}
              {editor&&<div style={{display:'grid',gap:8}}>
                <strong>{replacementOf?'Unit Pengganti':'Tambah Penugasan'}</strong>
                <div className="form-grid"><label>Mulai<input type="time" value={start} onChange={e=>setStart(e.target.value)}/></label><label>Selesai<input type="time" value={end} onChange={e=>setEnd(e.target.value)}/></label></div>
                <label>Kode unit<select value={slotUnit} onChange={e=>setSlotUnit(e.target.value)}><option value="">Pilih unit Ready yang tidak bentrok…</option>{availableFor(r).map(u=><option key={u.id} value={u.id}>{u.code} · {u.kind}{u.implement?' / '+u.implement:''}</option>)}</select></label>
                {replacementOf&&<small className="muted">Menggantikan {sourceAssignment?.unitCode||replacementOf}. Histori penugasan lama tetap tersimpan.</small>}
                <div style={{display:'flex',gap:8}}><button type="button" disabled={busy||!slotUnit} onClick={()=>void saveAssignment()}>{busy?'Menyimpan…':replacementOf?'Simpan Replacement':'Simpan Assignment'}</button>{replacementOf&&<button type="button" onClick={()=>setReplacementOf('')}>Batal Replacement</button>}</div>
              </div>}
            </div>}
          </div>
        })}</div>
      </div>
      <div className="panel"><h3>Unit Fisik & Standby Otomatis</h3>
        <input aria-label="Cari unit" placeholder="Cari kode unit, equipment, implement…" value={search} onChange={e=>setSearch(e.target.value)}/>
        <div style={{maxHeight:360,overflowY:'auto',marginTop:10,display:'grid',gap:6}}>{filteredUnits.map(u=>{
          const state=conditionAt(events,u.id,nowMinute)
          const busy=shiftAssignments.some(a=>a.unitId===u.id&&a.status!=='REPLACED')
          const display=state==='READY'?(busy?'Assigned':'Standby'):eventConditionLabel(state)
          return <div key={u.id} style={{padding:10,border:'1px solid #e2e8f0',borderRadius:9,display:'flex',justifyContent:'space-between',alignItems:'center',gap:10}}>
            <div><strong>{u.code}</strong><small style={{display:'block',color:'#64748b'}}>{u.kind}{u.implement?' · '+u.implement:''}</small></div>
            <div style={{display:'flex',gap:7,alignItems:'center'}}><span style={{fontSize:12,fontWeight:600,color:state==='READY'?'#27704f':'#9d493d'}}>{display}</span><button type="button" onClick={()=>{setFocusUnit(u.id);setTab('events')}}>Detail</button></div>
          </div>
        })}</div>
      </div>
    </div>}
    {tab==='units'&&<div className="panel" style={{marginTop:12}}>
      <h3>Master Unit Fisik</h3><p className="muted">Jenis Unit tetap mengikuti Master Activity → Master Resource. Detail kode unit dapat dilengkapi di sini.</p>
      {editor&&<div style={{border:'1px solid #e2e8f0',borderRadius:10,padding:12,display:'grid',gap:9}}>
        <div className="form-grid"><label>Kode Unit<input value={unitCode} onChange={e=>{const v=e.target.value.toUpperCase();setUnitCode(v);const found=units.find(u=>key(u.code)===key(v));if(found){setUnitKind(found.parentUnitId);setUnitBrand(found.brand);setUnitModel(found.model);setUnitImplement(found.implement);setUnitNotes(found.notes)}}} placeholder="Contoh: DT123T"/></label>
        <label>Jenis Equipment<select value={unitKind} onChange={e=>setUnitKind(e.target.value)}><option value="">Pilih jenis</option>{kinds.map(k=><option key={k.id} value={k.id}>{k.name}</option>)}</select></label></div>
        <div className="form-grid"><label>Brand<input value={unitBrand} onChange={e=>setUnitBrand(e.target.value)}/></label><label>Model<input value={unitModel} onChange={e=>setUnitModel(e.target.value)}/></label></div>
        <label>Implement terpasang / keterangan alat<input value={unitImplement} onChange={e=>setUnitImplement(e.target.value)}/></label>
        <label>Catatan Unit<textarea rows={2} value={unitNotes} onChange={e=>setUnitNotes(e.target.value)}/></label>
        <button type="button" disabled={busy||!unitCode||!unitKind} onClick={()=>void saveUnit()}>Simpan Unit</button>
      </div>}
      <div style={{maxHeight:420,overflowY:'auto',display:'grid',gap:7,marginTop:12}}>{units.map(u=><div key={u.id} style={{border:'1px solid #e2e8f0',borderRadius:9,padding:10,display:'flex',justifyContent:'space-between',gap:10,alignItems:'center'}}>
        <div><strong>{u.code}</strong><small style={{display:'block',color:'#64748b'}}>{u.kind}{u.brand?' · '+u.brand:''}{u.model?' · '+u.model:''}</small></div>
        <div style={{display:'flex',gap:6,alignItems:'center'}}><span style={{fontSize:12}}>{eventConditionLabel(conditionAt(events,u.id,nowMinute))}</span>{editor&&<button type="button" onClick={()=>{setUnitCode(u.code);setUnitKind(u.parentUnitId);setUnitBrand(u.brand);setUnitModel(u.model);setUnitImplement(u.implement);setUnitNotes(u.notes);window.scrollTo({top:0,behavior:'smooth'})}}>Edit</button>}</div>
      </div>)}</div>
    </div>}
    {tab==='events'&&<div style={{display:'grid',gap:12,marginTop:12}}>
      <div className="panel"><h3>Breakdown, Maintenance & Ready Approval</h3>
        <label>Kode Unit<select value={focusUnit} onChange={e=>setFocusUnit(e.target.value)}><option value="">Pilih unit…</option>{units.map(u=><option key={u.id} value={u.id}>{u.code} — {u.kind}</option>)}</select></label>
        {unitFocus&&<div style={{marginTop:10,display:'grid',gap:9}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><strong>{unitFocus.code}</strong><span style={{fontWeight:600}}>{eventConditionLabel(conditionAt(events,unitFocus.id,nowMinute))}</span></div>
          {reporter&&<>
            <label>Jenis Kejadian<select value={eventType} onChange={e=>setEventType(e.target.value as UnitEventType)}><option value="BREAKDOWN">Breakdown — laporan Mandor</option>{editor&&<><option value="MAINTENANCE">Maintenance dimulai</option><option value="PENDING_INSPECTION">Perbaikan selesai — menunggu pemeriksaan</option><option value="READY_APPROVED">Approve Ready — Asisten</option></>}</select></label>
            <label>Waktu kejadian<input type="time" value={eventTime} onChange={e=>setEventTime(e.target.value)}/></label>
            <label>Keterangan / dasar pemeriksaan<textarea rows={3} value={eventNote} onChange={e=>setEventNote(e.target.value)} placeholder="Tuliskan penyebab, tindakan, atau hasil pemeriksaan…"/></label>
            <button type="button" disabled={busy||!eventNote.trim()} onClick={()=>void saveEvent()}>{busy?'Menyimpan…':eventType==='READY_APPROVED'?'Sahkan Ready':'Simpan Kejadian'}</button>
          </>}
          {!reporter&&<p className="muted">Hak akses pelaporan Breakdown belum diberikan.</p>}
        </div>}
      </div>
      <div className="panel"><h3>Riwayat Kejadian</h3>
        {[...events].filter(e=>!focusUnit||e.unitId===focusUnit).reverse().slice(0,60).map(e=><div key={e.id} style={{borderBottom:'1px solid #e2e8f0',padding:'9px 0'}}>
          <strong>{units.find(u=>u.id===e.unitId)?.code||e.unitId} · {e.type.replaceAll('_',' ')}</strong>
          <small style={{display:'block',color:'#64748b'}}>{e.date} · Shift {e.shift} · {e.note}</small>
        </div>)}
        {!events.length&&<p className="muted">Belum ada kejadian tercatat.</p>}
      </div>
    </div>}
  </section>
}
