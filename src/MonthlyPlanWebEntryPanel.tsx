import { FormEvent, useEffect, useMemo, useState } from 'react'
import { collection, doc, getDoc, getDocs, query as fsQuery, runTransaction, serverTimestamp, where } from 'firebase/firestore'
import { firebaseAuth, firebaseAuthPersistenceReady, firestoreDb } from './firebase'
import { FALLBACK_COMPANIES, type CompanyRecord } from './companyMaster'
import { aggregateMaterials, clearPlanDraft, materialLinesFromComponents, planHa, planNum, planRowId, planText, readPlanDraft, writePlanDraft } from './planInputUtils'
import type { User } from './types'
import { canEditAccess } from './accessControl'
import YinYangRefreshButton from './YinYangRefreshButton'
import {ACTIVITY_COA_COLLECTION,parseCoaActivity,type CoaActivity} from './MasterActivityCatalogPanel'
import {findCatalogForValidation} from './activityCatalogModel'
import MonthlyActivitySmartSearch from './MonthlyActivitySmartSearch'
import {monthlyWorkIdentity,type MonthlyActivityChoice} from './monthlyActivitySearch'

type Props={user:User;selectedMonth?:string;selectedWeek?:string;onPeriodChange?:(month:string,week:string)=>void;onSaved?:()=>void}
type VarietyArea={variety:string;areaHa:number}
type Paddock={pid:string;companyCode:string;farm:string;variety:string;varietyBreakdown:VarietyArea[];stage:string;areaPaddockHa:number;plantAreaHa:number}
type Component={sequence:number;label:string;activeIngredient:string;dosePerHa:number;unit:string}
type Activity={id:string;activityCode:string;description:string;activity:string;coaCode:string;catalogActivityId:string;type:string;activityCategory:string;companyScope:string;active:boolean;components:Component[]}
type Existing={planLineId:string;monthKey:string;week:string;pid:string;activity:string;catalogActivityId:string;masterActivityId:string;plannedShift:string;plannedDate:string}
type LineDraft={id:string;pid:string;activityId:string;woNumber:string;plannedShift:string;plannedDate:string;target:string;notes:string;varieties?:string[]}
type Draft={month:string;week:string;company:string;farm:string;lines:LineDraft[]}

function pad(v:number){return String(v).padStart(2,'0')}
function companyFromData(id:string,d:Record<string,unknown>):CompanyRecord{return{id,code:planText(d.code||id).toUpperCase(),name:planText(d.name),prefixes:Array.isArray(d.prefixes)?d.prefixes.map(x=>planText(x).toUpperCase()).filter(Boolean):[],active:d.active!==false}}
function components(v:unknown):Component[]{if(!Array.isArray(v))return[];return v.map((x,i)=>{const d=(x&&typeof x==='object'?x:{}) as Record<string,unknown>;return{sequence:planNum(d.sequence)||i+1,label:planText(d.label)||'Bahan '+(i+1),activeIngredient:planText(d.activeIngredient),dosePerHa:planNum(d.dosePerHa),unit:planText(d.unit)}}).filter(x=>x.activeIngredient&&x.dosePerHa>0)}
function varietyBreakdownFromData(value:unknown):VarietyArea[]{if(!Array.isArray(value))return[];return value.map(item=>{const row=(item&&typeof item==='object'?item:{}) as Record<string,unknown>;return{variety:planText(row.variety),areaHa:planNum(row.areaHa)}}).filter(item=>item.variety&&item.areaHa>=0).sort((a,b)=>b.areaHa-a.areaHa||a.variety.localeCompare(b.variety,undefined,{numeric:true}))}
function plantAreaFromData(d:Record<string,unknown>){const explicit=planNum(d.varietyAreaTotalHa||d.plantAreaHa);if(explicit>0)return explicit;if(!Array.isArray(d.plantProgress))return 0;return d.plantProgress.reduce((sum,item)=>{const row=(item&&typeof item==='object'?item:{}) as Record<string,unknown>;return sum+planNum(row.areaHa||row.progressHa||row.area)},0)}
function planDocId(v:string){return encodeURIComponent(v.replaceAll('/','-')).slice(0,1400)}
function weekDates(monthKey:string,week:string){if(!/^\d{4}-\d{2}$/.test(monthKey))return{start:'',end:''};const[y,m]=monthKey.split('-').map(Number),last=new Date(y,m,0).getDate(),map:Record<string,[number,number]>={W1:[1,7],W2:[8,15],W3:[16,22],W4:[23,last]},range=map[week]||[1,last];return{start:monthKey+'-'+pad(range[0]),end:monthKey+'-'+pad(range[1])}}
function blankLine():LineDraft{return{id:planRowId('monthly'),pid:'',activityId:'',woNumber:'',plannedShift:'1',plannedDate:'',target:'',notes:'',varieties:[]}}
function normalizedWo(value:string){return value.trim().toUpperCase()}
function woDocId(value:string){return encodeURIComponent(normalizedWo(value))}
async function writer(appUser:User){const db=firestoreDb,auth=firebaseAuth;if(!db||!auth)throw new Error('Firebase belum tersedia.');await firebaseAuthPersistenceReady;if(typeof auth.authStateReady==='function')await auth.authStateReady();const current=auth.currentUser;if(!current)throw new Error('Sesi Firebase belum siap. Tunggu sebentar atau login ulang lalu coba lagi.');const snap=await getDoc(doc(db,'users',current.uid));if(!snap.exists())throw new Error('Profil user tidak ditemukan.');const p=snap.data() as Record<string,unknown>;if(p.active!==true||!canEditAccess(appUser,'data_plan_monthly'))throw new Error('Hak akses Edit Monthly Plan belum diberikan.');return{db,username:planText(p.username)||appUser.username}}

