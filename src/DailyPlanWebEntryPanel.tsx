import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { collection, doc, getDoc, getDocs, query as fsQuery, serverTimestamp, where, writeBatch } from 'firebase/firestore'
import { firebaseAuth, firestoreDb } from './firebase'
import DailyActionIcon from './DailyPlanActionIcon'
import { dailyPlansToWhatsApp, type DailyPlanTransfer } from './dailyPlanActions'
import type { DailyComposerRequest } from './dailyPlanWorkspaceTypes'
import { aggregateMaterials, clearPlanDraft, materialLinesFromComponents, planHa, planNum, planRowId, planText, readPlanDraft, writePlanDraft } from './planInputUtils'
import type { User } from './types'

type Props={user:User;selectedDate?:string;onDateChange?:(date:string)=>void;onSaved?:()=>void;composerRequest?:DailyComposerRequest;onComposerRequestHandled?:()=>void}
type Monthly={id:string;planLineId:string;monthKey:string;week:string;companyCode:string;farm:string;pid:string;description:string;activity:string;targetAreaHa:number;type:string;activityCategory:string;stage:string;masterVariety:string;componentsSnapshot:unknown[]}
type Daily={dailyPlanId:string;monthlyPlanLineId:string;date:string;shift:string;areaHa:number}
type MasterPaddock={pid:string;companyCode:string;farm:string;stage:string;variety:string}
type MasterActivity={id:string;description:string;activity:string;componentsSnapshot:unknown[]}
type PidDraft={id:string;search:string;monthlyId:string;pid:string;area:string;persistedDocId?:string;persistedDailyPlanId?:string}
type WorkDraft={id:string;sourceType:'MONTHLY'|'ADHOC'|'SUPPORT';shift:string;foreman:string;activitySearch:string;manpower:string;unitName:string;unitReady:string;unitStandby:string;unitBreakdown:string;notes:string;pids:PidDraft[]}
type DraftState={date:string;active:WorkDraft;works:WorkDraft[];editingId:string}
type PersistedEditContext={groupKey:string;workGroupId:string;planningOrder:number;originalRows:Array<{id:string;dailyPlanId:string;monthlyPlanLineId:string}>}
type PidInfo={pid:PidDraft;choices:Monthly[];selected:Monthly|null;paddock:MasterPaddock|null;area:number;scheduled:number;remaining:number;materials:ReturnType<typeof materialLinesFromComponents>}
type WorkInfo={work:WorkDraft;activityOptions:string[];manualActivity:MasterActivity|null;activityReference:Monthly|null;activityDosePreview:ReturnType<typeof materialLinesFromComponents>;pids:PidInfo[];area:number;materials:ReturnType<typeof aggregateMaterials>}

function blankPid():PidDraft{return{id:planRowId('pid'),search:'',monthlyId:'',pid:'',area:''}}
function blankWork(seed?:Partial<WorkDraft>):WorkDraft{return{id:planRowId('daily'),sourceType:'MONTHLY',shift:'1',foreman:'',activitySearch:'',manpower:'0',unitName:'',unitReady:'0',unitStandby:'0',unitBreakdown:'0',notes:'',pids:[blankPid()],...seed}}
function normalizeWork(value:unknown,legacyShift='1',legacyForeman=''):WorkDraft{
  const row=(value&&typeof value==='object'?value:{}) as Record<string,unknown>
  const source=(['MONTHLY','ADHOC','SUPPORT'].includes(planText(row.sourceType))?planText(row.sourceType):'MONTHLY') as WorkDraft['sourceType']
  const rawPids=Array.isArray(row.pids)?row.pids:[{search:row.search,monthlyId:row.monthlyId,pid:row.adhocPid,area:row.area}]
  const pids=rawPids.length?rawPids.map(item=>{const p=(item&&typeof item==='object'?item:{}) as Record<string,unknown>;return{id:planText(p.id)||planRowId('pid'),search:planText(p.search),monthlyId:planText(p.monthlyId),pid:planText(p.pid).toUpperCase(),area:planText(p.area),persistedDocId:planText(p.persistedDocId)||undefined,persistedDailyPlanId:planText(p.persistedDailyPlanId)||undefined}}):[blankPid()]
  return{id:planText(row.id)||planRowId('daily'),sourceType:source,shift:planText(row.shift)||legacyShift||'1',foreman:planText(row.foreman)||legacyForeman,activitySearch:planText(row.activitySearch||row.adhocActivity),manpower:planText(row.manpower)||'0',unitName:planText(row.unitName),unitReady:planText(row.unitReady)||'0',unitStandby:planText(row.unitStandby)||'0',unitBreakdown:planText(row.unitBreakdown)||'0',notes:planText(row.notes),pids}
}
function normalizeDraft(raw:unknown):DraftState{
  const today=new Date().toISOString().slice(0,10)
  if(!raw||typeof raw!=='object')return{date:today,active:blankWork(),works:[],editingId:''}
  const row=raw as Record<string,unknown>,date=planText(row.date)||today,legacyShift=planText(row.shift)||'1',legacyForeman=planText(row.foreman)
  if(row.active){
    return{date,active:normalizeWork(row.active,legacyShift,legacyForeman),works:Array.isArray(row.works)?row.works.map(item=>normalizeWork(item,legacyShift,legacyForeman)):[],editingId:planText(row.editingId)}
  }
  const legacyWorks=Array.isArray(row.works)?row.works.map(item=>normalizeWork(item,legacyShift,legacyForeman)):[]
  return{date,active:blankWork({shift:legacyShift,foreman:legacyForeman}),works:legacyWorks,editingId:''}
}
function cloneWork(work:WorkDraft,newId=true):WorkDraft{return{...work,id:newId?planRowId('daily'):work.id,pids:work.pids.map(pid=>({...pid,id:newId?planRowId('pid'):pid.id}))}}
function searchKey(value:unknown){return planText(value).toLowerCase().replace(/\s+/g,' ').trim()}
function monthlyOptionLabel(row:Monthly){return row.pid+' — '+row.planLineId+' — '+row.monthKey+'/'+row.week+' — '+(row.description||row.activity)}
function monthBounds(date:string){const monthKey=date.slice(0,7),[year,month]=monthKey.split('-').map(Number),nextMonth=month===12?`${year+1}-01`:`${year}-${String(month+1).padStart(2,'0')}`;return{monthKey,startDate:monthKey+'-01',nextStartDate:nextMonth+'-01'}}
function activityLabel(row:Monthly){return planText(row.description||row.activity)}
function paddockKey(value:unknown){return planText(value).toUpperCase().replace(/\s+/g,'').trim()}
function shortPaddockCode(pid:string){const parts=paddockKey(pid).split('-').filter(Boolean);return parts.length>=2?parts.slice(-2).join('-'):parts.join('-')}
function looksLikePaddockSearch(value:string){const q=paddockKey(value);return /-[0-9]+$/.test(q)}
function smartMonthlyChoices(rows:Monthly[],input:string,activity:string){
  const activityKey=searchKey(activity),scoped=activityKey?rows.filter(row=>searchKey(activityLabel(row))===activityKey):rows,q=searchKey(input)
  if(!q)return scoped
  const byPlanId=scoped.filter(row=>searchKey(row.planLineId).startsWith(q))
  if(byPlanId.length)return byPlanId
  if(looksLikePaddockSearch(input)){
    const code=paddockKey(input),shortQuery=code.split('-').length<=2,complete=/-\d{3,4}$/.test(code)
    return scoped.filter(row=>{const full=paddockKey(row.pid),short=shortPaddockCode(row.pid),target=shortQuery?short:full;return complete?target===code:target.startsWith(code)})
  }
  return scoped.filter(row=>searchKey(row.pid).startsWith(q))
}
function activityChoices(rows:Monthly[],input:string){
  const q=searchKey(input),seen=new Set<string>(),out:string[]=[]
  for(const row of rows){const label=activityLabel(row),key=searchKey(label);if(!label||seen.has(key)||q&&!key.startsWith(q))continue;seen.add(key);out.push(label)}
  return out.sort((a,b)=>a.localeCompare(b)).slice(0,80)
}
async function writer(appUser:User){const db=firestoreDb,auth=firebaseAuth;if(!db||!auth)throw new Error('Firebase belum tersedia.');const current=auth.currentUser;if(!current)throw new Error('Login Firebase tidak tersedia.');const snap=await getDoc(doc(db,'users',current.uid));if(!snap.exists())throw new Error('Profil user tidak ditemukan.');const p=snap.data() as Record<string,unknown>;if(p.active!==true||!['owner','asisten'].includes(planText(p.role))||!['owner','asisten'].includes(appUser.role))throw new Error('Role tidak memiliki izin membuat Daily Plan.');return{db,username:planText(p.username)||appUser.username}}

