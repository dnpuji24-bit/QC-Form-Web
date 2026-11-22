import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDoc, getDocs, getDocsFromServer, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore'
import { firebaseAuth, firebaseAuthPersistenceReady, firestoreDb } from './firebase'
import { canEditAccess } from './accessControl'
import type { User } from './types'
import MasterResourceImportPanel from './MasterResourceImportPanel'
import UnitMasterGrid from './UnitMasterGrid'
import {supportUnitRows} from './dailyUnitSupport'
import { assignmentConflict, clean, conditionAt, count, dateMinute, normalizeAssignment, normalizeEvent, normalizeUnitNumber, overlaps, shiftWindow, slotCoverage, timeWindow, unitMatches, type UnitAssignment, type UnitCondition, type UnitEvent, type UnitEventType, type UnitNumber, type UnitRequirement } from './unitDispatchModel'

type Raw = Record<string,unknown>
type Kind={id:string;name:string}
type Props={user:User; initialDate?:string}
type Tab='dispatch'|'units'|'events'|'import'
const siteClock=()=>{
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Jayapura',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date())
  const part=(kind:string)=>parts.find(p=>p.type===kind)?.value||''
  return{date:part('year')+'-'+part('month')+'-'+part('day'),time:part('hour')+':'+part('minute')}
}
const dateToday=()=>siteClock().date
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
  return[...groups.entries()].flatMap(([groupKey,groupRows])=>{
    const first=groupRows[0],name=clean(first.unitName)
    const common={date,shift:clean(first.shift)||'1',workGroupId:clean(first.workGroupId||first.dailyPlanId),activity:clean(first.activity),woNumber:clean(first.woNumber),pids:[...new Set(groupRows.map(r=>clean(r.pid)).filter(Boolean))]}
    const main:UnitRequirement={...common,id:groupKey+'|primary',requirementId:'primary',role:'MAIN',unitName:name,quantity:count(first.unitRequired),preferred:Array.isArray(first.unitPreferredCodes)?first.unitPreferredCodes.map(clean):[]}
    const additional=supportUnitRows(first.supportUnits).map(item=>({...common,
      id:groupKey+'|support:'+item.id,requirementId:'support:'+item.id,role:'SUPPORT' as const,
      unitName:item.unitName,quantity:item.unitRequired,preferred:item.unitPreferredCodes,notes:item.notes
    }))
    return[main,...additional].filter(r=>r.quantity>0||r.unitName.trim())
  }).sort((a,b)=>a.shift.localeCompare(b.shift)||a.activity.localeCompare(b.activity)||(a.role==='MAIN'?-1:1))
}
function eventConditionLabel(value:UnitCondition){return value==='OUT_OF_SERVICE'?'Out of Service':value[0]+value.slice(1).toLowerCase()}
function dispatchBadge(value:string){return value==='READY'||value==='WORKING'?'success':value==='BREAKDOWN'?'danger':value==='MAINTENANCE'||value==='PENDING_INSPECTION'?'warning':'secondary'}