export default function MonthlyPlanWebEntryPanel({user,selectedMonth,selectedWeek,onPeriodChange,onSaved}:Props){
  const draftKey='plan_monthly_web_draft_'+user.username
  const storedInitial=readPlanDraft<Draft>(draftKey,{month:new Date().toISOString().slice(0,7),week:'W1',company:'GPA',farm:'',lines:[blankLine()]})
  const initial={...storedInitial,month:selectedMonth||storedInitial.month,week:selectedWeek||storedInitial.week}
  const[companies,setCompanies]=useState<CompanyRecord[]>([]),[paddocks,setPaddocks]=useState<Paddock[]>([]),[activities,setActivities]=useState<Activity[]>([]),[coaCatalog,setCoaCatalog]=useState<CoaActivity[]>([]),[existing,setExisting]=useState<Existing[]>([])
  const[draft,setDraft]=useState<Draft>(()=>({...initial,lines:initial.lines?.length?initial.lines:[blankLine()]})),[busy,setBusy]=useState(false),[message,setMessage]=useState('')

  async function loadMasters(){if(!firestoreDb)return;setBusy(true);try{const[c,p,a,coaSnap]=await Promise.all([getDocs(collection(firestoreDb,'master_companies')),getDocs(collection(firestoreDb,'master_paddocks')),getDocs(collection(firestoreDb,'master_activities')),getDocs(collection(firestoreDb,ACTIVITY_COA_COLLECTION))]);setCoaCatalog(coaSnap.docs.map(x=>parseCoaActivity(x.id,x.data() as Record<string,unknown>)));setCompanies(c.empty?FALLBACK_COMPANIES:c.docs.map(x=>companyFromData(x.id,x.data() as Record<string,unknown>)).filter(x=>x.active));setPaddocks(p.docs.map(x=>{const d=x.data() as Record<string,unknown>,varietyBreakdown=varietyBreakdownFromData(d.varietyBreakdown);return{pid:planText(d.pid||x.id).toUpperCase(),companyCode:planText(d.companyCode).toUpperCase(),farm:planText(d.farm),variety:planText(d.variety),varietyBreakdown,stage:planText(d.currentStage||d.stage),areaPaddockHa:planNum(d.areaPlantedHa||d.areaPaddockHa),plantAreaHa:plantAreaFromData(d)}}));setActivities(a.docs.map(x=>{const d=x.data() as Record<string,unknown>;return{id:x.id,activityCode:planText(d.activityCode),description:planText(d.description),activity:planText(d.activity),coaCode:planText(d.coaCode),catalogActivityId:planText(d.catalogActivityId),type:planText(d.type),activityCategory:planText(d.activityCategory),companyScope:planText(d.companyScope||'GLOBAL').toUpperCase(),active:d.active===true,components:components(d.components)}}))}catch(e){setMessage(e instanceof Error?e.message:'Master data gagal dimuat.')}finally{setBusy(false)}}
  async function loadPeriod(month=draft.month){if(!firestoreDb||!month)return;try{const m=await getDocs(fsQuery(collection(firestoreDb,'monthly_plans'),where('monthKey','==',month)));setExisting(m.docs.map(x=>{const d=x.data() as Record<string,unknown>;return{planLineId:planText(d.planLineId||x.id),monthKey:planText(d.monthKey),week:planText(d.week),pid:planText(d.pid).toUpperCase(),activity:planText(d.activity),catalogActivityId:planText(d.catalogActivityId),masterActivityId:planText(d.masterActivityId),plannedShift:planText(d.plannedShift),plannedDate:planText(d.plannedDate)}}))}catch(e){setMessage(e instanceof Error?e.message:'Monthly periode gagal dimuat.')}}
  useEffect(()=>{void loadMasters()},[])
  useEffect(()=>{void loadPeriod(draft.month);onPeriodChange?.(draft.month,draft.week)},[draft.month,draft.week])
  useEffect(()=>{if((selectedMonth&&selectedMonth!==draft.month)||(selectedWeek&&selectedWeek!==draft.week))setDraft(current=>({...current,month:selectedMonth||current.month,week:selectedWeek||current.week}))},[selectedMonth,selectedWeek])
  useEffect(()=>{writePlanDraft(draftKey,draft)},[draft,draftKey])

  const farms=useMemo(()=>[...new Set(paddocks.filter(x=>!draft.company||x.companyCode===draft.company).map(x=>x.farm).filter(Boolean))].sort(),[paddocks,draft.company])
  const pidOptions=useMemo(()=>paddocks.filter(x=>(!draft.company||x.companyCode===draft.company)&&(!draft.farm||x.farm===draft.farm)).sort((a,b)=>a.pid.localeCompare(b.pid,undefined,{numeric:true})),[paddocks,draft.company,draft.farm])
  const activityOptions=useMemo(()=>activities.filter(x=>x.active&&(x.companyScope==='GLOBAL'||x.companyScope===draft.company)).sort((a,b)=>a.description.localeCompare(b.description)),[activities,draft.company])
  const activityChoices=useMemo<MonthlyActivityChoice[]>(()=>activityOptions.map(item=>{
    const mapped=findCatalogForValidation(coaCatalog,{
      catalogActivityId:item.catalogActivityId,activity:item.activity,coaCode:item.coaCode
    })
    return {id:item.id,description:item.description,activity:item.activity,activityCode:item.activityCode,
      coaCode:mapped?.coaCode||'',operationCode:mapped?.operationCode||'',
      department:mapped?.department||'',activityCategory:item.activityCategory}
  }),[activityOptions,coaCatalog])
  const lineInfo=useMemo(()=>draft.lines.map(line=>{const paddock=paddocks.find(x=>x.pid===line.pid.toUpperCase())||null,activity=activityOptions.find(x=>x.id===line.activityId)||null,target=planNum(line.target),materials=materialLinesFromComponents(activity?.components||[],target),varietyOptions=paddock?(paddock.varietyBreakdown.length?paddock.varietyBreakdown:(paddock.variety?[{variety:paddock.variety,areaHa:paddock.plantAreaHa}]:[])):[],requested=(line.varieties||[]).filter(name=>varietyOptions.some(option=>option.variety===name)),selectedVarieties=requested.length?requested:(varietyOptions.length===1?[varietyOptions[0].variety]:[]),selectedVarietyDetails=varietyOptions.filter(option=>selectedVarieties.includes(option.variety)),selectedPlantArea=selectedVarietyDetails.reduce((sum,item)=>sum+item.areaHa,0);const mapped=activity?findCatalogForValidation(coaCatalog,{catalogActivityId:activity.catalogActivityId,activity:activity.activity,coaCode:activity.coaCode}):undefined;return{line,paddock,activity,coaCode:mapped?.coaCode||'',catalogActivityId:mapped?.id||activity?.catalogActivityId||'',operationCode:mapped?.operationCode||'',department:mapped?.department||'',target,materials,varietyOptions,selectedVarieties,selectedVarietyDetails,selectedPlantArea}}),[draft.lines,paddocks,activityOptions,coaCatalog])
  const dates=weekDates(draft.month,draft.week)
  const totalArea=lineInfo.reduce((s,x)=>s+x.target,0)
  const totalMaterials=aggregateMaterials(lineInfo.map(x=>x.materials))

  function patchDraft(patch:Partial<Draft>){setDraft(current=>({...current,...patch}))}
  function patchLine(id:string,patch:Partial<LineDraft>){setDraft(current=>({...current,lines:current.lines.map(line=>line.id===id?{...line,...patch}:line)}))}
  function addLine(copy?:LineDraft){setDraft(current=>({...current,lines:[...current.lines,{...(copy||blankLine()),id:planRowId('monthly'),woNumber:copy?.woNumber||'',target:'',notes:'',varieties:[...(copy?.varieties||[])]}]}))}
  function toggleVariety(id:string,variety:string,all:string[]){setDraft(current=>({...current,lines:current.lines.map(line=>{if(line.id!==id)return line;const selected=line.varieties||[],next=selected.includes(variety)?selected.filter(x=>x!==variety):[...selected,variety];return{...line,varieties:next.filter(x=>all.includes(x))}})}))}
  function selectAllVarieties(id:string,all:string[]){setDraft(current=>({...current,lines:current.lines.map(line=>line.id===id?{...line,varieties:[...all]}:line)}))}
  function clearVarieties(id:string){setDraft(current=>({...current,lines:current.lines.map(line=>line.id===id?{...line,varieties:[]}:line)}))}
  function removeLine(id:string){setDraft(current=>({...current,lines:current.lines.length>1?current.lines.filter(line=>line.id!==id):[blankLine()]}))}
  function reset(){if(!window.confirm('Kosongkan draft input Monthly Plan ini?'))return;clearPlanDraft(draftKey);setDraft({month:new Date().toISOString().slice(0,7),week:'W1',company:draft.company||'GPA',farm:'',lines:[blankLine()]});setMessage('Draft Monthly Plan dikosongkan.')}

  function duplicateKeys(){
    const seen:Array<{identity:string;shift:string}>=[]
    const dupes:{label:string;index:number}[]=[]
    lineInfo.forEach((info,index)=>{
      if(!info.line.pid||!info.activity)return
      // Same WO may occur on many lines. Only reject indistinguishable work
      // rows; ALL overlaps either individual shift on the same date.
      const identity=monthlyWorkIdentity({pid:info.line.pid,masterActivityId:info.activity.id,
        catalogActivityId:info.catalogActivityId,plannedShift:'ALL',
        plannedDate:info.line.plannedDate||'',varieties:info.selectedVarieties})
      const shift=info.line.plannedShift||'1'
      if(seen.some(x=>x.identity===identity&&(x.shift===shift||x.shift==='ALL'||shift==='ALL')))
        dupes.push({label:info.line.pid+' · '+info.activity.description+' · '+
          (info.line.plannedDate||'tanpa tanggal')+' · '+(shift==='ALL'?'Semua Shift':'Shift '+shift),index})
      else seen.push({identity,shift})
    })
    return dupes
  }
  function focusLine(index:number){requestAnimationFrame(()=>document.getElementById('monthly-work-'+index)?.scrollIntoView({behavior:'smooth',block:'center'}))}

  async function save(e:FormEvent){
    e.preventDefault()
    if(!draft.month||!draft.week||!draft.company){setMessage('BELUM TERSIMPAN · Bulan, Week, dan Company wajib diisi.');return}
    const invalidIndex=lineInfo.findIndex(x=>(Boolean(x.line.plannedDate)&&(x.line.plannedDate<dates.start||x.line.plannedDate>dates.end))||!x.paddock||!x.activity||!/^\d{1,20}$/.test(x.coaCode)||!normalizedWo(x.line.woNumber||'')||!['1','2','ALL'].includes(x.line.plannedShift||'1')||x.target<=0||(x.varietyOptions.length>0&&x.selectedVarieties.length===0))
    if(invalidIndex>=0){
      const x=lineInfo[invalidIndex]
      const reason=!x.paddock?'Paddock tidak valid.':!x.activity?'Activity tidak ACTIVE.':!x.coaCode?'CoA belum diatur pada Master Activity.':!x.line.woNumber?'Nomor WO wajib diisi.':x.target<=0?'Target harus lebih dari 0 Ha.':x.line.plannedDate&&(x.line.plannedDate<dates.start||x.line.plannedDate>dates.end)?'Tanggal Rencana harus berada dalam periode '+dates.start+' s.d. '+dates.end+'.':'Periksa Shift Rencana dan varietas.'
      setMessage('BELUM TERSIMPAN · Pekerjaan '+(invalidIndex+1)+': '+reason);focusLine(invalidIndex);return
    }
    const badWo=lineInfo.findIndex(x=>!(/^[A-Z0-9][A-Z0-9._/-]{0,79}$/.test(normalizedWo(x.line.woNumber))))
    if(badWo>=0){setMessage('BELUM TERSIMPAN · Format WO '+(badWo+1)+' tidak valid. Gunakan huruf, angka, /, -, _ atau titik; maksimum 80 karakter.');focusLine(badWo);return}
    const dupes=duplicateKeys();if(dupes.length){setMessage('BELUM TERSIMPAN · Baris pekerjaan identik (PID, Activity, Tanggal, Shift, varietas): '+dupes.map(x=>x.label).join(', '));return}
    const duplicates=lineInfo.filter(x=>existing.some(row=>{
      if(row.monthKey!==draft.month||row.week!==draft.week||row.pid!==x.line.pid.toUpperCase())return false
      // Distinct scheduled dates do not collide; ALL overlaps Shift 1 and 2.
      if(row.plannedDate&&x.line.plannedDate&&row.plannedDate!==x.line.plannedDate)return false
      if(!row.plannedShift)return false
      if(row.plannedShift!==(x.line.plannedShift||'1')&&row.plannedShift!=='ALL'&&x.line.plannedShift!=='ALL')return false
      return row.catalogActivityId&&x.catalogActivityId
        ?row.catalogActivityId===x.catalogActivityId
        :row.masterActivityId&&x.activity
          ?row.masterActivityId===x.activity.id
          :row.activity===x.activity?.activity
    }))
    if(duplicates.length&&!window.confirm(duplicates.length+' baris pekerjaan serupa sudah ada dalam periode ini. Tetap simpan? Pastikan target luas tidak dihitung dua kali.'))return
    setBusy(true);setMessage('Memeriksa WO dan menyimpan setiap baris Monthly Plan…')
    try{
      const {db,username}=await writer(user)
      const [year,monthNumber]=draft.month.split('-').map(Number)
      const prefix='MP-'+draft.company+'-'+draft.month.replace('-','')+'-'
      let seq=existing.map(x=>x.planLineId.startsWith(prefix)?Number(x.planLineId.slice(prefix.length)):0).filter(Number.isFinite).reduce((max,n)=>Math.max(max,n),0)
      const prepared=lineInfo.map(info=>{
        seq++
        return {info,planLineId:prefix+String(seq).padStart(4,'0'),woNumber:normalizedWo(info.line.woNumber)}
      })
      await runTransaction(db,async transaction=>{
        // A WO is a shared header. Every Monthly Plan row still has a distinct
        // Plan ID and remains independently selectable in Daily/Actual/QC.
        const uniqueWos=[...new Set(prepared.map(item=>item.woNumber))]
        const woRefs=uniqueWos.map(wo=>doc(db,'work_orders',woDocId(wo)))
        const monthlyRefs=prepared.map(item=>doc(db,'monthly_plans',planDocId(item.planLineId)))
        const woSnaps=await Promise.all(woRefs.map(item=>transaction.get(item)))
        const monthlySnaps=await Promise.all(monthlyRefs.map(item=>transaction.get(item)))
        for(let index=0;index<woSnaps.length;index++){
          const found=woSnaps[index]
          if(found.exists()&&planText(found.data().companyCode)&&planText(found.data().companyCode).toUpperCase()!==draft.company)
            throw new Error('WO '+uniqueWos[index]+' sudah digunakan oleh Company lain.')
        }
        if(monthlySnaps.some(x=>x.exists()))throw new Error('Nomor MP berubah karena input pengguna lain. Refresh data Monthly lalu coba ulang.')
        prepared.forEach(({info,planLineId,woNumber},index)=>{
          const p=info.paddock!,a=info.activity!,plannedShift=info.line.plannedShift||'1',plannedDate=info.line.plannedDate||''
          transaction.set(monthlyRefs[index],{
            planLineId,year,monthNumber,monthKey:draft.month,monthLabel:new Date(year,monthNumber-1,1).toLocaleString('id-ID',{month:'short'}),
            inputDate:new Date().toISOString().slice(0,10),startDate:dates.start,endDate:dates.end,week:draft.week,plannedDate,
            description:a.description,pid:p.pid,targetAreaHa:info.target,variety:info.selectedVarieties.join(', ')||p.variety,
            selectedVarieties:info.selectedVarieties,selectedVarietyDetails:info.selectedVarietyDetails,
            sourceStatus:'Belum dikerjakan',status:'PLANNED',actualAreaHa:0,balanceHa:info.target,calculatedBalanceHa:info.target,
            activity:a.activity,notes:info.line.notes,companyCode:draft.company,farm:p.farm||draft.farm,stage:p.stage,
            areaPaddockHa:p.areaPaddockHa,plantAreaHa:p.plantAreaHa,selectedPlantAreaHa:info.selectedPlantArea,
            masterVariety:p.variety,masterVarietyBreakdown:p.varietyBreakdown,masterActivityId:a.id,activityCode:a.activityCode,
            coaCode:info.coaCode,catalogActivityId:info.catalogActivityId,operationCode:info.operationCode,department:info.department,woNumber,plannedShift,
            type:a.type,activityCategory:a.activityCategory,componentsSnapshot:a.components,materialsPreview:info.materials,
            sourceOrigin:'WEB',lastModifiedSource:'WEB',createdAt:serverTimestamp(),createdBy:username,
            updatedAt:serverTimestamp(),updatedBy:username
          })
        })
        // An existing WO header is never overwritten. It references its
        // original first line; additional lines live in monthly_plans.
        uniqueWos.forEach((wo,index)=>{
          if(woSnaps[index].exists())return
          const first=prepared.find(item=>item.woNumber===wo)!
          const p=first.info.paddock!,a=first.info.activity!
          transaction.set(woRefs[index],{
            woNumber:wo,planLineId:first.planLineId,companyCode:draft.company,pid:p.pid,
            masterActivityId:a.id,activity:a.activity,description:a.description,
            activityCode:a.activityCode,coaCode:first.info.coaCode,catalogActivityId:first.info.catalogActivityId,
            operationCode:first.info.operationCode,department:first.info.department,
            plannedShift:first.info.line.plannedShift||'1',monthKey:draft.month,week:draft.week,targetAreaHa:first.info.target,
            status:'PLANNED',createdAt:serverTimestamp(),createdBy:username
          })
        })
      })
      setExisting(rows=>[...rows,...prepared.map(x=>({planLineId:x.planLineId,monthKey:draft.month,week:draft.week,pid:x.info.paddock!.pid,activity:x.info.activity!.activity,catalogActivityId:x.info.catalogActivityId,masterActivityId:x.info.activity!.id,plannedShift:x.info.line.plannedShift||'1',plannedDate:x.info.line.plannedDate||''}))])
      clearPlanDraft(draftKey);setDraft(current=>({...current,lines:[blankLine()]}))
      setMessage(prepared.length+' baris Monthly Plan tersimpan untuk '+new Set(prepared.map(item=>item.woNumber)).size+' nomor WO. Total target '+planHa(totalArea)+'.')
      onSaved?.()
    }catch(err){setMessage(err instanceof Error?err.message:'Gagal membuat WO/Monthly Plan.')}finally{setBusy(false)}
  }

  return <section className="plan-entry-screen monthly-plan-entry">
    <div className="section-head"><div><div className="eyebrow">MONTHLY PLAN · BATCH INPUT</div><h2>Input Monthly Plan</h2><p className="muted">Satu sesi dapat berisi beberapa PID/Activity. Draft tersimpan otomatis di perangkat sampai berhasil disimpan.</p></div><div className="row-actions"><YinYangRefreshButton busy={busy} label="Refresh Master" onClick={()=>void Promise.all([loadMasters(),loadPeriod()])}/><button type="button" className="danger" onClick={reset} disabled={busy}>Reset Draft</button></div></div>
    {message&&<div className="alert">{message}</div>}
    <form onSubmit={save} className="plan-entry-form" noValidate>
      <section className="panel plan-section"><div className="plan-section-title"><div><span className="eyebrow">PERIODE PLANNING</span><h3>Periode & Company</h3></div><span className="status-pill">Draft otomatis</span></div><div className="plan-grid">
        {!selectedMonth&&<label><span>Bulan</span><input type="month" value={draft.month} onChange={e=>patchDraft({month:e.target.value})}/></label>}
        {!selectedWeek&&<label><span>Week</span><select value={draft.week} onChange={e=>patchDraft({week:e.target.value})}>{['W1','W2','W3','W4'].map(x=><option key={x}>{x}</option>)}</select></label>}
        {selectedMonth&&selectedWeek&&<div className="monthly-period-chip"><span>Periode Aktif</span><strong>{draft.month} · {draft.week}</strong></div>}
        <label><span>Company</span><select value={draft.company} onChange={e=>patchDraft({company:e.target.value,farm:'',lines:draft.lines.map(line=>({...line,pid:'',activityId:'',varieties:[]}))})}>{companies.map(x=><option key={x.id} value={x.code}>{x.code} — {x.name}</option>)}</select></label>
        <label><span>Farm</span><select value={draft.farm} onChange={e=>patchDraft({farm:e.target.value,lines:draft.lines.map(line=>({...line,pid:'',varieties:[]}))})}><option value="">Semua Farm</option>{farms.map(x=><option key={x}>{x}</option>)}</select></label>
      </div></section>

      <section className="panel plan-section monthly-work-section"><div className="plan-section-title"><div><span className="eyebrow">PEKERJAAN</span><h3>PID & Activity</h3><p className="muted">Satu nomor WO boleh digunakan pada banyak baris pekerjaan dan tanggal. Setiap baris memiliki Plan ID tersendiri dan target dihitung sesuai baris.</p></div><span className="status-pill">{draft.lines.length} pekerjaan</span></div>
        <div className="plan-work-list monthly-work-list">{lineInfo.map((info,index)=><div id={'monthly-work-'+index} className="plan-work-card monthly-work-card" key={info.line.id}><div className="plan-work-head"><div><span className="eyebrow">PEKERJAAN {String(index+1).padStart(2,'0')}</span><strong>{info.line.pid||'Pilih PID'}{info.activity?' · '+info.activity.description:''}{info.line.woNumber?' · WO '+info.line.woNumber:''}</strong></div><div className="row-actions">{index>0&&<button type="button" onClick={()=>addLine(info.line)}>Duplikat</button>}<button type="button" className="danger" onClick={()=>removeLine(info.line.id)}>Hapus</button></div></div><div className="plan-grid">
          <label><span>Nomor WO (boleh berulang)</span><input value={info.line.woNumber||''} onChange={e=>patchLine(info.line.id,{woNumber:e.target.value.toUpperCase()})} placeholder="Contoh: WO_931" autoComplete="off" maxLength={80}/></label><label><span>PID / Paddock</span><input list={'monthly-pids-'+info.line.id} value={info.line.pid} onChange={e=>patchLine(info.line.id,{pid:e.target.value.toUpperCase(),varieties:[]})} placeholder="Pilih PID"/><datalist id={'monthly-pids-'+info.line.id}>{pidOptions.map(x=><option key={x.pid} value={x.pid}>{x.farm} · {x.variety}</option>)}</datalist></label>
          <MonthlyActivitySmartSearch options={activityChoices} value={info.line.activityId} disabled={busy} onSelect={id=>patchLine(info.line.id,{activityId:id})}/><label><span>Shift Rencana WO</span><select value={info.line.plannedShift||'1'} onChange={e=>patchLine(info.line.id,{plannedShift:e.target.value})}><option value="1">Shift 1</option><option value="2">Shift 2</option><option value="ALL">Semua Shift (Shift 1 & 2)</option></select><small>Semua Shift: pekerjaan dapat dilaksanakan di Shift 1 atau 2. Target tidak otomatis dikalikan dua; shift aktual ditentukan saat Daily Plan/QC.</small></label>
          
          
          <label><span>Tanggal Rencana (opsional)</span><input type="date" min={dates.start} max={dates.end} value={info.line.plannedDate||''} onChange={e=>patchLine(info.line.id,{plannedDate:e.target.value})}/><small>Isi jika WO yang sama berisi pekerjaan pada beberapa tanggal.</small></label>
          <label><span>CoA (otomatis)</span><input readOnly value={info.coaCode||'Belum tersedia'} title="CoA berasal dari Master Activity"/></label><label><span>Operation Code (otomatis)</span><input readOnly value={info.operationCode||'Belum dipetakan'} title="Kode Operation mengikuti Master Activity"/></label>
          <label><span>Target Luas (Ha)</span><input type="text" inputMode="decimal" value={info.line.target} onChange={e=>patchLine(info.line.id,{target:e.target.value.replace(/[^0-9.,]/g,'')})} placeholder="Contoh: 72,8"/></label>
          <label className="plan-span-2"><span>Keterangan</span><input value={info.line.notes} onChange={e=>patchLine(info.line.id,{notes:e.target.value})} placeholder="Opsional"/></label>
        </div>{info.paddock&&<><div className="plan-inline-info"><span>Farm <strong>{info.paddock.farm||'-'}</strong></span><span>Plant Area Total <strong>{planHa(info.paddock.plantAreaHa)}</strong></span><span>Stage <strong>{info.paddock.stage||'-'}</strong></span><span>Target <strong>{planHa(info.target)}</strong>{info.target>info.paddock.plantAreaHa&&<small className="monthly-over-area-note"> · boleh &gt; Plant Area</small>}</span></div><div className="monthly-variety-selector"><div className="monthly-variety-head"><div><span className="eyebrow">VARIETAS APLIKASI</span><strong>{info.selectedVarieties.length?info.selectedVarieties.join(', '):'Pilih varietas'}</strong><small>Bisa memilih lebih dari satu varietas. Target plan tidak dibatasi oleh luas plant.</small></div>{info.varietyOptions.length>1&&<div className="row-actions"><button type="button" onClick={()=>selectAllVarieties(info.line.id,info.varietyOptions.map(x=>x.variety))}>Pilih Semua</button><button type="button" onClick={()=>clearVarieties(info.line.id)}>Kosongkan</button></div>}</div><div className="monthly-variety-chips">{info.varietyOptions.map(option=>{const selected=info.selectedVarieties.includes(option.variety);return <button type="button" key={option.variety} className={'monthly-variety-chip '+(selected?'selected':'')} aria-pressed={selected} onClick={()=>toggleVariety(info.line.id,option.variety,info.varietyOptions.map(x=>x.variety))}><span>{selected?'✓':'+'}</span><strong>{option.variety}</strong><small>{planHa(option.areaHa)}</small></button>})}{!info.varietyOptions.length&&<span className="muted">Varietas belum tersedia pada Master Paddock.</span>}</div>{info.selectedVarieties.length>0&&<div className="monthly-selected-variety-total">Luas varietas dipilih <strong>{planHa(info.selectedPlantArea)}</strong>{info.target>info.selectedPlantArea&&<span>Target lebih besar dari luas varietas dipilih tetap diperbolehkan.</span>}</div>}</div></>}{info.activity&&<div className="plan-material-mini"><strong>{info.activity.description}</strong><span>WO {info.line.woNumber||'(belum diisi)'} · Shift Rencana {info.line.plannedShift||'1'} · Operation {info.operationCode||'belum dipetakan'} · CoA {info.coaCode||'belum dipetakan'}</span><span>{info.materials.length} material · target {planHa(info.target)}</span>{info.materials.map(m=><small key={m.material}>{m.material}: {m.dosePerHa} {m.unit}/Ha → <b>{m.totalMaterial.toLocaleString('id-ID',{maximumFractionDigits:4})} {m.unit}</b></small>)}</div>}</div>)}</div>
        <div className="monthly-add-work-footer"><button type="button" className="monthly-add-work-button" onClick={()=>addLine()}><span>＋</span><strong>Tambah Pekerjaan</strong><small>Tambahkan PID / Activity berikutnya</small></button></div>
      </section>

      <section className="panel plan-section monthly-save-section"><div className="plan-section-title"><div><span className="eyebrow">RINGKASAN</span><h3>Total Planning</h3></div></div><div className="plan-summary-grid"><div><span>Pekerjaan</span><strong>{draft.lines.length}</strong></div><div><span>Total Target</span><strong>{planHa(totalArea)}</strong></div><div><span>Material</span><strong>{totalMaterials.length}</strong></div></div>{totalMaterials.length>0&&<div className="plan-material-summary">{totalMaterials.map(m=><span key={m.material+'|'+m.unit}>{m.material}<strong>{m.totalMaterial.toLocaleString('id-ID',{maximumFractionDigits:4})} {m.unit}</strong></span>)}</div>}{message&&<div className={'monthly-save-feedback '+(message.startsWith('BELUM TERSIMPAN')?'error':message.includes('berhasil')?'success':'')}>{message}</div>}<button type="submit" className="primary plan-save-button" disabled={busy}>{busy?'Menyimpan…':'Simpan Semua Monthly Plan'}</button></section>
    </form>
  </section>
}