export default function DailyPlanWebEntryPanel({user,selectedDate,onDateChange,onSaved,composerRequest,onComposerRequestHandled}:Props){
  const draftKey='plan_daily_web_draft_'+user.username
  const storedInitial=normalizeDraft(readPlanDraft<unknown>(draftKey,null))
  const initial={...storedInitial,date:selectedDate||storedInitial.date}
  const[monthly,setMonthly]=useState<Monthly[]>([]),[activityMonthly,setActivityMonthly]=useState<Monthly[]>([]),[daily,setDaily]=useState<Daily[]>([]),[paddocks,setPaddocks]=useState<MasterPaddock[]>([]),[activities,setActivities]=useState<MasterActivity[]>([])
  const[state,setState]=useState<DraftState>(initial),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[draggingId,setDraggingId]=useState(''),[persistedEdit,setPersistedEdit]=useState<PersistedEditContext|null>(null)
  const activityLookupRef=useRef(0),loadedActivityKeysRef=useRef(new Set<string>())
  const availableMonthly=useMemo(()=>{const map=new Map<string,Monthly>();[...monthly,...activityMonthly].forEach(row=>map.set(row.id,row));return[...map.values()].sort((a,b)=>a.monthKey.localeCompare(b.monthKey)||a.week.localeCompare(b.week,undefined,{numeric:true})||a.planLineId.localeCompare(b.planLineId,undefined,{numeric:true}))},[monthly,activityMonthly])

  async function loadMasters(){if(!firestoreDb)return;try{const[p,a]=await Promise.all([getDocs(collection(firestoreDb,'master_paddocks')),getDocs(collection(firestoreDb,'master_activities'))]);setPaddocks(p.docs.map(x=>{const r=x.data() as Record<string,unknown>;return{pid:planText(r.pid||x.id).toUpperCase(),companyCode:planText(r.companyCode).toUpperCase(),farm:planText(r.farm),stage:planText(r.currentStage||r.stage),variety:planText(r.variety)}}));setActivities(a.docs.map(x=>{const r=x.data() as Record<string,unknown>;return{id:x.id,description:planText(r.description),activity:planText(r.activity),componentsSnapshot:Array.isArray(r.components)?r.components:[]}}).filter(x=>x.activity||x.description))}catch(e){setMessage(e instanceof Error?e.message:'Master data gagal dimuat.')}}
  async function loadPeriod(date=state.date){
    if(!firestoreDb||!date)return
    setBusy(true)
    try{
      const{monthKey,startDate,nextStartDate}=monthBounds(date),monthlyCollection=collection(firestoreDb,'monthly_plans')
      const[byMonthKey,byStartDate,d]=await Promise.all([
        getDocs(fsQuery(monthlyCollection,where('monthKey','==',monthKey))),
        getDocs(fsQuery(monthlyCollection,where('startDate','>=',startDate),where('startDate','<',nextStartDate))),
        getDocs(fsQuery(collection(firestoreDb,'daily_plans'),where('monthKey','==',monthKey))),
      ])
      const mergedMonthly=new Map<string,(typeof byMonthKey.docs)[number]>()
      ;[...byMonthKey.docs,...byStartDate.docs].forEach(item=>mergedMonthly.set(item.id,item))
      const monthlyRows=[...mergedMonthly.values()].map(x=>{const r=x.data() as Record<string,unknown>;return{id:x.id,planLineId:planText(r.planLineId||x.id),monthKey:planText(r.monthKey),week:planText(r.week),companyCode:planText(r.companyCode),farm:planText(r.farm),pid:planText(r.pid),description:planText(r.description),activity:planText(r.activity),targetAreaHa:planNum(r.targetAreaHa),type:planText(r.type),activityCategory:planText(r.activityCategory),stage:planText(r.stage),masterVariety:planText(r.masterVariety),componentsSnapshot:Array.isArray(r.componentsSnapshot)?r.componentsSnapshot:[]}}).sort((a,b)=>a.week.localeCompare(b.week,undefined,{numeric:true})||a.planLineId.localeCompare(b.planLineId,undefined,{numeric:true}))
      setMonthly(monthlyRows)
      setDaily(d.docs.map(x=>{const r=x.data() as Record<string,unknown>;return{dailyPlanId:planText(r.dailyPlanId||x.id),monthlyPlanLineId:planText(r.monthlyPlanLineId),date:planText(r.date),shift:planText(r.shift),areaHa:planNum(r.areaHa)}}))
    }catch(e){setMessage(e instanceof Error?e.message:'Data periode Daily gagal dimuat.')}finally{setBusy(false)}
  }
  async function loadMonthlyActivity(activityName:string,force=false){
    if(!firestoreDb)return
    const label=activityName.trim(),key=searchKey(label)
    if(!key||(!force&&loadedActivityKeysRef.current.has(key)))return
    const token=++activityLookupRef.current
    try{
      const monthlyCollection=collection(firestoreDb,'monthly_plans')
      const[byDescription,byActivity]=await Promise.all([
        getDocs(fsQuery(monthlyCollection,where('description','==',label))),
        getDocs(fsQuery(monthlyCollection,where('activity','==',label))),
      ])
      if(token!==activityLookupRef.current)return
      const docs=new Map<string,(typeof byDescription.docs)[number]>()
      ;[...byDescription.docs,...byActivity.docs].forEach(item=>docs.set(item.id,item))
      const rows=[...docs.values()].map(x=>{const r=x.data() as Record<string,unknown>;return{id:x.id,planLineId:planText(r.planLineId||x.id),monthKey:planText(r.monthKey),week:planText(r.week),companyCode:planText(r.companyCode),farm:planText(r.farm),pid:planText(r.pid),description:planText(r.description),activity:planText(r.activity),targetAreaHa:planNum(r.targetAreaHa),type:planText(r.type),activityCategory:planText(r.activityCategory),stage:planText(r.stage),masterVariety:planText(r.masterVariety),componentsSnapshot:Array.isArray(r.componentsSnapshot)?r.componentsSnapshot:[]}}).sort((a,b)=>a.monthKey.localeCompare(b.monthKey)||a.week.localeCompare(b.week,undefined,{numeric:true})||a.planLineId.localeCompare(b.planLineId,undefined,{numeric:true}))
      setActivityMonthly(current=>{const merged=new Map<string,Monthly>();[...current,...rows].forEach(row=>merged.set(row.id,row));return[...merged.values()]})
      const ids=[...new Set(rows.map(row=>row.planLineId).filter(Boolean))],linked:Daily[]=[]
      for(let i=0;i<ids.length;i+=30){
        const part=ids.slice(i,i+30)
        const snap=await getDocs(fsQuery(collection(firestoreDb,'daily_plans'),where('monthlyPlanLineId','in',part)))
        snap.docs.forEach(x=>{const r=x.data() as Record<string,unknown>;linked.push({dailyPlanId:planText(r.dailyPlanId||x.id),monthlyPlanLineId:planText(r.monthlyPlanLineId),date:planText(r.date),shift:planText(r.shift),areaHa:planNum(r.areaHa)})})
      }
      if(token!==activityLookupRef.current)return
      if(linked.length)setDaily(current=>{const merged=new Map<string,Daily>();[...current,...linked].forEach(row=>merged.set(row.dailyPlanId,row));return[...merged.values()]})
      loadedActivityKeysRef.current.add(key)
    }catch(e){setMessage(e instanceof Error?e.message:'Monthly Plan lintas bulan gagal dimuat.')}
  }
  useEffect(()=>{void loadMasters()},[])
  useEffect(()=>{void loadPeriod(state.date);onDateChange?.(state.date)},[state.date])
  useEffect(()=>{if(selectedDate&&selectedDate!==state.date)setState(current=>({...current,date:selectedDate}))},[selectedDate])
  useEffect(()=>{if(state.active.sourceType!=='MONTHLY')return;const label=state.active.activitySearch.trim(),key=searchKey(label);if(!key)return;const exact=availableMonthly.some(row=>searchKey(activityLabel(row))===key)||activities.some(row=>searchKey(row.description)===key);if(exact)void loadMonthlyActivity(label)},[state.active.sourceType,state.active.activitySearch,availableMonthly,activities])
  useEffect(()=>{writePlanDraft(draftKey,state)},[state,draftKey])
  useEffect(()=>{
    if(!composerRequest)return
    const group=composerRequest.group
    if(group.sourceType==='MONTHLY'&&group.rows.some(row=>row.monthlyPlanLineId)&&!monthly.length)return
    const duplicate=composerRequest.mode==='duplicate-saved'
    const pids:PidDraft[]=group.rows.map(row=>{
      const monthlyRow=availableMonthly.find(item=>item.planLineId===row.monthlyPlanLineId)||null
      return{id:planRowId('pid'),search:monthlyRow?monthlyOptionLabel(monthlyRow):row.pid,monthlyId:monthlyRow?.id||'',pid:row.pid,area:String(row.areaHa),persistedDocId:duplicate?undefined:row.id,persistedDailyPlanId:duplicate?undefined:row.dailyPlanId}
    })
    const work=blankWork({id:duplicate?planRowId('daily'):group.workGroupId,sourceType:(['MONTHLY','ADHOC','SUPPORT'].includes(group.sourceType)?group.sourceType:'MONTHLY') as WorkDraft['sourceType'],shift:group.shift,foreman:group.foreman,activitySearch:group.description||group.activity,manpower:String(group.manpower),unitName:group.unitName,unitReady:String(group.unitReady),unitStandby:String(group.unitStandby),unitBreakdown:String(group.unitBreakdown),notes:group.notes,pids})
    setState(current=>({...current,date:group.date,active:work,editingId:''}))
    setPersistedEdit(duplicate?null:{groupKey:group.groupKey,workGroupId:group.workGroupId,planningOrder:group.planningOrder,originalRows:group.rows.map(row=>({id:row.id,dailyPlanId:row.dailyPlanId,monthlyPlanLineId:row.monthlyPlanLineId}))})
    onDateChange?.(group.date)
    onComposerRequestHandled?.()
    setMessage(duplicate?'Kegiatan tersimpan diduplikat ke form. Koreksi lalu Simpan ke Draft.':'Daily Plan dimuat ke form utama. Daily ID tetap dipertahankan saat disimpan.')
    requestAnimationFrame(()=>document.getElementById('daily-active-form')?.scrollIntoView({behavior:'smooth',block:'start'}))
  },[composerRequest,availableMonthly])

  function buildInfo(work:WorkDraft):WorkInfo{
    const groupActivity=work.activitySearch.trim(),manualActivity=activities.find(a=>[a.activity,a.description].some(v=>searchKey(v)===searchKey(groupActivity)))||null,activityReference=availableMonthly.find(row=>searchKey(activityLabel(row))===searchKey(groupActivity))||null
    const activityComponents=work.sourceType==='MONTHLY'?(activityReference?.componentsSnapshot||[]):(manualActivity?.componentsSnapshot||[]),activityDosePreview=materialLinesFromComponents(activityComponents,1)
    const pids=work.pids.map(pid=>{const choices=work.sourceType==='MONTHLY'?smartMonthlyChoices(availableMonthly,pid.search,groupActivity):[],selected=availableMonthly.find(x=>x.id===pid.monthlyId)||null,paddock=paddocks.find(p=>p.pid===pid.pid.toUpperCase())||null,area=planNum(pid.area),scheduled=selected?daily.filter(x=>x.monthlyPlanLineId===selected.planLineId).reduce((s,x)=>s+x.areaHa,0):0,remaining=selected?selected.targetAreaHa-scheduled:0,materials=materialLinesFromComponents(work.sourceType==='MONTHLY'?(selected?.componentsSnapshot||activityComponents):(manualActivity?.componentsSnapshot||[]),area);return{pid,choices,selected,paddock,area,scheduled,remaining,materials}})
    return{work,activityOptions:work.sourceType==='MONTHLY'?activityChoices(availableMonthly,groupActivity):activities.map(a=>a.activity||a.description).filter(Boolean),manualActivity,activityReference,activityDosePreview,pids,area:pids.reduce((s,x)=>s+x.area,0),materials:aggregateMaterials(pids.map(x=>x.materials))}
  }

  const activeInfo=useMemo(()=>buildInfo(state.active),[state.active,availableMonthly,daily,activities,paddocks])
  const draftInfos=useMemo(()=>state.works.map(buildInfo),[state.works,availableMonthly,daily,activities,paddocks])
  const totalMaterials=aggregateMaterials(draftInfos.flatMap(g=>g.pids.map(x=>x.materials)))
  const totals=useMemo(()=>draftInfos.reduce((acc,g)=>({groups:acc.groups+1,pids:acc.pids+g.pids.length,area:acc.area+g.area,manpower:acc.manpower+planNum(g.work.manpower),ready:acc.ready+planNum(g.work.unitReady),standby:acc.standby+planNum(g.work.unitStandby),breakdown:acc.breakdown+planNum(g.work.unitBreakdown)}),{groups:0,pids:0,area:0,manpower:0,ready:0,standby:0,breakdown:0}),[draftInfos])
  const shifts=useMemo(()=>[...new Set(draftInfos.map(g=>g.work.shift||'-'))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),[draftInfos])

  function patchActive(patch:Partial<WorkDraft>){setState(current=>({...current,active:{...current.active,...patch}}))}
  function patchActivePid(pidId:string,patch:Partial<PidDraft>){setState(current=>({...current,active:{...current.active,pids:current.active.pids.map(pid=>pid.id===pidId?{...pid,...patch}:pid)}}))}
  function addActivePid(){setState(current=>({...current,active:{...current.active,pids:[...current.active.pids,blankPid()]}}))}
  function removeActivePid(pidId:string){setState(current=>({...current,active:{...current.active,pids:current.active.pids.length>1?current.active.pids.filter(pid=>pid.id!==pidId):[blankPid()]}}))}
  function resetInput(preservePeople=true){setPersistedEdit(null);setState(current=>({...current,active:blankWork(preservePeople?{shift:current.active.shift,foreman:current.active.foreman}:undefined),editingId:''}))}
  function clearAll(){if(!window.confirm('Hapus semua input dan draft Daily Plan pada perangkat ini?'))return;clearPlanDraft(draftKey);setPersistedEdit(null);setState({date:new Date().toISOString().slice(0,10),active:blankWork(),works:[],editingId:''});setMessage('Input dan draft Daily Plan dikosongkan.')}

  function validateGroup(info:WorkInfo,checkExisting=false){
    if(!state.date)return'Tanggal Daily Plan wajib diisi.'
    if(!info.work.shift.trim()||!info.work.foreman.trim()||!info.work.activitySearch.trim())return'Shift, Mandor, dan Kegiatan wajib diisi.'
    const invalid=info.pids.find(p=>p.area<=0||(info.work.sourceType==='MONTHLY'&&!p.selected)||(info.work.sourceType!=='MONTHLY'&&!p.pid.pid.trim()))
    if(invalid)return invalid.area<=0?'Luas setiap PID harus lebih dari 0.':info.work.sourceType==='MONTHLY'?'Pilih PID/Monthly Plan yang valid.':'Paddock wajib diisi.'
    const mismatch=info.pids.some(p=>info.work.sourceType==='MONTHLY'&&p.selected&&searchKey(activityLabel(p.selected))!==searchKey(info.work.activitySearch))
    if(mismatch)return'Ada PID Monthly yang kegiatannya berbeda dari kegiatan pada form.'
    const keys=new Set<string>()
    for(const p of info.pids){const key=info.work.sourceType==='MONTHLY'?(p.selected?.planLineId||''):p.pid.pid.toUpperCase();if(key&&keys.has(key))return'Ada PID yang sama dipilih lebih dari sekali pada kegiatan ini.';keys.add(key)}
    if(checkExisting){const duplicate=info.pids.some(p=>info.work.sourceType==='MONTHLY'&&p.selected&&daily.some(d=>d.date===state.date&&d.shift===info.work.shift&&d.monthlyPlanLineId===p.selected?.planLineId));if(duplicate)return'Ada PID yang sudah memiliki Daily Plan pada tanggal/shift yang sama.'}
    return''
  }

  function saveToDraft(e:FormEvent){e.preventDefault();const error=validateGroup(activeInfo);if(error){setMessage(error);return}
    const over=activeInfo.pids.filter(p=>activeInfo.work.sourceType==='MONTHLY'&&p.selected&&p.area>p.remaining+0.0001)
    if(over.length&&!window.confirm(over.length+' PID melebihi sisa Monthly Plan. Tetap tambahkan ke draft?'))return
    setState(current=>{
      const saved=cloneWork(current.active,false)
      const nextWorks=current.editingId?current.works.map(work=>work.id===current.editingId?saved:work):[...current.works,saved]
      return{...current,works:nextWorks,active:blankWork({shift:current.active.shift,foreman:current.active.foreman}),editingId:''}
    })
    setMessage(state.editingId?'Draft kegiatan diperbarui.':'Kegiatan ditambahkan ke Draft Daily Planning. Silakan input kegiatan berikutnya.')
  }

  async function savePersistedEdit(e:FormEvent){
    e.preventDefault()
    if(!persistedEdit)return
    const error=validateGroup(activeInfo)
    if(error){setMessage(error);return}
    const retainedIds=new Set(activeInfo.pids.map(row=>row.pid.persistedDocId).filter(Boolean) as string[])
    const removed=persistedEdit.originalRows.filter(row=>!retainedIds.has(row.id))
    setBusy(true);setMessage('Menyimpan perubahan Daily Plan tersimpan…')
    try{
      const{db,username}=await writer(user)
      if(removed.length){
        const removedDailyIds=removed.map(row=>row.dailyPlanId).filter(Boolean)
        for(let i=0;i<removedDailyIds.length;i+=30){
          const linked=await getDocs(fsQuery(collection(db,'daily_reports'),where('dailyPlanId','in',removedDailyIds.slice(i,i+30))))
          if(!linked.empty){setMessage('PID tidak dapat dihapus karena sudah memiliki Actual Plan terkait. Edit atau hapus Actual terlebih dahulu.');setBusy(false);return}
        }
      }
      const targetSnap=await getDocs(fsQuery(collection(db,'daily_plans'),where('date','==',state.date))),prefix='DP-'+state.date.replaceAll('-','')+'-'
      let seq=targetSnap.docs.map(item=>{const data=item.data() as Record<string,unknown>,id=planText(data.dailyPlanId||item.id);return id.startsWith(prefix)?Number(id.slice(prefix.length)):0}).filter(Number.isFinite).reduce((m,x)=>Math.max(m,x),0)
      const batch=writeBatch(db),pidCount=activeInfo.pids.length
      for(const row of activeInfo.pids){
        const isMonthly=activeInfo.work.sourceType==='MONTHLY',selected=row.selected,paddock=row.paddock
        const dailyPlanId=row.pid.persistedDailyPlanId||prefix+String(++seq).padStart(4,'0'),docId=row.pid.persistedDocId||dailyPlanId
        const pid=isMonthly?(selected?.pid||row.pid.pid.toUpperCase()):row.pid.pid.toUpperCase()
        const activity=isMonthly?(selected?.activity||activeInfo.work.activitySearch):activeInfo.work.activitySearch.trim()
        const description=isMonthly?(selected?.description||activeInfo.work.activitySearch):activeInfo.work.activitySearch.trim()
        const components=isMonthly?(selected?.componentsSnapshot||[]):(activeInfo.manualActivity?.componentsSnapshot||[])
        const payload={dailyPlanId,workGroupId:persistedEdit.workGroupId,workGroupPidCount:pidCount,planningOrder:persistedEdit.planningOrder,sourcePlanIdRaw:isMonthly?(selected?.planLineId||''):'',sourceType:activeInfo.work.sourceType,monthlyLinkStatus:isMonthly?(selected?'LINKED':'NOT_FOUND'):'NOT_APPLICABLE',monthlyPlanLineId:isMonthly?(selected?.planLineId||''):'',date:state.date,year:Number(state.date.slice(0,4)),monthKey:state.date.slice(0,7),shift:activeInfo.work.shift,activity,description,paddockRaw:pid,pid,areaHa:row.area,areaUnit:'Ha',manpower:planNum(activeInfo.work.manpower),unitName:activeInfo.work.unitName,unitReady:planNum(activeInfo.work.unitReady),unitStandby:planNum(activeInfo.work.unitStandby),unitBreakdown:planNum(activeInfo.work.unitBreakdown),foreman:activeInfo.work.foreman,notes:activeInfo.work.notes,companyCode:isMonthly?(selected?.companyCode||''):(paddock?.companyCode||''),farm:isMonthly?(selected?.farm||''):(paddock?.farm||''),stage:isMonthly?(selected?.stage||''):(paddock?.stage||''),masterVariety:isMonthly?(selected?.masterVariety||''):(paddock?.variety||''),masterPending:!isMonthly&&!paddock,materials:row.materials,componentsSnapshot:components,type:isMonthly?(selected?.type||''):'',activityCategory:isMonthly?(selected?.activityCategory||''):'',sourceOrigin:'WEB',lastModifiedSource:'WEB',updatedAt:serverTimestamp(),updatedBy:username}
        if(row.pid.persistedDocId)batch.set(doc(db,'daily_plans',docId),payload,{merge:true})
        else batch.set(doc(db,'daily_plans',docId),{...payload,createdAt:serverTimestamp(),createdBy:username})
      }
      removed.forEach(row=>batch.delete(doc(db,'daily_plans',row.id)))
      await batch.commit()

      for(const row of activeInfo.pids){
        if(!row.pid.persistedDailyPlanId)continue
        const linked=await getDocs(fsQuery(collection(db,'daily_reports'),where('dailyPlanId','==',row.pid.persistedDailyPlanId)))
        if(linked.empty)continue
        const isMonthly=activeInfo.work.sourceType==='MONTHLY',selected=row.selected,pid=isMonthly?(selected?.pid||row.pid.pid.toUpperCase()):row.pid.pid.toUpperCase(),syncBatch=writeBatch(db)
        linked.docs.forEach(item=>{const data=item.data() as Record<string,unknown>,actualArea=planNum(data.actualAreaHa),reportPayload:Record<string,unknown>={monthlyPlanLineId:isMonthly?(selected?.planLineId||''):'',monthlyLinkStatus:isMonthly?(selected?'LINKED':'NOT_APPLICABLE'):'NOT_APPLICABLE',plannedDailyAreaHa:row.area,dailyVarianceHa:row.area-actualArea,lastModifiedSource:'WEB',updatedAt:serverTimestamp(),updatedBy:username,pid,paddockRaw:pid,activity:isMonthly?(selected?.activity||activeInfo.work.activitySearch):activeInfo.work.activitySearch};if(selected)Object.assign(reportPayload,{companyCode:selected.companyCode,farm:selected.farm});syncBatch.set(item.ref,reportPayload,{merge:true})})
        await syncBatch.commit()
      }
      const savedDate=state.date
      setPersistedEdit(null);setState(current=>({...current,active:blankWork({shift:current.active.shift,foreman:current.active.foreman}),editingId:''}))
      setMessage('Daily Plan tersimpan berhasil diperbarui. Daily ID existing tetap dipertahankan dan Actual terkait disinkronkan.')
      await loadPeriod(savedDate);onDateChange?.(savedDate);onSaved?.()
    }catch(err){setMessage(err instanceof Error?err.message:'Daily Plan tersimpan gagal diperbarui.')}finally{setBusy(false)}
  }

  function editDraft(work:WorkDraft){setState(current=>({...current,active:cloneWork(work,false),editingId:work.id}));setMessage('Draft dimuat ke form untuk diedit.');setTimeout(()=>document.getElementById('daily-active-form')?.scrollIntoView({behavior:'smooth',block:'start'}),0)}
  function deleteDraft(id:string){if(!window.confirm('Hapus kegiatan ini dari draft?'))return;setState(current=>({...current,works:current.works.filter(work=>work.id!==id),editingId:current.editingId===id?'':current.editingId,active:current.editingId===id?blankWork({shift:current.active.shift,foreman:current.active.foreman}):current.active}))}
  function duplicateDraft(work:WorkDraft){const copy=cloneWork(work,true);setState(current=>({...current,works:[...current.works,copy]}));setMessage('Draft kegiatan diduplikat.')}
  function moveDraft(id:string,direction:-1|1){
    setState(current=>{
      const source=current.works.find(work=>work.id===id);if(!source)return current
      const sameShift=current.works.filter(work=>work.shift===source.shift),localIndex=sameShift.findIndex(work=>work.id===id),target=sameShift[localIndex+direction]
      if(!target)return current
      const next=[...current.works],a=next.findIndex(work=>work.id===id),b=next.findIndex(work=>work.id===target.id);[next[a],next[b]]=[next[b],next[a]]
      return{...current,works:next}
    })
  }
  function dropDraft(targetId:string){
    if(!draggingId||draggingId===targetId){setDraggingId('');return}
    setState(current=>{
      const source=current.works.find(work=>work.id===draggingId),target=current.works.find(work=>work.id===targetId)
      if(!source||!target||source.shift!==target.shift)return current
      const next=current.works.filter(work=>work.id!==draggingId),targetIndex=next.findIndex(work=>work.id===targetId)
      next.splice(targetIndex,0,source)
      return{...current,works:next}
    })
    setDraggingId('')
  }
  function draftTransfers(infos:WorkInfo[]):DailyPlanTransfer[]{return infos.flatMap(group=>group.pids.map((row,index)=>{const selected=row.selected,isMonthly=group.work.sourceType==='MONTHLY',pid=isMonthly?(selected?.pid||''):row.pid.pid.toUpperCase(),activity=isMonthly?(selected?.activity||group.work.activitySearch):group.work.activitySearch;return{dailyPlanId:'draft-'+group.work.id+'-'+index,workGroupId:group.work.id,planningOrder:state.works.findIndex(work=>work.id===group.work.id)+1,date:state.date,shift:group.work.shift,sourceType:group.work.sourceType,monthlyPlanLineId:isMonthly?(selected?.planLineId||''):'',companyCode:isMonthly?(selected?.companyCode||''):(row.paddock?.companyCode||''),farm:isMonthly?(selected?.farm||''):(row.paddock?.farm||''),pid,activity,description:isMonthly?(selected?.description||group.work.activitySearch):group.work.activitySearch,areaHa:row.area,manpower:planNum(group.work.manpower),unitName:group.work.unitName,unitReady:planNum(group.work.unitReady),unitStandby:planNum(group.work.unitStandby),unitBreakdown:planNum(group.work.unitBreakdown),foreman:group.work.foreman,notes:group.work.notes,materials:row.materials}}))}
  async function copyWa(infos=draftInfos){if(!infos.length){setMessage('Belum ada draft untuk disalin ke WhatsApp.');return}const wa=dailyPlansToWhatsApp(draftTransfers(infos));try{await navigator.clipboard.writeText(wa);setMessage('Draft Daily Planning disalin ke clipboard. Tinggal paste ke WhatsApp.')}catch{window.prompt('Salin Daily Planning berikut:',wa)}}

  async function saveAll(){
    if(!draftInfos.length){setMessage('Belum ada Draft Daily Planning yang akan disimpan.');return}
    for(const info of draftInfos){const error=validateGroup(info);if(error){setMessage('Periksa draft '+(info.work.activitySearch||'-')+': '+error);return}}
    const allPidRows=draftInfos.flatMap(g=>g.pids.map(p=>({g,p}))),over=allPidRows.filter(({g,p})=>g.work.sourceType==='MONTHLY'&&p.selected&&p.area>p.remaining+0.0001)
    if(over.length&&!window.confirm(over.length+' PID melebihi sisa Monthly Plan. Tetap simpan?'))return
    const existing=allPidRows.filter(({g,p})=>g.work.sourceType==='MONTHLY'&&p.selected&&daily.some(d=>d.date===state.date&&d.shift===g.work.shift&&d.monthlyPlanLineId===p.selected?.planLineId))
    if(existing.length&&!window.confirm(existing.length+' PID sudah memiliki Daily Plan pada tanggal/shift yang sama. Tetap buat Daily Plan baru?'))return
    setBusy(true);setMessage('Menyimpan '+allPidRows.length+' Daily Plan dari '+draftInfos.length+' draft kegiatan…')
    try{
      const{db,username}=await writer(user),batch=writeBatch(db),prefix='DP-'+state.date.replaceAll('-','')+'-'
      let seq=daily.map(x=>x.dailyPlanId.startsWith(prefix)?Number(x.dailyPlanId.slice(prefix.length)):0).filter(Number.isFinite).reduce((m,x)=>Math.max(m,x),0)
      const created:Daily[]=[]
      for(const group of draftInfos){const isMonthly=group.work.sourceType==='MONTHLY';for(const row of group.pids){seq++;const selected=row.selected,dailyPlanId=prefix+String(seq).padStart(4,'0'),pid=isMonthly?(selected?.pid||''):row.pid.pid.toUpperCase(),paddock=row.paddock,activity=isMonthly?(selected?.activity||group.work.activitySearch):group.work.activitySearch.trim(),description=isMonthly?(selected?.description||group.work.activitySearch):group.work.activitySearch.trim(),components=isMonthly?(selected?.componentsSnapshot||[]):(group.manualActivity?.componentsSnapshot||[])
        batch.set(doc(db,'daily_plans',dailyPlanId),{dailyPlanId,workGroupId:group.work.id,workGroupPidCount:group.pids.length,planningOrder:state.works.findIndex(work=>work.id===group.work.id)+1,sourcePlanIdRaw:isMonthly?(selected?.planLineId||''):'',sourceType:group.work.sourceType,monthlyLinkStatus:isMonthly?'LINKED':'NOT_APPLICABLE',monthlyPlanLineId:isMonthly?(selected?.planLineId||''):'',date:state.date,year:Number(state.date.slice(0,4)),monthKey:state.date.slice(0,7),shift:group.work.shift,activity,description,paddockRaw:pid,pid,areaHa:row.area,areaUnit:'Ha',manpower:planNum(group.work.manpower),unitName:group.work.unitName,unitReady:planNum(group.work.unitReady),unitStandby:planNum(group.work.unitStandby),unitBreakdown:planNum(group.work.unitBreakdown),foreman:group.work.foreman,notes:group.work.notes,companyCode:isMonthly?(selected?.companyCode||''):(paddock?.companyCode||''),farm:isMonthly?(selected?.farm||''):(paddock?.farm||''),stage:isMonthly?(selected?.stage||''):(paddock?.stage||''),masterVariety:isMonthly?(selected?.masterVariety||''):(paddock?.variety||''),masterPending:!isMonthly&&!paddock,materials:row.materials,componentsSnapshot:components,type:isMonthly?(selected?.type||''):'',activityCategory:isMonthly?(selected?.activityCategory||''):'',sourceOrigin:'WEB',lastModifiedSource:'WEB',createdAt:serverTimestamp(),createdBy:username,updatedAt:serverTimestamp(),updatedBy:username})
        created.push({dailyPlanId,monthlyPlanLineId:isMonthly?(selected?.planLineId||''):'',date:state.date,shift:group.work.shift,areaHa:row.area})
      }}
      await batch.commit();setDaily(rows=>[...rows,...created]);clearPlanDraft(draftKey);setState(current=>({date:current.date,active:blankWork(),works:[],editingId:''}));setMessage(created.length+' Daily Plan berhasil disimpan. Draft lokal sudah dibersihkan.');onSaved?.()
    }catch(err){setMessage(err instanceof Error?err.message:'Gagal menyimpan Daily Plan.')}finally{setBusy(false)}
  }

  return <section className="plan-entry-screen daily-mobile-workspace">
    <div className="section-head daily-entry-head"><div><div className="eyebrow">DAILY PLAN</div><h2>Input Daily</h2><p className="muted">Tambah satu kegiatan lalu cek hasilnya di draft.</p></div><div className="row-actions"><button type="button" onClick={()=>void Promise.all([loadMasters(),loadPeriod(),loadMonthlyActivity(state.active.activitySearch,true)])} disabled={busy}>Refresh</button><button type="button" className="danger" onClick={clearAll} disabled={busy}>Hapus Semua</button></div></div>
    {message&&<div className="alert">{message}</div>}

    <form id="daily-active-form" onSubmit={persistedEdit?savePersistedEdit:saveToDraft} className="panel plan-section daily-single-form">
      <div className="daily-form-toolbar"><div><span className="eyebrow">{persistedEdit?'EDIT DAILY TERSIMPAN':state.editingId?'EDIT DRAFT':'INPUT PLANNING'}</span><h3>{persistedEdit?'Edit Daily Tersimpan':state.editingId?'Edit Kegiatan':'Tambah Kegiatan'}</h3></div><div className="daily-form-toolbar-actions"><span className="status-pill">{persistedEdit?'Daily ID tetap':'Draft otomatis'}</span>{(persistedEdit||state.editingId)&&<button type="button" onClick={()=>resetInput()}>Batal Edit</button>}</div></div>

      <section className="daily-form-group">
        <div className="daily-form-group-title"><span>01</span><div><strong>Jadwal & Kegiatan</strong><small>Informasi utama pekerjaan</small></div></div>
        <div className="plan-grid daily-schedule-grid">
          <label className="daily-date-field"><span>Tanggal</span><input type="date" value={state.date} onChange={e=>setState(current=>({...current,date:e.target.value}))}/></label>
          <label><span>Shift</span><input value={state.active.shift} onChange={e=>patchActive({shift:e.target.value})} placeholder="1 / 2 / 3"/></label>
          <label><span>Mandor / Foreman</span><input value={state.active.foreman} onChange={e=>patchActive({foreman:e.target.value})} placeholder="Nama mandor"/></label>
          <label><span>Sumber</span><select value={state.active.sourceType} disabled={!!persistedEdit} onChange={e=>patchActive({sourceType:e.target.value as WorkDraft['sourceType'],activitySearch:'',pids:[blankPid()]})}><option value="MONTHLY">MONTHLY</option><option value="ADHOC">ADHOC</option><option value="SUPPORT">SUPPORT</option></select></label>
          <label className="daily-activity-field"><span>Kegiatan</span><input list="daily-active-activities" value={state.active.activitySearch} onChange={e=>patchActive({activitySearch:e.target.value,pids:state.active.pids.map(pid=>({...pid,search:'',monthlyId:''}))})} placeholder="Ketik top dressing / pre"/><datalist id="daily-active-activities">{activeInfo.activityOptions.map(x=><option key={x} value={x}/>)}</datalist></label>
        </div>
      </section>

      <section className="daily-form-group">
        <div className="daily-form-group-title"><span>02</span><div><strong>Tenaga & Alat</strong><small>Resource bersama untuk seluruh PID</small></div></div>
        <div className="plan-grid daily-resource-grid">
          <label><span>Jumlah HK</span><input type="number" min="0" step="1" value={state.active.manpower} onChange={e=>patchActive({manpower:e.target.value})}/></label>
          <label className="daily-unit-field"><span>Kode / Nama Unit</span><input value={state.active.unitName} onChange={e=>patchActive({unitName:e.target.value})} placeholder="Contoh: Stool Splitter"/></label>
          <label className="daily-status-field ready"><span>Ready</span><input type="number" min="0" step="1" value={state.active.unitReady} onChange={e=>patchActive({unitReady:e.target.value})}/></label>
          <label className="daily-status-field breakdown"><span>Breakdown</span><input type="number" min="0" step="1" value={state.active.unitBreakdown} onChange={e=>patchActive({unitBreakdown:e.target.value})}/></label>
          <label className="daily-status-field standby"><span>Standby</span><input type="number" min="0" step="1" value={state.active.unitStandby} onChange={e=>patchActive({unitStandby:e.target.value})}/></label>
          <label className="plan-span-2 daily-notes-field"><span>Keterangan</span><input value={state.active.notes} onChange={e=>patchActive({notes:e.target.value})} placeholder="Opsional"/></label>
        </div>
      </section>

      <div className="daily-activity-material-preview"><div className="daily-material-preview-head"><div><span className="eyebrow">BAHAN & DOSIS ACUAN</span><strong>{state.active.activitySearch||'Pilih kegiatan terlebih dahulu'}</strong></div>{activeInfo.area>0&&<span className="status-pill">{planHa(activeInfo.area)} total PID</span>}</div>{activeInfo.activityDosePreview.length>0?<div className="daily-material-dose-list">{activeInfo.activityDosePreview.map(m=>{const total=activeInfo.materials.find(x=>x.material===m.material&&x.unit===m.unit)?.totalMaterial||0;return <div key={m.material+'|'+m.unit}><span><b>{m.material}</b><small>Dosis {m.dosePerHa.toLocaleString('id-ID',{maximumFractionDigits:4})} {m.unit}/Ha</small></span><strong>{activeInfo.area>0?('Total '+total.toLocaleString('id-ID',{maximumFractionDigits:4})+' '+m.unit):'Isi luas PID untuk total'}</strong></div>})}</div>:<div className="daily-material-empty">{state.active.activitySearch?'Belum ada bahan/dosis pada Master Activity atau Monthly Plan untuk kegiatan ini.':'Pilih kegiatan untuk melihat bahan dan dosis.'}</div>}</div>

      <div className="daily-pid-section"><div className="daily-pid-head"><div><strong>Multiple PID</strong><span>{state.active.sourceType==='MONTHLY'?'PID mengikuti kegiatan; Monthly ID dapat berasal dari bulan/week lain':'Masukkan paddock dan luas rencana'}</span></div><button type="button" onClick={addActivePid}>+ Tambah PID</button></div><div className="daily-pid-list">{activeInfo.pids.map((row,index)=><div className="daily-pid-row" key={row.pid.id}><span className="daily-pid-number">{index+1}</span>{state.active.sourceType==='MONTHLY'?<label className="daily-pid-search"><span>PID / Monthly Plan</span><input list={'monthly-active-options-'+row.pid.id} value={row.pid.search} onFocus={e=>e.currentTarget.select()} onChange={e=>{const value=e.target.value,matched=availableMonthly.find(month=>monthlyOptionLabel(month)===value||month.planLineId===value);patchActivePid(row.pid.id,{search:value,monthlyId:matched?.id||''})}} placeholder="Ketik G-007"/><datalist id={'monthly-active-options-'+row.pid.id}>{row.choices.map(x=><option key={x.id} value={monthlyOptionLabel(x)}/>)}</datalist><small className="plan-search-hint">{row.selected?'Terpilih: '+monthlyOptionLabel(row.selected):state.active.activitySearch?(row.pid.search?row.choices.length+' pilihan cocok':'Ketik kode paddock'):'Pilih kegiatan dahulu'}</small></label>:<label className="daily-pid-search"><span>Paddock</span><input list={'daily-active-paddocks-'+row.pid.id} value={row.pid.pid} onChange={e=>patchActivePid(row.pid.id,{pid:e.target.value.toUpperCase()})} placeholder="Contoh: JAGF-2-G-007"/><datalist id={'daily-active-paddocks-'+row.pid.id}>{paddocks.map(p=><option key={p.pid} value={p.pid}/>)}</datalist></label>}<label className="daily-pid-area"><span>Luas (Ha)</span><input type="number" min="0" step="0.0001" value={row.pid.area} onChange={e=>patchActivePid(row.pid.id,{area:e.target.value})}/></label><button type="button" className="danger daily-pid-remove" onClick={()=>removeActivePid(row.pid.id)}>Hapus</button>{(row.pid.persistedDailyPlanId||row.selected)&&<div className="daily-pid-meta">{row.pid.persistedDailyPlanId&&<span>Daily ID <b>{row.pid.persistedDailyPlanId}</b></span>}{row.selected&&<><span>Monthly ID <b>{row.selected.planLineId}</b></span><span>Target {planHa(row.selected.targetAreaHa)}</span><span>Terjadwal {planHa(row.scheduled)}</span><span>Sisa <b className={row.area>row.remaining?'plan-danger-text':''}>{planHa(row.remaining)}</b></span></>}</div>}</div>)}</div></div>

      <div className="daily-single-form-actions"><button type="submit" className="primary" disabled={busy}>{persistedEdit?'Simpan Perubahan Daily':state.editingId?'Simpan Perubahan Draft':'Simpan ke Draft'}</button><button type="button" onClick={()=>resetInput(false)}>{persistedEdit||state.editingId?'Batal Edit':'Reset Form'}</button></div>
    </form>

    <section className="panel plan-section daily-draft-board">
      <div className="plan-section-title"><div><span className="eyebrow">DRAFT DAILY PLANNING</span><h3>Periksa Hasil Plan</h3><p className="muted">Belum disimpan ke database. Susun urutan dengan drag card atau tombol Naik/Turun; urutan ini dipakai pada Copy WA.</p></div><div className="row-actions"><button type="button" onClick={()=>void copyWa()} disabled={!draftInfos.length}>Copy WA Semua</button><button type="button" className="primary" onClick={()=>void saveAll()} disabled={!draftInfos.length||busy}>{busy?'Menyimpan…':'Simpan Semua Daily Plan'}</button></div></div>
      {!draftInfos.length?<div className="daily-draft-empty">Belum ada draft. Isi form di atas lalu klik <strong>Simpan ke Draft</strong>.</div>:<>
        <div className="plan-summary-grid daily-draft-summary"><div><span>Kegiatan</span><strong>{totals.groups}</strong></div><div><span>Total PID</span><strong>{totals.pids}</strong></div><div><span>Total Luas</span><strong>{planHa(totals.area)}</strong></div><div><span>Total HK</span><strong>{totals.manpower}</strong></div><div><span>Ready / BD / SB</span><strong>{totals.ready} / {totals.breakdown} / {totals.standby}</strong></div></div>
        {totalMaterials.length>0&&<div className="plan-material-summary">{totalMaterials.map(m=><span key={m.material+'|'+m.unit}>{m.material}<strong>{m.totalMaterial.toLocaleString('id-ID',{maximumFractionDigits:4})} {m.unit}</strong></span>)}</div>}
        <div className="daily-draft-shifts">{shifts.map(shift=><section key={shift} className="daily-draft-shift"><div className="daily-draft-shift-title"><strong>SHIFT {shift}</strong><span>{draftInfos.filter(g=>g.work.shift===shift).length} kegiatan</span></div><div className="daily-draft-card-list">{draftInfos.filter(g=>g.work.shift===shift).map((group,index)=><article className={'daily-draft-card '+(draggingId===group.work.id?'is-dragging':'')} key={group.work.id} draggable onDragStart={()=>setDraggingId(group.work.id)} onDragEnd={()=>setDraggingId('')} onDragOver={e=>e.preventDefault()} onDrop={()=>dropDraft(group.work.id)}><div className="daily-draft-card-head"><div className="daily-draft-title-row"><span className="daily-drag-handle" title="Geser untuk mengubah urutan">☰</span><div><span className="eyebrow"># {index+1} · {group.work.sourceType}</span><h4>{group.work.activitySearch||'-'} <small>({planHa(group.area)})</small></h4></div></div><div className="daily-order-actions" aria-label="Aksi draft kegiatan"><button type="button" className="daily-icon-action" title="Naik" aria-label="Naik" onClick={()=>moveDraft(group.work.id,-1)} disabled={index===0}><DailyActionIcon name="up"/></button><button type="button" className="daily-icon-action" title="Turun" aria-label="Turun" onClick={()=>moveDraft(group.work.id,1)} disabled={index===draftInfos.filter(g=>g.work.shift===shift).length-1}><DailyActionIcon name="down"/></button><button type="button" className="daily-icon-action wa" title="Copy ke WhatsApp" aria-label="Copy ke WhatsApp" onClick={()=>void copyWa([group])}><DailyActionIcon name="wa"/></button><button type="button" className="daily-icon-action" title="Duplikat" aria-label="Duplikat" onClick={()=>duplicateDraft(group.work)}><DailyActionIcon name="copy"/></button><button type="button" className="daily-icon-action" title="Edit" aria-label="Edit" onClick={()=>editDraft(group.work)}><DailyActionIcon name="edit"/></button><button type="button" className="daily-icon-action danger" title="Hapus" aria-label="Hapus" onClick={()=>deleteDraft(group.work.id)}><DailyActionIcon name="trash"/></button></div></div><div className="daily-draft-pids">{group.pids.map(row=><span key={row.pid.id}>📍 {row.selected?.pid||row.pid.pid||'-'} <b>{planHa(row.area)}</b></span>)}</div><div className="daily-draft-details"><span>👷 Mandor <b>{group.work.foreman||'-'}</b></span><span>HK <b>{planNum(group.work.manpower)}</b></span><span>🚜 Alat <b>{group.work.unitName||'-'}</b></span><span>⚙️ 🟢{planNum(group.work.unitReady)} · 🔴{planNum(group.work.unitBreakdown)} · 🟡{planNum(group.work.unitStandby)}</span></div>{group.materials.length>0&&<div className="daily-draft-materials">{group.materials.map(m=><span key={m.material+'|'+m.unit}><b>{m.material}</b> · {m.dosePerHa} {m.unit}/Ha · Tot {m.totalMaterial.toLocaleString('id-ID',{maximumFractionDigits:4})} {m.unit}</span>)}</div>}{group.work.notes&&<div className="daily-draft-note">ℹ️ {group.work.notes}</div>}</article>)}</div></section>)}</div>
      </>}
    </section>
  </section>
}