export default function UnitDispatchWorkspace({user,initialDate}:Props){
  const[tab,setTab]=useState<Tab>('units')
  const[date,setDate]=useState(initialDate||dateToday()),[shift,setShift]=useState('1')
  const[kinds,setKinds]=useState<Kind[]>([]),[units,setUnits]=useState<UnitNumber[]>([]),[events,setEvents]=useState<UnitEvent[]>([]),[assignments,setAssignments]=useState<UnitAssignment[]>([]),[requirements,setRequirements]=useState<UnitRequirement[]>([])
  const[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[search,setSearch]=useState('')
  const[focusWork,setFocusWork]=useState(''),[slotUnit,setSlotUnit]=useState(''),[start,setStart]=useState('08:00'),[end,setEnd]=useState('10:00')
  const[dispatchSearch,setDispatchSearch]=useState(''),[assignmentNotes,setAssignmentNotes]=useState(''),[noteDrafts,setNoteDrafts]=useState<Record<string,string>>({})
  const[replacementOf,setReplacementOf]=useState('')
  const[focusUnit,setFocusUnit]=useState('')
  const[eventType,setEventType]=useState<UnitEventType>('BREAKDOWN'),[eventTime,setEventTime]=useState('10:30'),[eventNote,setEventNote]=useState('')
  const[maintenanceType,setMaintenanceType]=useState('PREVENTIVE'),[estimatedFinish,setEstimatedFinish]=useState(''),[hourMeter,setHourMeter]=useState(''),[maintenancePic,setMaintenancePic]=useState('')
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
  const local=siteClock(),localMinute=dateMinute(local.date,local.time)
  const nowMinute=date<local.date?windowShift.endMinute:date>local.date?windowShift.startMinute:Math.min(windowShift.endMinute,Math.max(windowShift.startMinute,localMinute))
  const shiftAssignments=assignments.filter(a=>overlaps(a,windowShift)&&a.status!=='CANCELLED')
  const activeAtTime=(unitId:string)=>shiftAssignments.some(a=>a.unitId===unitId&&a.status!=='REPLACED'&&a.status!=='COMPLETED'&&a.startMinute<=nowMinute&&nowMinute<a.endMinute)
  const dayRequirements=requirements.filter(r=>r.shift===shift)
  const readyUnits=units.filter(u=>conditionAt(events,u.id,nowMinute)==='READY')
  const standbyUnits=readyUnits.filter(u=>!activeAtTime(u.id))
  const unavailable=units.filter(u=>conditionAt(events,u.id,nowMinute)!=='READY')
  const availableFor=(r:UnitRequirement)=>{
    const window=timeWindow(date,shift,start,end)
    if(!window)return[]
    return units.filter(u=>unitMatches(u,r)&&conditionAt(events,u.id,window.startMinute)==='READY'&&
      !events.some(ev=>ev.unitId===u.id&&ev.effectiveMinute>window.startMinute&&ev.effectiveMinute<window.endMinute&&['BREAKDOWN','MAINTENANCE','OUT_OF_SERVICE'].includes(ev.type))&&
      !assignmentConflict(assignments,u.id,window,replacementOf))
  }
  const focused=dayRequirements.find(r=>r.id===focusWork)
  const sourceAssignment=assignments.find(a=>a.id===replacementOf)
  const assignmentFor= (r:UnitRequirement)=>assignments.filter(a=>a.workGroupId===r.workGroupId&&a.date===date&&a.shift===r.shift&&(a.requirementId||'primary')===(r.requirementId||'primary')&&a.status!=='CANCELLED')
  async function saveAssignment(){
    if(!editor||!focused)return
    setBusy(true);setMessage('')
    try{
      const window=timeWindow(date,shift,start,end)
      if(!window)throw Error('Jam mulai dan selesai tidak valid.')
      if(focused.quantity<1)throw Error('Isi jumlah unit Required pada Daily Plan terlebih dahulu.')
      const unit=units.find(u=>u.id===slotUnit)
      if(!unit||!unitMatches(unit,focused))throw Error('Pilih unit yang sesuai jenis kebutuhan.')
      if(!firestoreDb)throw Error('Firestore tidak tersedia.')
      const fresh=await Promise.all([getDocsFromServer(collection(firestoreDb,'unit_events')),getDocsFromServer(collection(firestoreDb,'unit_assignments'))])
      const latestEvents=fresh[0].docs.map(d=>normalizeEvent(d.id,d.data() as Raw))
      const latestAssignments=fresh[1].docs.map(d=>normalizeAssignment(d.id,d.data() as Raw))
      if(conditionAt(latestEvents,unit.id,window.startMinute)!=='READY')throw Error('Unit tidak berstatus Ready pada jadwal tersebut.')
      if(latestEvents.some(e=>e.unitId===unit.id&&e.effectiveMinute>window.startMinute&&e.effectiveMinute<window.endMinute&&['BREAKDOWN','MAINTENANCE','OUT_OF_SERVICE'].includes(e.type)))throw Error('Ada kejadian Breakdown/Maintenance dalam interval penugasan.')
      if(assignmentConflict(latestAssignments,unit.id,window,replacementOf))throw Error('Jadwal unit bertabrakan dengan pekerjaan lain.')
      const currentActive=latestAssignments.filter(a=>a.workGroupId===focused.workGroupId&&a.date===date&&a.shift===shift&&(a.requirementId||'primary')===(focused.requirementId||'primary')&&a.status!=='CANCELLED'&&a.status!=='REPLACED').length
      if(!sourceAssignment&&currentActive>=focused.quantity)throw Error('Semua slot kebutuhan sudah terisi. Batalkan penugasan lama atau gunakan Replacement.')
      if(sourceAssignment&&(sourceAssignment.workGroupId!==focused.workGroupId||sourceAssignment.date!==date||(sourceAssignment.requirementId||'primary')!==(focused.requirementId||'primary')))throw Error('Replacement tidak cocok dengan pekerjaan asal.')
      if(sourceAssignment&&unit.id===sourceAssignment.unitId)throw Error('Unit pengganti harus berbeda dari unit yang digantikan.')
      if(sourceAssignment&&window.startMinute<sourceAssignment.startMinute)throw Error('Replacement tidak boleh dimulai sebelum penugasan lama.')
      if(sourceAssignment){
        const affected=latestEvents.filter(e=>e.unitId===sourceAssignment.unitId&&e.type==='BREAKDOWN'&&e.effectiveMinute>=sourceAssignment.startMinute&&e.effectiveMinute<=sourceAssignment.endMinute).sort((a,b)=>a.effectiveMinute-b.effectiveMinute)[0]
        if(affected&&window.startMinute<affected.effectiveMinute)throw Error('Unit pengganti tidak boleh dimulai sebelum waktu Breakdown.')
      }
      if(sourceAssignment&&!latestAssignments.some(a=>a.id===sourceAssignment.id&&a.status!=='REPLACED'&&a.status!=='CANCELLED'))throw Error('Assignment lama sudah berubah. Refresh Dispatch terlebih dahulu.')
      const{db,uid,name}=await currentActor()
      const id='ua_'+idNew(),batch=writeBatch(db)
      if(sourceAssignment){
        const changed=latestEvents.filter(e=>e.unitId===sourceAssignment.unitId&&e.type==='BREAKDOWN'&&e.effectiveMinute>=sourceAssignment.startMinute&&e.effectiveMinute<=sourceAssignment.endMinute).sort((a,b)=>a.effectiveMinute-b.effectiveMinute)[0]
        const actualEnd=changed?Math.min(changed.effectiveMinute,sourceAssignment.endMinute):Math.min(window.startMinute,sourceAssignment.endMinute)
        batch.update(doc(db,'unit_assignments',sourceAssignment.id),{status:'REPLACED',endMinute:Math.max(sourceAssignment.startMinute+1,actualEnd),updatedByUid:uid,updatedAt:serverTimestamp()})
      }
      batch.set(doc(db,'unit_assignments',id),{unitId:unit.id,unitCode:unit.code,workGroupId:focused.workGroupId,date,shift,startTime:start,endTime:end,...window,activity:focused.activity,woNumber:focused.woNumber,pids:focused.pids,status:'ASSIGNED',notes:assignmentNotes.trim(),requirementId:focused.requirementId||'primary',unitName:focused.unitName,replacesAssignmentId:sourceAssignment?.id||'',createdByUid:uid,createdBy:name,createdAt:serverTimestamp(),updatedAt:serverTimestamp()})
      await batch.commit();setReplacementOf('');setSlotUnit('');setAssignmentNotes('');setMessage('Penugasan unit berhasil disimpan.');refresh()
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
  async function saveAssignmentNote(a:UnitAssignment){
    if(!editor)return
    const note=(noteDrafts[a.id]??a.notes).trim()
    if(note.length>1500){setMessage('Keterangan maksimal 1.500 karakter.');return}
    setBusy(true);setMessage('')
    try{
      const{db,uid}=await currentActor()
      await updateDoc(doc(db,'unit_assignments',a.id),{
        notes:note,updatedByUid:uid,updatedAt:serverTimestamp()
      })
      setMessage('Keterangan penugasan '+a.unitCode+' tersimpan.')
      refresh()
    }catch(e){setMessage(e instanceof Error?e.message:'Keterangan gagal disimpan.')}finally{setBusy(false)}
  }
  async function saveEvent(){
    if(!reporter||!focusUnit)return
    if(!editor&&eventType!=='BREAKDOWN'){setMessage('Hanya Owner/Asisten yang dapat mengubah kondisi unit selain laporan Breakdown.');return}
    const unit=units.find(u=>u.id===focusUnit)
    if(!unit)return
    if(!eventNote.trim()&&['BREAKDOWN','MAINTENANCE'].includes(eventType)){setMessage('Keterangan Breakdown atau Maintenance wajib diisi.');return}
    let when=dateMinute(date,eventTime)
    if(!Number.isFinite(when)){setMessage('Waktu kejadian tidak valid.');return}
    if(shift==='2'&&when-dateMinute(date,'00:00')<720)when+=1440
    setBusy(true);setMessage('')
    try{
      const{db,uid,name}=await currentActor()
      const id='ue_'+unit.id.replace(/[^A-Za-z0-9_-]/g,'-')+'_'+date.replaceAll('-','')+'_'+shift+'_'+eventTime.replace(':','')+'_'+eventType
      const existing=await getDoc(doc(db,'unit_events',id))
      if(existing.exists())throw Error('Kejadian dengan unit, waktu, dan jenis yang sama sudah tercatat. Refresh untuk melihatnya.')
      const latest=await getDocsFromServer(collection(db,'unit_events'))
      const latestEvents=latest.docs.map(d=>normalizeEvent(d.id,d.data() as Raw))
      const previous=conditionAt(latestEvents,unit.id,when)
      if(eventType==='READY'&&previous==='READY')throw Error('Unit sudah Ready.')
      await setDoc(doc(db,'unit_events',id),{unitId:unit.id,unitCode:unit.code,type:eventType,effectiveMinute:when,date,shift,note:eventNote.trim()||'Kondisi unit diubah langsung melalui Unit Management',maintenanceType:eventType==='MAINTENANCE'?maintenanceType:'',estimatedFinish:eventType==='MAINTENANCE'?estimatedFinish:'',hourMeter:eventType==='MAINTENANCE'?hourMeter:'',maintenancePic:eventType==='MAINTENANCE'?maintenancePic:'',actorUid:uid,actorName:name,createdAt:serverTimestamp()})
      setEventNote('');setMessage('Kondisi unit tercatat. '+(eventType==='BREAKDOWN'?'Unit langsung tidak tersedia.':'Status berubah sesuai tahap pemeriksaan.'));refresh()
    }catch(e){setMessage(e instanceof Error?e.message:'Kejadian unit gagal dicatat.')}finally{setBusy(false)}
  }
  const filterText=search.toLowerCase()
  const filteredUnits=units.filter(u=>(u.code+' '+u.kind+' '+u.implement).toLowerCase().includes(filterText))
  const unitFocus=units.find(u=>u.id===focusUnit)
  return <section className="unit-dispatch-workspace">
    <div className="section-head"><div><div className="eyebrow">RESOURCE MANAGEMENT</div><h2>Unit Management</h2><p className="muted">Dispatch dan tabel Master Unit seperti Excel. Semua unit dapat dipakai di Shift 1 & 2 selama jadwal tidak bentrok. Tanpa approval Ready.</p></div><button type="button" disabled={loading} onClick={refresh}>↻ Refresh</button></div>
    {message&&<div role="status" className="alert">{message}</div>}
    <div className="segmented plan-secondary-nav" aria-label="Menu Unit Management">
      <button type="button" className={tab==='dispatch'?'active':''} onClick={()=>setTab('dispatch')}>Unit Dispatch</button>
      <button type="button" className={tab==='units'?'active':''} onClick={()=>setTab('units')}>Master Unit</button>
      <button type="button" className={tab==='events'?'active':''} onClick={()=>setTab('events')}>Breakdown & Maintenance</button>
      <button type="button" className={tab==='import'?'active':''} onClick={()=>setTab('import')}>Import Unit</button>
    </div>
    <div className="panel" style={{marginTop:12}}>
      <div className="form-grid">
        <label>Tanggal<input type="date" value={date} onChange={e=>{setDate(e.target.value);setFocusWork('')}}/></label>
        <label>Shift<select value={shift} onChange={e=>{setShift(e.target.value);setFocusWork('');setStart(e.target.value==='2'?'15:00':'08:00');setEnd(e.target.value==='2'?'17:00':'10:00')}}><option value="1">Shift 1</option><option value="2">Shift 2</option></select></label>
      </div>
      {loading&&<p role="status">Memuat unit, penugasan, dan kondisi terkini…</p>}
      {!loading&&<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(115px,1fr))',gap:8,marginTop:12}}>
        {[{l:'Total Unit',v:units.length},{l:'Ready',v:readyUnits.length},{l:'Standby',v:standbyUnits.length},{l:'Breakdown',v:unavailable.filter(u=>conditionAt(events,u.id,nowMinute)==='BREAKDOWN').length},{l:'Maintenance',v:unavailable.filter(u=>conditionAt(events,u.id,nowMinute)==='MAINTENANCE').length},{l:'Out of Service',v:unavailable.filter(u=>conditionAt(events,u.id,nowMinute)==='OUT_OF_SERVICE').length}].map(x=><div key={x.l} style={{background:'#f2f6fa',borderRadius:10,padding:12}}><small style={{color:'#607086'}}>{x.l}</small><strong style={{display:'block',fontSize:20}}>{fmt(x.v)}</strong></div>)}
      </div>}
    </div>
    {tab==='dispatch'&&<div style={{display:'grid',gap:12,marginTop:12}}>
      <div className="panel">
        <h3>Daily Plan — Unit Dispatch (Tabel)</h3>
        <p className="muted">Cari pekerjaan lalu pilih Atur Unit. Unit yang sama dapat digunakan pada kedua shift dan beberapa Activity secara berurutan, selama jadwal tidak bertabrakan.</p>
        <label>Cari WO, PID, Activity, atau jenis unit
          <input type="search" value={dispatchSearch} onChange={e=>setDispatchSearch(e.target.value)} placeholder="Cari pekerjaan atau unit…"/>
        </label>
        {!dayRequirements.length&&<p className="muted">Belum ada Daily Plan pada tanggal ini.</p>}
        <div className="table-wrap" style={{maxHeight:600,overflow:'auto',marginTop:10,border:'1px solid #dce5ef',borderRadius:8}}>
          <table style={{width:'100%',minWidth:850,borderCollapse:'separate',borderSpacing:0,fontSize:13}}>
            <thead><tr>{['Shift','WO','PID','Activity','Jenis Unit','Required','Assigned','Shortage','Aksi'].map(title=><th key={title} style={{position:'sticky',top:0,zIndex:1,background:'#eaf0f7',borderBottom:'1px solid #dce5ef',padding:9,textAlign:'left'}}>{title}</th>)}</tr></thead>
            <tbody>{dayRequirements.filter(r=>[r.activity,r.woNumber,r.pids.join(' '),r.unitName].some(v=>v.toLowerCase().includes(dispatchSearch.toLowerCase()))).map(r=>{
              const covered=slotCoverage(r,assignments,events)
              return <tr key={r.id}><td colSpan={9} style={{padding:0}}>
                <table style={{width:'100%',minWidth:850,borderCollapse:'collapse'}}><tbody>
                  <tr style={{background:focusWork===r.id?'#f0f6ff':'#fff'}}>
                    <td style={{padding:9,width:'7%',borderBottom:'1px solid #e2e8f0'}}>{r.shift}</td>
                    <td style={{padding:9,width:'13%',borderBottom:'1px solid #e2e8f0'}}>{r.woNumber||'—'}</td>
                    <td style={{padding:9,width:'15%',borderBottom:'1px solid #e2e8f0'}}>{r.pids.join(', ')||'—'}</td>
                    <td style={{padding:9,width:'19%',borderBottom:'1px solid #e2e8f0'}}>{r.activity||'—'}</td>
                    <td style={{padding:9,width:'17%',borderBottom:'1px solid #e2e8f0'}}>{r.role==='SUPPORT'?'Support · ':'Utama · '}{r.unitName||'—'}</td>
                    <td style={{padding:9,width:'7%',borderBottom:'1px solid #e2e8f0'}}>{r.quantity}</td>
                    <td style={{padding:9,width:'7%',borderBottom:'1px solid #e2e8f0'}}>{covered}</td>
                    <td style={{padding:9,width:'7%',borderBottom:'1px solid #e2e8f0',fontWeight:700,color:r.quantity>covered?'#b45309':'#166534'}}>{Math.max(0,r.quantity-covered)}</td>
                    <td style={{padding:9,borderBottom:'1px solid #e2e8f0'}}><button type="button" onClick={()=>{setFocusWork(focusWork===r.id?'':r.id);setReplacementOf('');setSlotUnit('')}}>{focusWork===r.id?'Tutup':'Atur Unit'}</button></td>
                  </tr>
                  {focusWork===r.id&&<tr><td colSpan={9} style={{padding:12,background:'#f7faff'}}>
                    {r.quantity===0&&<p className="muted">Isi Jumlah Unit Diperlukan pada Daily Plan. Data lama tidak otomatis diubah.</p>}
                    {r.preferred.length>0&&<p className="muted">Usulan kode unit: {r.preferred.join(', ')}</p>}
                    <div style={{overflowX:'auto'}}><table style={{minWidth:670,width:'100%',borderCollapse:'collapse'}}>
                      <thead><tr><th>Kode Unit</th><th>Mulai</th><th>Selesai</th><th>Status</th><th>Keterangan</th><th>Aksi</th></tr></thead>
                      <tbody>{assignmentFor(r).map(a=><tr key={a.id}>
                        <td><strong>{a.unitCode}</strong>{a.replacesAssignmentId&&<small style={{display:'block'}}>Pengganti</small>}</td>
                        <td>{a.startTime}</td><td>{a.endTime}</td><td>{a.status}</td>
                        <td><div style={{display:'flex',gap:5}}>
                          <input style={{minWidth:170,maxWidth:300}} aria-label={'Keterangan '+a.unitCode} value={noteDrafts[a.id]??a.notes} disabled={!editor||busy} onChange={e=>setNoteDrafts(d=>({...d,[a.id]:e.target.value}))} placeholder="Tambahkan keterangan…"/>
                          {editor&&<button type="button" disabled={busy||(noteDrafts[a.id]??a.notes)===a.notes} onClick={()=>void saveAssignmentNote(a)}>Simpan</button>}
                        </div></td>
                        <td><div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                          {editor&&a.status==='ASSIGNED'&&<button type="button" disabled={busy} onClick={()=>void markAssignment(a,'WORKING')}>Working</button>}
                          {editor&&a.status!=='COMPLETED'&&a.status!=='CANCELLED'&&a.status!=='REPLACED'&&<button type="button" disabled={busy} onClick={()=>void markAssignment(a,'COMPLETED')}>Selesai</button>}
                          {editor&&a.status!=='CANCELLED'&&a.status!=='REPLACED'&&<button type="button" disabled={busy} onClick={()=>{setReplacementOf(a.id);setSlotUnit('');setStart(a.endTime)}}>Replace</button>}
                          {editor&&a.status==='ASSIGNED'&&<button type="button" disabled={busy} onClick={()=>void markAssignment(a,'CANCELLED')}>Batalkan</button>}
                        </div></td>
                      </tr>)}</tbody>
                    </table></div>
                    {editor&&<div style={{display:'grid',gap:9,marginTop:12,padding:10,border:'1px solid #dce5ef',borderRadius:8,background:'#fff'}}>
                      <strong>{replacementOf?'Unit pengganti':'Tambah penugasan unit'}</strong>
                      <div className="form-grid">
                        <label>Jam mulai<input type="time" value={start} onChange={e=>setStart(e.target.value)}/></label>
                        <label>Jam selesai<input type="time" value={end} onChange={e=>setEnd(e.target.value)}/></label>
                        <label>Kode unit<select value={slotUnit} onChange={e=>setSlotUnit(e.target.value)}><option value="">Pilih unit Ready…</option>{availableFor(r).map(u=><option key={u.id} value={u.id}>{u.code} · {u.kind}</option>)}</select></label>
                      </div>
                      <label>Keterangan penugasan<input value={assignmentNotes} onChange={e=>setAssignmentNotes(e.target.value)} placeholder="Misalnya: alokasi water tank ke A-007"/></label>
                      {replacementOf&&<small className="muted">Menggantikan {sourceAssignment?.unitCode||replacementOf}. Histori penugasan lama tetap tersimpan.</small>}
                      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                        <button type="button" disabled={busy||!slotUnit} onClick={()=>void saveAssignment()}>{busy?'Menyimpan…':replacementOf?'Simpan Unit Pengganti':'Simpan Penugasan'}</button>
                        {replacementOf&&<button type="button" onClick={()=>setReplacementOf('')}>Batal Replacement</button>}
                      </div>
                    </div>}
                  </td></tr>}
                </tbody></table>
              </td></tr>
            })}</tbody>
          </table>
        </div>
      </div>
      <div className="panel"><h3>Unit Fisik & Standby Otomatis</h3>
        <input aria-label="Cari unit" placeholder="Cari kode unit, equipment, implement…" value={search} onChange={e=>setSearch(e.target.value)}/>
        <div style={{maxHeight:360,overflowY:'auto',marginTop:10,display:'grid',gap:6}}>{filteredUnits.map(u=>{
          const state=conditionAt(events,u.id,nowMinute)
          const busy=activeAtTime(u.id)
          const display=state==='READY'?(busy?'Assigned / Working':'Standby'):eventConditionLabel(state)
          return <div key={u.id} style={{padding:10,border:'1px solid #e2e8f0',borderRadius:9,display:'flex',justifyContent:'space-between',alignItems:'center',gap:10}}>
            <div><strong>{u.code}</strong><small style={{display:'block',color:'#64748b'}}>{u.kind}{u.implement?' · '+u.implement:''}</small></div>
            <div style={{display:'flex',gap:7,alignItems:'center'}}><span style={{fontSize:12,fontWeight:600,color:state==='READY'?'#27704f':'#9d493d'}}>{display}</span><button type="button" onClick={()=>{setFocusUnit(u.id);setTab('events')}}>Detail</button></div>
          </div>
        })}</div>
      </div>
    </div>}
    {tab==='import'&&<MasterResourceImportPanel user={user} kind="unit" onImported={refresh}/>}
    {tab==='units'&&<UnitMasterGrid user={user} units={units} kinds={kinds} events={events} onSaved={refresh}/>}
    {tab==='events'&&<div style={{display:'grid',gap:12,marginTop:12}}>
      <div className="panel"><h3>Perubahan Kondisi Unit (Tanpa Approval)</h3>
        <label>Kode Unit<select value={focusUnit} onChange={e=>setFocusUnit(e.target.value)}><option value="">Pilih unit…</option>{units.map(u=><option key={u.id} value={u.id}>{u.code} — {u.kind}</option>)}</select></label>
        {unitFocus&&<div style={{marginTop:10,display:'grid',gap:9}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><strong>{unitFocus.code}</strong><span style={{fontWeight:600}}>{eventConditionLabel(conditionAt(events,unitFocus.id,nowMinute))}</span></div>
          {reporter&&<>
            <label>Jenis Kejadian<select value={eventType} onChange={e=>setEventType(e.target.value as UnitEventType)}><option value="BREAKDOWN">Breakdown — laporan Mandor</option>{editor&&<><option value="MAINTENANCE">Maintenance dimulai</option><option value="READY">Ready — langsung tersedia</option><option value="OUT_OF_SERVICE">Out of Service</option></>}</select></label>
            {eventType==='MAINTENANCE'&&<div style={{display:'grid',gap:8}}>
              <label>Jenis Maintenance<select value={maintenanceType} onChange={e=>setMaintenanceType(e.target.value)}><option value="PREVENTIVE">Preventive / Periodic Service</option><option value="CORRECTIVE">Corrective Repair</option><option value="INSPECTION">Inspection</option><option value="IMPLEMENT">Implement Maintenance</option></select></label>
              <div className="form-grid"><label>Estimasi selesai<input type="date" value={estimatedFinish} onChange={e=>setEstimatedFinish(e.target.value)}/></label><label>Hour Meter (opsional)<input type="number" min="0" step="0.1" value={hourMeter} onChange={e=>setHourMeter(e.target.value)}/></label></div>
              <label>PIC / Workshop<input value={maintenancePic} onChange={e=>setMaintenancePic(e.target.value)} placeholder="Penanggung jawab pemeliharaan"/></label>
            </div>}
            <label>Waktu kejadian<input type="time" value={eventTime} onChange={e=>setEventTime(e.target.value)}/></label>
            <label>Keterangan / dasar pemeriksaan<textarea rows={3} value={eventNote} onChange={e=>setEventNote(e.target.value)} placeholder="Tuliskan penyebab, tindakan, atau hasil pemeriksaan…"/></label>
            <button type="button" disabled={busy||!eventNote.trim()} onClick={()=>void saveEvent()}>{busy?'Menyimpan…':eventType==='READY'?'Set Ready Sekarang':'Simpan Kondisi'}</button>
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
