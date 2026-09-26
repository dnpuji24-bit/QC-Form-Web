import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { collection, doc, getDoc, getDocs, query as fsQuery, serverTimestamp, setDoc, where, writeBatch } from 'firebase/firestore'
import { firebaseAuth, firebaseAuthPersistenceReady, firestoreDb } from './firebase'
import DailyActionIcon from './DailyPlanActionIcon'
import { actualPlansToWhatsApp } from './actualPlanActions'
import type { ActualComposerRequest, SavedActualRow } from './actualPlanWorkspaceTypes'
import { aggregateMaterials, clearPlanDraft, materialLinesFromComponents, planHa, planNum, planRowId, planText, readPlanDraft, writePlanDraft, type PlanMaterialLine } from './planInputUtils'
import { findActivityResourceDefault, loadActivityResourceDefaults, type ActivityResourceDefault } from './masterActivityDefaults'
import type { User } from './types'

type Props={
  user:User
  prefillDailyPlanIds?:string[]
  selectedDate?:string
  onDateChange?:(date:string)=>void
  onSaved?:()=>void
  composerRequest?:ActualComposerRequest
  onComposerRequestHandled?:()=>void
}
type Daily={id:string;dailyPlanId:string;date:string;shift:string;monthlyPlanLineId:string;sourceType:string;companyCode:string;farm:string;pid:string;activity:string;description:string;areaHa:number;manpower:number;unitName:string;unitReady:number;unitStandby:number;unitBreakdown:number;foreman:string;notes:string;componentsSnapshot:unknown[];materials:PlanMaterialLine[]}
type ActualRef={id:string;actualReportId:string;dailyPlanId:string;date:string;actualAreaHa:number;planningOrder:number;workGroupId:string}
type WorkDraft={id:string;dailyId:string;dailySearch:string;area:string;manpower:string;unitName:string;unitReady:string;unitStandby:string;unitBreakdown:string;notes:string;persistedDocId?:string;persistedActualReportId?:string}
type DraftState={date:string;foreman:string;active:WorkDraft;works:WorkDraft[];editingId:string}
type WorkInfo={work:WorkDraft;selected:Daily|null;area:number;done:number;remaining:number;variance:number;materials:PlanMaterialLine[]}
type PersistedEditContext={id:string;actualReportId:string;planningOrder:number;workGroupId:string;originalArea:number}

function blankWork(patch:Partial<WorkDraft>={}):WorkDraft{return{id:planRowId('actual'),dailyId:'',dailySearch:'',area:'',manpower:'0',unitName:'',unitReady:'0',unitStandby:'0',unitBreakdown:'0',notes:'',...patch}}
function cloneWork(work:WorkDraft,newId=true):WorkDraft{return{...work,id:newId?planRowId('actual'):work.id,persistedDocId:undefined,persistedActualReportId:undefined}}
function materialsFromData(value:unknown):PlanMaterialLine[]{if(!Array.isArray(value))return[];return value.map(item=>{const x=(item&&typeof item==='object'?item:{}) as Record<string,unknown>;return{material:planText(x.material),dosePerHa:planNum(x.dosePerHa),doseUnit:planText(x.doseUnit),totalMaterial:planNum(x.totalMaterial),unit:planText(x.unit)}}).filter(x=>x.material)}
function normalizeWork(value:unknown):WorkDraft{const row=(value&&typeof value==='object'?value:{}) as Record<string,unknown>;return blankWork({id:planText(row.id)||planRowId('actual'),dailyId:planText(row.dailyId),dailySearch:planText(row.dailySearch),area:planText(row.area),manpower:planText(row.manpower||'0'),unitName:planText(row.unitName),unitReady:planText(row.unitReady||'0'),unitStandby:planText(row.unitStandby||'0'),unitBreakdown:planText(row.unitBreakdown||'0'),notes:planText(row.notes)})}
function normalizeDraft(raw:unknown):DraftState{
  const today=new Date().toISOString().slice(0,10)
  if(!raw||typeof raw!=='object')return{date:today,foreman:'',active:blankWork(),works:[],editingId:''}
  const row=raw as Record<string,unknown>,date=planText(row.date)||today,foreman=planText(row.foreman)
  if(row.active)return{date,foreman,active:normalizeWork(row.active),works:Array.isArray(row.works)?row.works.map(normalizeWork):[],editingId:planText(row.editingId)}
  const legacyWorks=Array.isArray(row.works)?row.works.map(normalizeWork):[]
  return{date,foreman,active:blankWork(),works:legacyWorks,editingId:''}
}
function dailyLabel(row:Daily){return row.dailyPlanId+' — Shift '+(row.shift||'-')+' — '+row.pid+' — '+row.activity}
async function writer(appUser:User){
  const db=firestoreDb,auth=firebaseAuth;if(!db||!auth)throw new Error('Firebase belum tersedia.')
  await firebaseAuthPersistenceReady
  if(typeof auth.authStateReady==='function')await auth.authStateReady()
  const current=auth.currentUser;if(!current)throw new Error('Sesi Firebase belum aktif di perangkat ini. Buka ulang halaman atau login ulang, lalu coba simpan Actual Plan.')
  const snap=await getDoc(doc(db,'users',current.uid));if(!snap.exists())throw new Error('Profil user tidak ditemukan.')
  const p=snap.data() as Record<string,unknown>;if(p.active!==true||!['owner','asisten'].includes(planText(p.role))||!['owner','asisten'].includes(appUser.role))throw new Error('Role tidak memiliki izin membuat Actual Plan.')
  return{db,username:planText(p.username)||appUser.username}
}

