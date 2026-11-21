// 11D.5c.1 — isolated React portal shell, not imported by the production portal.
// Role preview/edit and Planning reads run over same-origin loopback-only HTTP.
import React,{useEffect,useMemo,useRef,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {initializeApp} from 'firebase/app'
import {initializeAuth,inMemoryPersistence,connectAuthEmulator,onAuthStateChanged,signInWithEmailAndPassword,signOut} from 'firebase/auth'
import RoleLifecycle from '../src/UatRoleLifecyclePanel'
import UatUnifiedOperationalForm from '../src/UatUnifiedOperationalForm.jsx'
import UatUnifiedFullOperationalForm from '../src/UatUnifiedFullOperationalForm.jsx'
import {validateCustomRole} from '../src/qcUatCustomRoles.mjs'
import {validateSession} from '../src/qcUatSessionPermissions.mjs'
import {allowedUatOperationalAreas,resolveUatOperationalArea} from '../src/qcUatOperationalPortalNavigation.mjs'
import {fullQcExecutionRequest,validateFullQcExecutionSource} from '../src/qcUatUnifiedCarryoverSelection.mjs'
if(location.origin!=='http://127.0.0.1:4797')throw Error('UNIFIED_BROWSER_ORIGIN')
// This isolated navigation is enabled ONLY in a dedicated UAT browser bundle.
const operationalPortalPilot=typeof __QC_UAT_OPERATIONAL_PORTAL__!=='undefined'&&__QC_UAT_OPERATIONAL_PORTAL__===true
const app=initializeApp({projectId:'demo-qc-uat-unified-role-planning',apiKey:'demo-only-not-a-real-key'})
const auth=initializeAuth(app,{persistence:inMemoryPersistence})
connectAuthEmulator(auth,'http://127.0.0.1:10099',{disableWarnings:true})
const fixtures=['uat-owner','uat-field','uat-viewer']
function adapterFor(user){
 async function call(group,path,body={}){
  if(auth.currentUser!==user)throw Error('IDENTITY_CHANGED')
  const token=await user.getIdToken()
  if(auth.currentUser!==user)throw Error('IDENTITY_CHANGED')
  const response=await fetch('/api/'+group+path,{
   method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
   body:JSON.stringify(body),cache:'no-store',redirect:'error',credentials:'omit',
   signal:AbortSignal.timeout(path==='/uat/unified/qc/full/photo/commit'?45000:7000)
  })
  if(auth.currentUser!==user)throw Error('IDENTITY_CHANGED')
  if(!response.ok)throw Error('REQUEST_DENIED')
  const data=await response.json()
  if(auth.currentUser!==user)throw Error('IDENTITY_CHANGED')
  return data
 }
 const owner=(path,body)=>call('owner',path,body)
 const planning=(path,body)=>call('planning',path,body)
 return {
  isCurrent:u=>auth.currentUser===u,
  // Default OFF. A separate emulator-backed browser gate must explicitly enable this.
  // The browser pilot flag is injected ONLY by the dedicated emulator test bundle.
  // Ordinary builds have no flag, and their trusted HTTP route is disabled.
  photoCommitEnabled:typeof __QC_UAT_BROWSER_PHOTO_PILOT__!=='undefined'&&__QC_UAT_BROWSER_PHOTO_PILOT__===true,
  photoPreviewEnabled:typeof __QC_UAT_PRIVATE_PREVIEW__!=='undefined'&&__QC_UAT_PRIVATE_PREVIEW__===true,
  qcSource:async(formType,dailyPlanId)=>(await planning('/uat/unified/qc/source',{request:{formType,dailyPlanId}})).source,
  qcCommit:async(request)=>(await planning('/uat/unified/qc/commit',{request})).qc,
  fullQcSource:async(formType,dailyPlanId,selection={carryover:false,actualForemanId:''})=>{
   const scalar=(await planning('/uat/unified/qc/source',{request:{formType,dailyPlanId}})).source
   if(scalar?.readOnly!==true||scalar?.dailyPlanId!==dailyPlanId||scalar?.formType!==formType)throw Error('INVALID_SCALAR_SOURCE')
   const {request}=fullQcExecutionRequest(scalar,formType,selection)
   const source=(await planning('/uat/unified/qc/full/source',{request})).source
   return validateFullQcExecutionSource(source,scalar,formType,selection)
  },
  fullQcCommit:async(formType,request)=>{
   if(formType!==request.record?.formType||!['spray','fertilizer'].includes(formType))throw Error('FORM_KIND_DENIED')
   const route=formType==='spray'?'/uat/unified/qc/full/spray/commit':'/uat/unified/qc/full/fertilizer/commit'
   return (await planning(route,{request})).qc
  },
  fullQcPhotoCommit:async(formType,envelope)=>{
   if(formType!==envelope?.request?.record?.formType||!['spray','fertilizer'].includes(formType))throw Error('FORM_KIND_DENIED')
   return planning('/uat/unified/qc/full/photo/commit',envelope)
  },
  fullQcPhotoPreview:async({recordId,photoId})=>{
   if(typeof __QC_UAT_PRIVATE_PREVIEW__==='undefined'||__QC_UAT_PRIVATE_PREVIEW__!==true)throw Error('PREVIEW_DISABLED')
   return (await planning('/uat/unified/qc/photo/sign',{request:{recordId,photoId}})).preview
  },
  session:async()=>validateSession((await owner('/uat/session/permissions',{})).session,user.uid),
  read:async(scope,id)=>(await planning('/uat/unified/planning/read',{scope,id})).plan,
  operationalSummary:async(request)=>(await planning('/uat/unified/portal/summary',{request})).summary,
  operationalCalendar:async(request)=>(await planning('/uat/unified/portal/calendar',{request})).calendar,
  operationalRecords:async(request)=>(await planning('/uat/unified/portal/qc-records',{request})).records,
  operationalRecordsBrowse:async(request)=>(await planning('/uat/unified/portal/qc-browse',{request})).records,
  lifecycle:{
   list:async()=>{
    const {roles}=await owner('/uat/owner/permissions/roles-list',{})
    if(!Array.isArray(roles)||roles.length>107)throw Error('INVALID_ROLE_LIST')
    return roles.filter(r=>r.kind==='custom').map(validateCustomRole)
   },
   preview:async roleId=>(await owner('/uat/owner/permissions/roles-preview',{roleId})).preview,
   update:async input=>(await owner('/uat/owner/permissions/roles-update',input)).update,
   retire:async input=>(await owner('/uat/owner/permissions/roles-delete',input)).deleted
  }
 }
}
function App(){
 const [user,setUser]=useState(null),[session,setSession]=useState(null)
 const [state,setState]=useState('signed-out'),[busy,setBusy]=useState(false)
 const [result,setResult]=useState('')
 const [portalArea,setPortalArea]=useState('home')
 const [summaryPeriod,setSummaryPeriod]=useState(()=>new Date().toISOString().slice(0,7))
 const [summaryWeek,setSummaryWeek]=useState('ALL')
 const [summaryResult,setSummaryResult]=useState(null),[summaryState,setSummaryState]=useState('idle')
 const [calendarMonth,setCalendarMonth]=useState(()=>new Date().toISOString().slice(0,7)),[calendarSource,setCalendarSource]=useState('daily')
 const [calendarResult,setCalendarResult]=useState(null),[calendarState,setCalendarState]=useState('idle')
 const [qcMonth,setQcMonth]=useState(()=>new Date().toISOString().slice(0,7)),[qcKind,setQcKind]=useState('all')
 const [qcRecords,setQcRecords]=useState(null),[qcRecordsState,setQcRecordsState]=useState('idle')
 const [qcSearchTerm,setQcSearchTerm]=useState(''),[qcViewMode,setQcViewMode]=useState('month')
 const qcRequestSeq=useRef(0)
 const seq=useRef(0),identity=useRef(null),refreshRef=useRef(()=>{})
 useEffect(()=>{
  let active=true
  async function refresh(u){
   const ticket=++seq.current
   setSession(null);setResult('');setState(u?'loading':'signed-out')
   if(!u)return
   try{
    const valid=await adapterFor(u).session()
    if(active&&ticket===seq.current&&auth.currentUser===u){
     setSession(valid);setState('confirmed')
    }
   }catch{
    if(active&&ticket===seq.current&&auth.currentUser===u){
     setSession(null);setState('denied')
    }
   }
  }
  refreshRef.current=()=>void refresh(identity.current)
  const unsub=onAuthStateChanged(auth,u=>{
   identity.current=u;setUser(u);void refresh(u)
  })
  return()=>{active=false;seq.current++;unsub()}
 },[])
 const api=useMemo(()=>user?adapterFor(user):null,[user])
 async function login(uid){
  if(!fixtures.includes(uid))return
  setBusy(true)
  try{
   await signOut(auth)
   await signInWithEmailAndPassword(auth,uid+'@unified-ui.example.test','Synthetic-2026-'+uid)
  }catch{setSession(null);setState('login-failed')}
  finally{setBusy(false)}
 }
 async function read(scope,id){
  if(!user||!api||!session)return
  const current=user
  const ticket=seq.current
  setResult('loading')
  try{
   const item=await api.read(scope,id)
   if(ticket===seq.current&&auth.currentUser===current)setResult(scope+': '+item.id+' / '+(scope==='monthly'?item.area100:item.area100))
  }catch{
   if(ticket===seq.current&&auth.currentUser===current){setSession(null);setState('denied');setResult('request-denied')}
  }
 }
 async function loadSummary(){
  if(!user||!session||!api||!['view','edit'].includes(session.permissions.data_plan_summary??'none'))return
  const current=user,ticket=seq.current
  setSummaryResult(null);setSummaryState('loading')
  try{
   const request={period:summaryPeriod,week:summaryWeek,companyCode:null,farm:null,shift:null,foreman:null}
   const data=await api.operationalSummary(request)
   if(ticket!==seq.current||auth.currentUser!==current)return
   if(data?.testOnly!==true||data.readOnly!==true||data.period!==request.period||
      data.week!==request.week||!data.monthly?.spray||!data.daily?.fertilizer||
      !Array.isArray(data.executionByForemanShift))throw Error('INVALID_SUMMARY_RECEIPT')
   setSummaryResult(data);setSummaryState('ready')
  }catch{if(ticket===seq.current&&auth.currentUser===current){setSummaryResult(null);setSummaryState('denied')}}
 }
 async function loadCalendar(){
  if(!user||!session||!api)return
  const canReadCalendar=calendarSource==='daily'?['view','edit'].includes(session.permissions.data_plan_daily??'none'):
   ['view','edit'].includes(session.permissions.data_plan_actual??'none')
  const source=canReadCalendar?calendarSource:null
  if(!source)return
  const current=user,ticket=seq.current
  setCalendarResult(null);setCalendarState('loading')
  try{
   const data=await api.operationalCalendar({monthKey:calendarMonth,source})
   if(ticket!==seq.current||auth.currentUser!==current)return
   if(data?.testOnly!==true||data.readOnly!==true||data.monthKey!==calendarMonth||
      data.source!==source||!Array.isArray(data.entries)||data.entries.length>50||
      data.eventCount!==data.entries.reduce((n,e)=>n+(e.count??1),0))throw Error('INVALID_CALENDAR_RECEIPT')
   setCalendarResult(data);setCalendarState('ready')
  }catch{if(ticket===seq.current&&auth.currentUser===current){setCalendarResult(null);setCalendarState('denied')}}
 }
 async function loadQcRecords(){
  if(!user||!session||!api||!['view','edit'].includes(session.permissions.qc_records??'none'))return
  const current=user,ticket=seq.current,queryTicket=++qcRequestSeq.current,request={monthKey:qcMonth,kind:qcKind}
  setQcViewMode('month');setQcRecords(null);setQcRecordsState('loading')
  try{
   const data=await api.operationalRecords(request)
   if(ticket!==seq.current||queryTicket!==qcRequestSeq.current||auth.currentUser!==current)return
   if(data?.testOnly!==true||data.readOnly!==true||
      data.monthKey!==request.monthKey||data.kind!==request.kind||
      !Array.isArray(data.records)||data.records.length>50||
      data.recordCount!==data.records.length||
      data.records.some(r=>!['spray','fertilizer'].includes(r.formType)||
       !['draft','ready','uploaded'].includes(r.saveType)||
       !/^(?:uat-[a-z0-9-]{1,60})$/.test(r.id)||
       r.actual?.semantics==='COMPONENT_APPLICATION_SUM'&&
        !Array.isArray(r.actual.components)))throw Error('INVALID_QC_RECORDS_RECEIPT')
   setQcRecords(data);setQcRecordsState('ready')
  }catch{if(ticket===seq.current&&queryTicket===qcRequestSeq.current&&auth.currentUser===current){
   setQcRecords(null);setQcRecordsState('denied')
  }}
 }
 async function loadQcBrowse(mode){
  if(!user||!session||!api||!['view','edit'].includes(session.permissions.qc_records??'none'))return
  if(mode!=='recent'&&mode!=='exact')return
  const term=qcSearchTerm.trim().toLowerCase()
  if(mode==='exact'&&!/^uat-[a-z0-9-]{1,60}$/.test(term)){
   qcRequestSeq.current++;setQcRecords(null);setQcRecordsState('invalid-id');return
  }
  const request=mode==='recent'?{mode:'recent',kind:qcKind}:{mode:'exact',kind:qcKind,term}
  const current=user,ticket=seq.current,queryTicket=++qcRequestSeq.current
  setQcViewMode(mode);setQcRecords(null);setQcRecordsState('loading')
  try{
   const data=await api.operationalRecordsBrowse(request)
   if(ticket!==seq.current||queryTicket!==qcRequestSeq.current||auth.currentUser!==current)return
   if(data?.testOnly!==true||data.readOnly!==true||data.mode!==mode||
      data.kind!==qcKind||data.window!==(mode==='recent'?'LATEST_100_ALL_KINDS':'EXACT_ID_ACROSS_ALL_DATES')||
      (mode==='exact'&&data.term!==term)||
      !Array.isArray(data.records)||data.records.length>100||
      typeof data.hasMore!=='boolean'||data.recordCount!==data.records.length||
      data.records.some(r=>!['spray','fertilizer'].includes(r.formType)||
       !['draft','ready','uploaded'].includes(r.saveType)||
       !/^uat-[a-z0-9-]{1,60}$/.test(r.id)))throw Error('INVALID_QC_BROWSE_RECEIPT')
   setQcRecords(data);setQcRecordsState('ready')
  }catch{if(ticket===seq.current&&queryTicket===qcRequestSeq.current&&auth.currentUser===current){
   setQcRecords(null);setQcRecordsState('denied')
  }}
 }
 const mode=key=>session?.permissions[key]??'none'
 useEffect(()=>{
  if(!operationalPortalPilot||!session)return
  const daily=['view','edit'].includes(session.permissions.data_plan_daily??'none')
  const actual=['view','edit'].includes(session.permissions.data_plan_actual??'none')
  if(!daily&&actual&&calendarSource==='daily')setCalendarSource('actual')
  if(!actual&&daily&&calendarSource==='actual')setCalendarSource('daily')
 },[session?.policyRevision,session?.uid,calendarSource])
 useEffect(()=>{if(operationalPortalPilot){setPortalArea('home');setSummaryResult(null);setSummaryState('idle');setCalendarResult(null);setCalendarState('idle');setCalendarSource('daily');qcRequestSeq.current++;setQcRecords(null);setQcRecordsState('idle');setQcViewMode('month')}},[user?.uid,session?.policyRevision])
 const areas=operationalPortalPilot?allowedUatOperationalAreas(session):[]
 const area=operationalPortalPilot?resolveUatOperationalArea(session,portalArea):'home'
 const showData=!operationalPortalPilot||area==='data-unm'
 const showQc=!operationalPortalPilot||area==='qc'
 const showUsers=!operationalPortalPilot||area==='users'
 const visible=key=>['view','edit'].includes(mode(key))
 const owner=!!session&&session.role==='owner'&&session.uid===user?.uid
 return <main>
  <h1>Unified QC & Planning Portal Shell — Demo UAT</h1>
  <p>Emulator only. QC source and receipt tests use synthetic records, without external photos or production hosting.</p>
  <p data-testid="actor">{user?.uid??'signed-out'}</p>
  <p data-testid="session-state">{state}</p>
  <p data-testid="role">{session?.role??'-'}</p>
  <p data-testid="revision">{session?.policyRevision??'-'}</p>
  {fixtures.map(uid=><button key={uid} disabled={busy} onClick={()=>void login(uid)}>Login {uid}</button>)}
  <button disabled={!user||busy} onClick={()=>void signOut(auth)}>Logout</button>
  <button disabled={!user||busy} onClick={()=>void refreshRef.current()}>Refresh permission</button>
  {operationalPortalPilot&&state==='confirmed'&&session&&<section data-testid="uat-operational-portal-pilot" aria-label="Portal Operasional UAT">
   <h2>Operational Portal — UAT terisolasi</h2>
   <p>Menu mengikuti permission Firebase terverifikasi. Modul produksi belum terhubung.</p>
   <p data-testid="uat-operational-active-area">{area}</p>
   {area!=='home'&&<button type="button" onClick={()=>setPortalArea('home')}>Menu Utama</button>}
   {area==='home'&&<nav aria-label="Pilih area kerja UAT">
    {areas.map(item=><button type="button" key={item.id}
     data-testid={'uat-operational-card-'+item.id}
     onClick={()=>setPortalArea(item.id)}>{item.label}</button>)}
   </nav>}
   {area==='summary'&&<section data-testid="uat-operational-summary" aria-label="Summary Planning UAT">
    <h3>Summary MP, DP dan Actual — data sintetis</h3>
    <label>Periode <input aria-label="Periode Summary" type="month" value={summaryPeriod}
     onChange={e=>{setSummaryPeriod(e.target.value);setSummaryResult(null);setSummaryState('idle')}}/></label>
    <label>Minggu <select aria-label="Minggu Summary" value={summaryWeek}
     onChange={e=>{setSummaryWeek(e.target.value);setSummaryResult(null);setSummaryState('idle')}}>
     {['ALL','W1','W2','W3','W4'].map(x=><option key={x}>{x}</option>)}
    </select></label>
    <button type="button" onClick={()=>void loadSummary()}>Muat Summary UAT</button>
    <p data-testid="uat-operational-summary-state">{summaryState}</p>
    {summaryResult&&<div data-testid="uat-operational-summary-result">
     <p>Target MP Spray: {(summaryResult.monthly.spray.targetArea100??0)/100} Ha</p>
     <p>Actual DP Spray: {(summaryResult.daily.spray.actualArea100??0)/100} Ha</p>
     <p>Aplikasi pupuk: {(summaryResult.daily.fertilizer.applicationArea100??0)/100} Ha aplikasi (jumlah komponen, bukan luas fisik)</p>
     <p>Eksekusi mandor/shift: {summaryResult.executionByForemanShift.length} kelompok</p>
    </div>}
   </section>}
   {area==='calendar'&&<section data-testid="uat-operational-calendar" aria-label="Calendar Rekap UAT">
    <h3>Calendar Rekap — sumber DP/Actual sintetis</h3>
    <label>Bulan <input aria-label="Bulan Calendar" type="month" value={calendarMonth}
     onChange={e=>{setCalendarMonth(e.target.value);setCalendarResult(null);setCalendarState('idle')}}/></label>
    <label>Sumber <select aria-label="Sumber Calendar" value={calendarSource}
     onChange={e=>{setCalendarSource(e.target.value);setCalendarResult(null);setCalendarState('idle')}}>
     {['view','edit'].includes(mode('data_plan_daily'))&&<option value="daily">Daily Plan</option>}
     {['view','edit'].includes(mode('data_plan_actual'))&&<option value="actual">Actual Plan</option>}
    </select></label>
    <button type="button" disabled={!['view','edit'].includes(mode(calendarSource==='daily'?'data_plan_daily':'data_plan_actual'))}
      onClick={()=>void loadCalendar()}>Muat Calendar UAT</button>
    <p data-testid="uat-operational-calendar-state">{calendarState}</p>
    {calendarResult&&<div data-testid="uat-operational-calendar-result">
     <p>{calendarResult.eventCount} record ({calendarResult.source==='daily'?'Daily Plan':'Actual Plan'})</p>
     <ul>{calendarResult.entries.map((e,i)=><li key={i}>
      {e.date} · Shift {e.shift} · {e.kind}
      {calendarResult.source==='daily'?' · '+e.pid+' · '+(e.plannedArea100/100)+' Ha target':' · '+e.count+' aktual'}
     </li>)}</ul>
    </div>}
   </section>}
   {area==='users'&&<p data-testid="uat-operational-users">Users & Access: editor role UAT, bukan data produksi.</p>}
  </section>}
  <nav aria-label="Menu berdasarkan permission server">
   {showData&&visible('data_plan_monthly')&&<section data-testid="menu-monthly">
    <strong>Monthly Plan · {mode('data_plan_monthly')}</strong>
    <button onClick={()=>void read('monthly','uat-m1')}>Baca Monthly UAT</button>
   </section>}
   {showData&&visible('data_plan_daily')&&<section data-testid="menu-daily">
    <strong>Daily Plan · {mode('data_plan_daily')}</strong>
    <button onClick={()=>void read('daily','uat-d1')}>Baca Daily UAT</button>
   </section>}
   {showData&&visible('data_plan_summary')&&<span data-testid="menu-summary">Summary · {mode('data_plan_summary')}</span>}
   {showData&&visible('data_plan_actual')&&<span data-testid="menu-actual">Actual · {mode('data_plan_actual')}</span>}
   {showQc&&visible('qc_spraying')&&<span data-testid="menu-spray">QC Spray · {mode('qc_spraying')}</span>}
   {showQc&&visible('qc_fertilizer')&&<span data-testid="menu-fertilizer">QC Fertilizer · {mode('qc_fertilizer')}</span>}
  </nav>
  {showData&&<p data-testid="read-result">{result}</p>}
  {operationalPortalPilot&&showQc&&user&&api&&visible('qc_records')&&<section
   aria-label="Data QC UAT" data-testid="uat-operational-qc-records">
   <h3>Data QC dan Actual Plan — UAT</h3>
   <p>Ringkasan record yang memiliki audit valid. Maksimum 50 record per bulan, tanpa foto atau DTO mentah.</p>
   <label>Bulan Data QC <input type="month" aria-label="Bulan Data QC" value={qcMonth}
    onChange={e=>{qcRequestSeq.current++;setQcMonth(e.target.value);setQcRecords(null);setQcRecordsState('idle')}}/></label>
   <label>Jenis QC <select aria-label="Jenis Data QC" value={qcKind}
    onChange={e=>{qcRequestSeq.current++;setQcKind(e.target.value);setQcRecords(null);setQcRecordsState('idle')}}>
    <option value="all">Semua</option><option value="spray">Spray</option><option value="fertilizer">Fertilizer</option>
   </select></label>
   <button type="button" onClick={()=>void loadQcRecords()}>Muat Data QC UAT</button>
   <button type="button" onClick={()=>void loadQcBrowse('recent')}>Muat 100 QC Terbaru</button>
   <label>ID tepat lintas bulan <input aria-label="ID Pencarian QC" value={qcSearchTerm}
    placeholder="uat-p1, uat-d1, uat-f1, atau ID QC"
    onChange={e=>{qcRequestSeq.current++;setQcSearchTerm(e.target.value);setQcRecords(null);setQcRecordsState('idle')}}/></label>
   <button type="button" onClick={()=>void loadQcBrowse('exact')}>Cari ID QC Tepat</button>
   <p>Pencarian tepat berdasarkan ID QC, paddock, Daily Plan, atau mandor; bukan pencarian sebagian kata.
   Filter jenis untuk 100 terbaru berlaku di dalam 100 record terbaru seluruh jenis.</p>
   <p data-testid="uat-operational-qc-records-state">{qcRecordsState}</p>
   {qcRecords&&<div data-testid="uat-operational-qc-records-result">
    <p>{qcRecords.recordCount} record QC</p>
    {qcViewMode==='recent'&&<p data-testid="uat-qc-recent-window">
     100 QC terbaru lintas periode{qcRecords.hasMore?' (masih ada record lebih lama)':''}
    </p>}
    {qcViewMode==='exact'&&<p data-testid="uat-qc-exact-window">Pencarian ID tepat lintas periode: {qcRecords.term}</p>}
    <ul>{qcRecords.records.map(r=><li key={r.id} data-testid={'uat-qc-row-'+r.id}>
     <strong>{r.id}</strong> — {r.formType} — {r.saveType} — {r.date} Shift {r.shift} — {r.pid}
     <div>Daily Plan: {r.dailyPlanId} · Mandor: {r.foreman}</div>
     {r.actual?.semantics==='PHYSICAL_APPLICATION'&&<div>Actual: {r.actual.area100/100} Ha lahan</div>}
     {r.actual?.semantics==='COMPONENT_APPLICATION_SUM'&&<div>
      Aplikasi komponen: {r.actual.applicationArea100/100} Ha-aplikasi (bukan luas fisik)
      <ul>{r.actual.components.map(c=><li key={c.componentId}>{c.componentId}: {c.area100/100} Ha-aplikasi</li>)}</ul>
     </div>}
     {!r.actual&&<div>Belum ada Actual terkonfirmasi</div>}
    </li>)}</ul>
   </div>}
  </section>}
  {showQc&&user&&api&&mode('qc_spraying')==='edit'&&<UatUnifiedOperationalForm key={'spray-'+user.uid+'-'+session.policyRevision} user={user} kind="spray" api={api}/>}
  {showQc&&user&&api&&mode('qc_spraying')==='edit'&&<UatUnifiedFullOperationalForm key={'full-spray-'+user.uid+'-'+session.policyRevision} user={user} kind="spray" api={api}/>}
  {showQc&&user&&api&&mode('qc_fertilizer')==='edit'&&<UatUnifiedOperationalForm key={'fertilizer-'+user.uid+'-'+session.policyRevision} user={user} kind="fertilizer" api={api}/>}
  {showQc&&user&&api&&mode('qc_fertilizer')==='edit'&&<UatUnifiedFullOperationalForm key={'full-fertilizer-'+user.uid+'-'+session.policyRevision} user={user} kind="fertilizer" api={api}/>} 
  {showUsers&&owner&&api&&<RoleLifecycle key={'owner-'+user.uid} adapter={api.lifecycle}/>}
 </main>
}
createRoot(document.getElementById('root')).render(<App/>)