export default function ActualPlanWebEntryPanel({user,prefillDailyPlanIds=[],selectedDate,onDateChange,onSaved,composerRequest,onComposerRequestHandled}:Props){
  const draftKey='plan_actual_web_draft_'+user.username
  const storedInitial=normalizeDraft(readPlanDraft<unknown>(draftKey,null))
  const initial={...storedInitial,date:selectedDate||storedInitial.date}
  const[daily,setDaily]=useState<Daily[]>([]),[actuals,setActuals]=useState<ActualRef[]>([]),[activityDefaults,setActivityDefaults]=useState<ActivityResourceDefault[]>([])
  const[state,setState]=useState<DraftState>(initial),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[draggingId,setDraggingId]=useState(''),[persistedEdit,setPersistedEdit]=useState<PersistedEditContext|null>(null)
  const saveFeedbackRef=useRef<HTMLDivElement|null>(null),prefillHandledRef=useRef('')

  async function load(date=state.date){
    if(!firestoreDb||!date)return
    setBusy(true)
    try{
      const[d,a]=await Promise.all([
        getDocs(fsQuery(collection(firestoreDb,'daily_plans'),where('date','==',date))),
        getDocs(fsQuery(collection(firestoreDb,'daily_reports'),where('date','==',date))),
      ])
      setDaily(d.docs.map(x=>{const r=x.data() as Record<string,unknown>;return{id:x.id,dailyPlanId:planText(r.dailyPlanId||x.id),date:planText(r.date),shift:planText(r.shift),monthlyPlanLineId:planText(r.monthlyPlanLineId),sourceType:planText(r.sourceType),companyCode:planText(r.companyCode),farm:planText(r.farm),pid:planText(r.pid),activity:planText(r.activity),description:planText(r.description),areaHa:planNum(r.areaHa),manpower:planNum(r.manpower),unitName:planText(r.unitName),unitReady:planNum(r.unitReady),unitStandby:planNum(r.unitStandby),unitBreakdown:planNum(r.unitBreakdown),foreman:planText(r.foreman),notes:planText(r.notes),componentsSnapshot:Array.isArray(r.componentsSnapshot)?r.componentsSnapshot:[],materials:materialsFromData(r.materials)}}).sort((a,b)=>a.shift.localeCompare(b.shift,undefined,{numeric:true})||a.dailyPlanId.localeCompare(b.dailyPlanId,undefined,{numeric:true})))
      setActuals(a.docs.map(x=>{const r=x.data() as Record<string,unknown>;return{id:x.id,actualReportId:planText(r.actualReportId||x.id),dailyPlanId:planText(r.dailyPlanId),date:planText(r.date),actualAreaHa:planNum(r.actualAreaHa),planningOrder:planNum(r.planningOrder),workGroupId:planText(r.workGroupId)}}))
    }catch(e){setMessage(e instanceof Error?e.message:'Data Actual periode gagal dimuat.')}finally{setBusy(false)}
  }
  useEffect(()=>{void loadActivityResourceDefaults().then(setActivityDefaults).catch(()=>setActivityDefaults([]))},[])
  useEffect(()=>{if(!activityDefaults.length)return;setDaily(rows=>rows.map(row=>{const resource=findActivityResourceDefault(activityDefaults,row.activity,row.description);return{...row,shift:row.shift||resource?.defaultShift||'',unitName:row.unitName||resource?.defaultUnitName||'',foreman:row.foreman||resource?.defaultForeman||''}}))},[activityDefaults])
  useEffect(()=>{void load(state.date);onDateChange?.(state.date)},[state.date])
  useEffect(()=>{if(selectedDate&&selectedDate!==state.date)setState(current=>({...current,date:selectedDate}))},[selectedDate])
  useEffect(()=>{writePlanDraft(draftKey,state)},[state,draftKey])

  const actualByDaily=useMemo(()=>{const map=new Map<string,number>();actuals.forEach(row=>{if(row.dailyPlanId)map.set(row.dailyPlanId,(map.get(row.dailyPlanId)||0)+row.actualAreaHa)});return map},[actuals])
  const openDaily=useMemo(()=>daily.filter(row=>(actualByDaily.get(row.dailyPlanId)||0)<row.areaHa-0.0001),[daily,actualByDaily])

  function buildInfo(work:WorkDraft):WorkInfo{
    const selected=daily.find(x=>x.id===work.dailyId||x.dailyPlanId===work.dailyId)||null,area=planNum(work.area)
    const currentExisting=work.persistedActualReportId?actuals.find(x=>x.actualReportId===work.persistedActualReportId)?.actualAreaHa||0:0
    const done=selected?Math.max((actualByDaily.get(selected.dailyPlanId)||0)-currentExisting,0):0
    const remaining=selected?Math.max(selected.areaHa-done,0):0
    const variance=area-remaining
    const materials=selected?.componentsSnapshot.length?materialLinesFromComponents(selected.componentsSnapshot,area):(selected?.materials||[]).map(m=>({...m,totalMaterial:Number((m.dosePerHa*area).toFixed(4))}))
    return{work,selected,area,done,remaining,variance,materials}
  }
  const activeInfo=useMemo(()=>buildInfo(state.active),[state.active,daily,actualByDaily,actuals])
  const draftInfos=useMemo(()=>state.works.map(buildInfo),[state.works,daily,actualByDaily,actuals])
  const totalMaterials=aggregateMaterials(draftInfos.map(info=>info.materials))
  const totals=useMemo(()=>draftInfos.reduce((acc,x)=>({records:acc.records+1,area:acc.area+x.area,planned:acc.planned+(x.selected?.areaHa||0),manpower:acc.manpower+planNum(x.work.manpower),ready:acc.ready+planNum(x.work.unitReady),standby:acc.standby+planNum(x.work.unitStandby),breakdown:acc.breakdown+planNum(x.work.unitBreakdown)}),{records:0,area:0,planned:0,manpower:0,ready:0,standby:0,breakdown:0}),[draftInfos])
  const shifts=useMemo(()=>[...new Set(draftInfos.map(info=>info.selected?.shift||'-'))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),[draftInfos])
  const activeDailyChoices=useMemo(()=>{
    const q=state.active.dailySearch.trim().toLowerCase(),pool=persistedEdit?daily:openDaily
    return pool.filter(row=>!q||[row.dailyPlanId,row.monthlyPlanLineId,row.pid,row.activity,row.description,row.companyCode,row.farm].join(' ').toLowerCase().includes(q))
  },[state.active.dailySearch,daily,openDaily,persistedEdit])

  useEffect(()=>{
    const key=prefillDailyPlanIds.join('|')
    if(!key||prefillHandledRef.current===key||!daily.length)return
    const selected=daily.filter(row=>prefillDailyPlanIds.includes(row.dailyPlanId))
    if(!selected.length)return
    prefillHandledRef.current=key
    setState(current=>({...current,date:selected[0]?.date||current.date,foreman:selected[0]?.foreman||current.foreman,works:selected.map(row=>blankWork({dailyId:row.id,dailySearch:dailyLabel(row),area:String(row.areaHa),manpower:String(row.manpower||0),unitName:row.unitName||'',unitReady:String(row.unitReady||0),unitStandby:String(row.unitStandby||0),unitBreakdown:String(row.unitBreakdown||0),notes:row.notes||''}))}))
    setMessage(selected.length+' Daily Plan masuk ke Draft Actual. Periksa luas hasil lalu Simpan Semua Actual.')
  },[prefillDailyPlanIds.join('|'),daily.length])

  useEffect(()=>{
    if(!composerRequest)return
    const source=composerRequest.row,found=daily.find(row=>row.dailyPlanId===source.dailyPlanId),work=blankWork({
      dailyId:found?.id||source.dailyPlanId,dailySearch:found?dailyLabel(found):source.dailyPlanId,area:String(source.actualAreaHa),manpower:String(source.manpower||0),unitName:source.unitName||'',unitReady:String(source.unitReady||0),unitStandby:String(source.unitStandby||0),unitBreakdown:String(source.unitBreakdown||0),notes:source.notes||'',
      ...(composerRequest.mode==='edit-saved'?{persistedDocId:source.id,persistedActualReportId:source.actualReportId}:{})
    })
    setState(current=>({...current,date:source.date,foreman:source.foreman||current.foreman,active:work,editingId:''}))
    if(composerRequest.mode==='edit-saved')setPersistedEdit({id:source.id,actualReportId:source.actualReportId,planningOrder:source.planningOrder,workGroupId:source.workGroupId,originalArea:source.actualAreaHa})
    else setPersistedEdit(null)
    setMessage(composerRequest.mode==='edit-saved'?'Actual dimuat ke form utama. Actual ID tetap saat disimpan.':'Actual diduplikat ke form sebagai record baru.')
    onComposerRequestHandled?.()
    requestAnimationFrame(()=>document.getElementById('actual-active-form')?.scrollIntoView({behavior:'smooth',block:'start'}))
  },[composerRequest,daily])

  function showSaveFeedback(text:string){setMessage(text);requestAnimationFrame(()=>saveFeedbackRef.current?.scrollIntoView({behavior:'smooth',block:'nearest'}))}
  function patchActive(patch:Partial<WorkDraft>){setState(current=>({...current,active:{...current.active,...patch}}))}
  function chooseDailyValue(value:string){
    const pool=persistedEdit?daily:openDaily,found=pool.find(row=>dailyLabel(row)===value||row.dailyPlanId===value||row.id===value),masterDefault=found?findActivityResourceDefault(activityDefaults,found.activity,found.description):null
    patchActive({dailySearch:value,dailyId:found?.id||'',...(found?{area:state.active.area||String(Math.max(found.areaHa-(actualByDaily.get(found.dailyPlanId)||0),0)),manpower:state.active.manpower==='0'?String(found.manpower||0):state.active.manpower,unitName:state.active.unitName||found.unitName||masterDefault?.defaultUnitName||'',unitReady:state.active.unitReady==='0'?String(found.unitReady||0):state.active.unitReady,unitStandby:state.active.unitStandby==='0'?String(found.unitStandby||0):state.active.unitStandby,unitBreakdown:state.active.unitBreakdown==='0'?String(found.unitBreakdown||0):state.active.unitBreakdown}:{})})
    if(found&&!state.foreman)setState(current=>({...current,foreman:found.foreman||masterDefault?.defaultForeman||current.foreman}))
  }
  function resetInput(){setPersistedEdit(null);setState(current=>({...current,active:blankWork(),editingId:''}))}
  function clearAll(){if(!window.confirm('Hapus semua input dan Draft Actual pada perangkat ini?'))return;clearPlanDraft(draftKey);setPersistedEdit(null);setState({date:new Date().toISOString().slice(0,10),foreman:'',active:blankWork(),works:[],editingId:''});setMessage('Input dan Draft Actual dikosongkan.')}

  function validateInfo(info:WorkInfo){if(!info.selected)return'Pilih Daily Plan terlebih dahulu.';if(info.area<0)return'Luas Actual tidak boleh negatif.';return''}
  function saveToDraft(e:FormEvent){
    e.preventDefault();const error=validateInfo(activeInfo);if(error){setMessage(error);return}
    if(activeInfo.area>activeInfo.remaining+0.0001&&!window.confirm('Actual melebihi sisa Daily Plan. Tetap tambahkan ke draft?'))return
    setState(current=>{const saved=cloneWork(current.active,false),next=current.editingId?current.works.map(work=>work.id===current.editingId?saved:work):[...current.works,saved];return{...current,works:next,active:blankWork(),editingId:''}})
    setMessage(state.editingId?'Draft Actual diperbarui.':'Actual ditambahkan ke Draft. Anda dapat menambah PID/Daily Plan berikutnya.')
  }
  function editDraft(work:WorkDraft){setPersistedEdit(null);setState(current=>({...current,active:cloneWork(work,false),editingId:work.id}));setMessage('Draft Actual dimuat ke form untuk diedit.');requestAnimationFrame(()=>document.getElementById('actual-active-form')?.scrollIntoView({behavior:'smooth',block:'start'}))}
  function deleteDraft(id:string){if(!window.confirm('Hapus Actual ini dari draft?'))return;setState(current=>({...current,works:current.works.filter(work=>work.id!==id),editingId:current.editingId===id?'':current.editingId,active:current.editingId===id?blankWork():current.active}))}
  function duplicateDraft(work:WorkDraft){setState(current=>({...current,works:[...current.works,cloneWork(work,true)]}));setMessage('Draft Actual diduplikat.')}
  function moveDraft(id:string,direction:-1|1){setState(current=>{const index=current.works.findIndex(work=>work.id===id),target=index+direction;if(index<0||target<0||target>=current.works.length)return current;const next=[...current.works];[next[index],next[target]]=[next[target],next[index]];return{...current,works:next}})}
  function dropDraft(targetId:string){if(!draggingId||draggingId===targetId){setDraggingId('');return}setState(current=>{const source=current.works.find(work=>work.id===draggingId);if(!source)return current;const next=current.works.filter(work=>work.id!==draggingId),index=next.findIndex(work=>work.id===targetId);next.splice(index,0,source);return{...current,works:next}});setDraggingId('')}

  function draftTransfers(infos:WorkInfo[]):SavedActualRow[]{return infos.flatMap((info,index)=>{const selected=info.selected;if(!selected)return[];return[{id:'draft-'+info.work.id,actualReportId:'draft-'+info.work.id,workGroupId:info.work.id,planningOrder:state.works.findIndex(work=>work.id===info.work.id)+1,date:state.date,monthKey:state.date.slice(0,7),shift:selected.shift,sourceType:selected.sourceType,dailyLinkStatus:'LINKED',monthlyLinkStatus:selected.monthlyPlanLineId?'LINKED':'NOT_APPLICABLE',dailyPlanId:selected.dailyPlanId,monthlyPlanLineId:selected.monthlyPlanLineId,companyCode:selected.companyCode,farm:selected.farm,pid:selected.pid,activity:selected.activity,actualAreaHa:info.area,plannedDailyAreaHa:selected.areaHa,dailyVarianceHa:selected.areaHa-info.area,manpower:planNum(info.work.manpower),unitName:info.work.unitName,unitReady:planNum(info.work.unitReady),unitStandby:planNum(info.work.unitStandby),unitBreakdown:planNum(info.work.unitBreakdown),foreman:state.foreman,notes:info.work.notes,materials:info.materials}]})}
  async function copyWa(infos=draftInfos){if(!infos.length){setMessage('Belum ada Draft Actual untuk disalin ke WhatsApp.');return}const wa=actualPlansToWhatsApp(draftTransfers(infos));try{await navigator.clipboard.writeText(wa);setMessage('Draft Actual disalin ke clipboard. Tinggal paste ke WhatsApp.')}catch{window.prompt('Salin Actual berikut:',wa)}}

  async function savePersistedEdit(e:FormEvent){
    e.preventDefault();if(!persistedEdit)return
    const error=validateInfo(activeInfo);if(error){setMessage(error);return}
    if(activeInfo.area>activeInfo.remaining+0.0001&&!window.confirm('Actual melebihi sisa Daily Plan. Tetap simpan perubahan?'))return
    setBusy(true);showSaveFeedback('Menyimpan perubahan '+persistedEdit.actualReportId+'…')
    try{
      const{db,username}=await writer(user),selected=activeInfo.selected!,actualAreaHa=activeInfo.area
      await setDoc(doc(db,'daily_reports',persistedEdit.id),{actualReportId:persistedEdit.actualReportId,workGroupId:persistedEdit.workGroupId||persistedEdit.actualReportId,planningOrder:persistedEdit.planningOrder||1,dailySourcePlanIdRaw:selected.dailyPlanId,sourceType:selected.sourceType||'MONTHLY',dailyPlanId:selected.dailyPlanId,dailyLinkStatus:'LINKED',monthlyPlanLineId:selected.monthlyPlanLineId,monthlyLinkStatus:selected.monthlyPlanLineId?'LINKED':'NOT_APPLICABLE',date:state.date,year:Number(state.date.slice(0,4)),monthKey:state.date.slice(0,7),shift:selected.shift,activity:selected.activity,description:selected.description,paddockRaw:selected.pid,pid:selected.pid,actualAreaHa,areaUnit:'Ha',manpower:planNum(activeInfo.work.manpower),unitName:activeInfo.work.unitName,unitReady:planNum(activeInfo.work.unitReady),unitStandby:planNum(activeInfo.work.unitStandby),unitBreakdown:planNum(activeInfo.work.unitBreakdown),foreman:state.foreman,notes:activeInfo.work.notes,materials:activeInfo.materials,plannedDailyAreaHa:selected.areaHa,dailyVarianceHa:selected.areaHa-actualAreaHa,companyCode:selected.companyCode,farm:selected.farm,masterPending:false,sourceOrigin:'WEB',lastModifiedSource:'WEB',updatedAt:serverTimestamp(),updatedBy:username},{merge:true})
      const savedId=persistedEdit.actualReportId;setPersistedEdit(null);setState(current=>({...current,active:blankWork(),editingId:''}));showSaveFeedback('Actual '+savedId+' berhasil diperbarui. Actual ID tetap; PID mengikuti Daily Plan yang baru dipilih.')
      await load(state.date);onSaved?.()
    }catch(err){showSaveFeedback(err instanceof Error?err.message:'Actual gagal diperbarui.')}finally{setBusy(false)}
  }

  async function saveAll(){
    if(!draftInfos.length){showSaveFeedback('Belum ada Draft Actual yang akan disimpan. Klik Simpan ke Draft terlebih dahulu.');return}
    for(const info of draftInfos){const error=validateInfo(info);if(error){showSaveFeedback('Periksa draft '+(info.selected?.pid||'-')+': '+error);return}}
    const over=draftInfos.filter(info=>info.area>info.remaining+0.0001)
    if(over.length&&!window.confirm(over.length+' Actual melebihi sisa Daily Plan. Tetap simpan?'))return
    const keys=new Set<string>(),duplicates=draftInfos.filter(info=>{const key=info.selected?.dailyPlanId||'';if(!key)return false;if(keys.has(key))return true;keys.add(key);return false})
    if(duplicates.length&&!window.confirm('Ada Daily Plan yang dipilih lebih dari sekali dalam Draft Actual. Tetap simpan sebagai record terpisah?'))return
    setBusy(true);showSaveFeedback('Menyimpan '+draftInfos.length+' Actual dari Draft…')
    try{
      const{db,username}=await writer(user),existingSnap=await getDocs(fsQuery(collection(db,'daily_reports'),where('date','==',state.date))),prefix='AR-'+state.date.replaceAll('-','')+'-'
      let seq=existingSnap.docs.map(item=>{const r=item.data() as Record<string,unknown>,id=planText(r.actualReportId||item.id);return id.startsWith(prefix)?Number(id.slice(prefix.length)):0}).filter(Number.isFinite).reduce((m,x)=>Math.max(m,x),0)
      const batch=writeBatch(db),created:ActualRef[]=[]
      for(const info of draftInfos){
        const selected=info.selected!;seq++;const actualReportId=prefix+String(seq).padStart(4,'0'),planningOrder=state.works.findIndex(work=>work.id===info.work.id)+1
        batch.set(doc(db,'daily_reports',actualReportId),{actualReportId,workGroupId:info.work.id,planningOrder,dailySourcePlanIdRaw:selected.dailyPlanId,sourceType:selected.sourceType||'MONTHLY',dailyPlanId:selected.dailyPlanId,dailyLinkStatus:'LINKED',monthlyPlanLineId:selected.monthlyPlanLineId,monthlyLinkStatus:selected.monthlyPlanLineId?'LINKED':'NOT_APPLICABLE',date:state.date,year:Number(state.date.slice(0,4)),monthKey:state.date.slice(0,7),shift:selected.shift,activity:selected.activity,description:selected.description,paddockRaw:selected.pid,pid:selected.pid,actualAreaHa:info.area,areaUnit:'Ha',manpower:planNum(info.work.manpower),unitName:info.work.unitName,unitReady:planNum(info.work.unitReady),unitStandby:planNum(info.work.unitStandby),unitBreakdown:planNum(info.work.unitBreakdown),foreman:state.foreman,notes:info.work.notes,materials:info.materials,plannedDailyAreaHa:selected.areaHa,dailyVarianceHa:selected.areaHa-info.area,companyCode:selected.companyCode,farm:selected.farm,masterPending:false,sourceOrigin:'WEB',lastModifiedSource:'WEB',createdAt:serverTimestamp(),createdBy:username,updatedAt:serverTimestamp(),updatedBy:username})
        created.push({id:actualReportId,actualReportId,dailyPlanId:selected.dailyPlanId,date:state.date,actualAreaHa:info.area,planningOrder,workGroupId:info.work.id})
      }
      await batch.commit();setActuals(rows=>[...rows,...created]);clearPlanDraft(draftKey);setState(current=>({...current,active:blankWork(),works:[],editingId:''}));showSaveFeedback(created.length+' Actual berhasil disimpan. Draft lokal sudah dibersihkan.');onSaved?.()
    }catch(err){showSaveFeedback(err instanceof Error?err.message:'Gagal menyimpan Actual.')}finally{setBusy(false)}
  }

  return <section className="plan-entry-screen daily-mobile-workspace actual-plan-entry">
    <div className="section-head daily-entry-head"><div><div className="eyebrow">ACTUAL PLAN · BATCH INPUT</div><h2>Input Actual Plan</h2><p className="muted">Alur dibuat sama seperti Daily Plan: isi satu hasil → Simpan ke Draft → periksa card → Simpan Semua Actual.</p></div><div className="row-actions"><button type="button" onClick={()=>void load()} disabled={busy}>Refresh</button><button type="button" className="danger" onClick={clearAll} disabled={busy}>Reset Draft</button></div></div>
    {message&&<div className="alert">{message}</div>}

    <form id="actual-active-form" onSubmit={persistedEdit?savePersistedEdit:saveToDraft} className="panel plan-section daily-single-form actual-single-form">
      <div className="daily-form-toolbar"><div><span className="eyebrow">{persistedEdit?'EDIT ACTUAL TERSIMPAN':state.editingId?'EDIT DRAFT ACTUAL':'INPUT ACTUAL'}</span><h3>{persistedEdit?'Edit Actual Tersimpan':state.editingId?'Edit Hasil':'Tambah Hasil Pekerjaan'}</h3></div><div className="daily-form-toolbar-actions"><span className="status-pill">{persistedEdit?'Actual ID tetap':'Draft otomatis'}</span>{(persistedEdit||state.editingId)&&<button type="button" onClick={resetInput}>Batal Edit</button>}</div></div>

      <div className="daily-form-group"><div className="daily-form-group-title"><span>01</span><div><strong>Jadwal & Kegiatan</strong><small>Daily → Actual</small></div></div><div className="plan-grid daily-schedule-grid actual-schedule-grid">
        <label className="daily-date-field"><span>Tanggal Actual</span><input type="date" value={state.date} onChange={e=>setState(current=>({...current,date:e.target.value}))}/></label>
        <label><span>Mandor / Foreman</span><input value={state.foreman} onChange={e=>setState(current=>({...current,foreman:e.target.value}))} placeholder="Nama mandor"/></label>
        <label className="daily-activity-field"><span>Daily Plan / PID</span><input list="actual-active-daily-options" value={state.active.dailySearch} onFocus={e=>e.currentTarget.select()} onChange={e=>chooseDailyValue(e.target.value)} placeholder="Ketik PID / Daily ID / kegiatan"/><datalist id="actual-active-daily-options">{activeDailyChoices.map(row=><option key={row.id} value={dailyLabel(row)}/>)}</datalist><small className="plan-search-hint">{activeInfo.selected?'Terpilih: '+dailyLabel(activeInfo.selected):state.active.dailySearch?(activeDailyChoices.length?activeDailyChoices.length+' pilihan aktif':'0 pilihan aktif — Daily yang sudah selesai disembunyikan'):'Ketik PID / Daily ID'}</small></label>
        <label><span>Kegiatan</span><input value={activeInfo.selected?.activity||''} readOnly placeholder="Mengikuti Daily Plan"/></label>
      </div></div>

      <div className="daily-form-group"><div className="daily-form-group-title"><span>02</span><div><strong>Tenaga & Alat</strong><small>Resource untuk hasil pekerjaan ini</small></div></div><div className="plan-grid daily-resource-grid actual-resource-grid">
        <label><span>Jumlah HK</span><input type="number" min="0" step="1" value={state.active.manpower} onChange={e=>patchActive({manpower:e.target.value})}/></label>
        <label className="daily-unit-field"><span>Kode / Nama Unit</span><input value={state.active.unitName} onChange={e=>patchActive({unitName:e.target.value})} placeholder="Opsional"/></label>
        <label className="daily-status-field ready"><span>Unit Ready</span><input type="number" min="0" step="1" value={state.active.unitReady} onChange={e=>patchActive({unitReady:e.target.value})}/></label>
        <label className="daily-status-field breakdown"><span>Unit Breakdown</span><input type="number" min="0" step="1" value={state.active.unitBreakdown} onChange={e=>patchActive({unitBreakdown:e.target.value})}/></label>
        <label className="daily-status-field standby"><span>Unit Standby</span><input type="number" min="0" step="1" value={state.active.unitStandby} onChange={e=>patchActive({unitStandby:e.target.value})}/></label>
        <label className="plan-span-2 daily-notes-field"><span>Keterangan</span><input value={state.active.notes} onChange={e=>patchActive({notes:e.target.value})} placeholder="Opsional"/></label>
      </div></div>

      <div className="daily-activity-material-preview"><div className="daily-material-preview-head"><div><span className="eyebrow">BAHAN & DOSIS ACTUAL</span><strong>{activeInfo.selected?.activity||'Pilih Daily Plan terlebih dahulu'}</strong></div>{activeInfo.area>=0&&activeInfo.selected&&<span className="status-pill">{planHa(activeInfo.area)} actual</span>}</div>{activeInfo.materials.length?<div className="daily-material-dose-list">{activeInfo.materials.map(m=><div key={m.material+'|'+m.unit}><span><b>{m.material}</b><small>Dosis {m.dosePerHa.toLocaleString('id-ID',{maximumFractionDigits:4})} {m.unit}/Ha</small></span><strong>Total {m.totalMaterial.toLocaleString('id-ID',{maximumFractionDigits:4})} {m.unit}</strong></div>)}</div>:<div className="daily-material-empty">Pilih Daily Plan untuk melihat estimasi bahan berdasarkan luas actual.</div>}</div>

      <div className="daily-pid-section"><div className="daily-pid-head"><div><strong>Hasil PID</strong><span>Daily yang sudah mencapai actual penuh tidak ditampilkan untuk input baru.</span></div></div>
        <div className="daily-pid-list"><div className="daily-pid-row"><span className="daily-pid-number">1</span><div className="daily-pid-search"><span>PID / Daily Plan</span><strong>{activeInfo.selected?.pid||'-'}</strong>{activeInfo.selected&&<small>Daily {activeInfo.selected.dailyPlanId} · Monthly {activeInfo.selected.monthlyPlanLineId||'-'} · Plan {planHa(activeInfo.selected.areaHa)} · Sudah Actual {planHa(activeInfo.done)} · Sisa {planHa(activeInfo.remaining)}</small>}</div><label className="daily-pid-area"><span>Luas Actual (Ha)</span><input type="number" min="0" step="0.0001" value={state.active.area} onChange={e=>patchActive({area:e.target.value})}/></label></div></div>
      </div>

      <div className="daily-single-form-actions"><button type="submit" className="primary" disabled={busy}>{persistedEdit?'Simpan Perubahan Actual':state.editingId?'Simpan Perubahan Draft':'Simpan ke Draft'}</button><button type="button" onClick={resetInput}>{persistedEdit||state.editingId?'Batal Edit':'Clear Input'}</button></div>
    </form>

    <section className="panel plan-section daily-draft-board">
      <div className="plan-section-title"><div><span className="eyebrow">DRAFT ACTUAL</span><h3>Periksa Hasil Actual</h3><p className="muted">Belum disimpan ke database. Susun urutan, edit, duplikat, hapus, atau Copy WA sebelum simpan final.</p></div><div className="row-actions"><button type="button" onClick={()=>void copyWa()} disabled={!draftInfos.length}>Copy WA Semua</button><button type="button" className="primary" onClick={()=>void saveAll()} disabled={!draftInfos.length||busy}>{busy?'Menyimpan…':'Simpan Semua Actual'}</button></div></div>
      {message&&<div ref={saveFeedbackRef} className="alert daily-save-feedback" role="status" aria-live="polite">{message}</div>}
      {!draftInfos.length?<div className="daily-draft-empty">Belum ada Draft Actual. Isi form di atas lalu klik <strong>Simpan ke Draft</strong>.</div>:<>
        <div className="plan-summary-grid daily-draft-summary"><div><span>Record</span><strong>{totals.records}</strong></div><div><span>Plan Harian</span><strong>{planHa(totals.planned)}</strong></div><div><span>Actual</span><strong>{planHa(totals.area)}</strong></div><div><span>Total HK</span><strong>{totals.manpower}</strong></div><div><span>Ready / BD / SB</span><strong>{totals.ready} / {totals.breakdown} / {totals.standby}</strong></div></div>
        {totalMaterials.length>0&&<div className="plan-material-summary">{totalMaterials.map(m=><span key={m.material+'|'+m.unit}>{m.material}<strong>{m.totalMaterial.toLocaleString('id-ID',{maximumFractionDigits:4})} {m.unit}</strong></span>)}</div>}
        <div className="daily-draft-shifts">{shifts.map(shift=><section key={shift} className="daily-draft-shift"><div className="daily-draft-shift-title"><strong>SHIFT {shift}</strong><span>{draftInfos.filter(info=>(info.selected?.shift||'-')===shift).length} actual</span></div><div className="daily-draft-card-list">{draftInfos.filter(info=>(info.selected?.shift||'-')===shift).map((info,index)=>{const globalIndex=draftInfos.findIndex(x=>x.work.id===info.work.id);return <article className={'daily-draft-card '+(draggingId===info.work.id?'is-dragging':'')} key={info.work.id} draggable onDragStart={()=>setDraggingId(info.work.id)} onDragEnd={()=>setDraggingId('')} onDragOver={e=>e.preventDefault()} onDrop={()=>dropDraft(info.work.id)}><div className="daily-draft-card-head"><div className="daily-draft-title-row"><span className="daily-drag-handle" title="Geser untuk mengubah urutan">☰</span><div><span className="eyebrow"># {index+1} · ACTUAL</span><h4>{info.selected?.activity||'-'} <small>({planHa(info.area)})</small></h4></div></div><div className="daily-order-actions" aria-label="Aksi draft Actual"><button type="button" className="daily-icon-action" title="Naik" aria-label="Naik" onClick={()=>moveDraft(info.work.id,-1)} disabled={globalIndex===0}><DailyActionIcon name="up"/></button><button type="button" className="daily-icon-action" title="Turun" aria-label="Turun" onClick={()=>moveDraft(info.work.id,1)} disabled={globalIndex===draftInfos.length-1}><DailyActionIcon name="down"/></button><button type="button" className="daily-icon-action wa" title="Copy ke WhatsApp" aria-label="Copy ke WhatsApp" onClick={()=>void copyWa([info])}><DailyActionIcon name="wa"/></button><button type="button" className="daily-icon-action" title="Duplikat" aria-label="Duplikat" onClick={()=>duplicateDraft(info.work)}><DailyActionIcon name="copy"/></button><button type="button" className="daily-icon-action" title="Edit" aria-label="Edit" onClick={()=>editDraft(info.work)}><DailyActionIcon name="edit"/></button><button type="button" className="daily-icon-action danger" title="Hapus" aria-label="Hapus" onClick={()=>deleteDraft(info.work.id)}><DailyActionIcon name="trash"/></button></div></div><div className="daily-draft-pids"><span>📍 {info.selected?.pid||'-'} <b>{planHa(info.area)}</b></span></div><div className="daily-draft-details"><span>👷 Mandor <b>{state.foreman||'-'}</b></span><span>HK <b>{planNum(info.work.manpower)}</b></span><span>🚜 Alat <b>{info.work.unitName||'-'}</b></span><span>⚙️ 🟢{planNum(info.work.unitReady)} · 🔴{planNum(info.work.unitBreakdown)} · 🟡{planNum(info.work.unitStandby)}</span></div>{info.materials.length>0&&<div className="daily-draft-materials">{info.materials.map(m=><span key={m.material+'|'+m.unit}><b>{m.material}</b> · {m.dosePerHa} {m.unit}/Ha · Tot {m.totalMaterial.toLocaleString('id-ID',{maximumFractionDigits:4})} {m.unit}</span>)}</div>}{info.work.notes&&<div className="daily-draft-note">ℹ️ {info.work.notes}</div>}</article>})}</div></section>)}</div>
      </>}
    </section>
  </section>
}
