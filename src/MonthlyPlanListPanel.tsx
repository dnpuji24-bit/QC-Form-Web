import { FormEvent, useEffect, useMemo, useState } from 'react'
import { collection, doc, getDoc, getDocs, query as fsQuery, serverTimestamp, setDoc, where, writeBatch } from 'firebase/firestore'
import { firebaseAuth, firebaseAuthPersistenceReady, firestoreDb } from './firebase'
import type { User } from './types'
import { canEditAccess } from './accessControl'
import YinYangRefreshButton from './YinYangRefreshButton'

type Props={user:User;selectedMonth?:string;selectedWeek?:string;compact?:boolean;refreshKey?:number;onOpenDailyPlan?:(request:{date:string;monthlyPlanLineId:string;pid:string})=>void}
type PlanRow={id:string;planLineId:string;year:number;monthKey:string;monthLabel:string;week:string;inputDate:string;startDate:string;endDate:string;companyCode:string;farm:string;pid:string;description:string;activity:string;targetAreaHa:number;sourceActualAreaHa:number;sourceBalanceHa:number;manualActualAreaHa:number;manualProgressNote:string;variety:string;masterVariety:string;sourceStatus:string;storedStatus:string;stage:string;notes:string;type:string;activityCategory:string;lastModifiedSource:string;cancelled:boolean;cancelReason:string;createdAt:string;updatedAt:string}
type DailyRef={id:string;dailyPlanId:string;monthlyPlanLineId:string;date:string;shift:string;foreman:string;pid:string;activity:string;areaHa:number}
type ActualRef={monthlyPlanLineId:string;actualAreaHa:number}
type ImportLog={id:string;sourceFileName:string;total:number;created:number;updated:number;unchanged:number;protected:number;warnings:number;errors:number;importedBy:string;importedAt:string}
type ViewRow=PlanRow&{scheduledAreaHa:number;unallocatedAreaHa:number;linkedActualAreaHa:number;systemActualAreaHa:number;systemBalanceHa:number;progressPct:number;systemStatus:string;isCancelled:boolean}

function text(value:unknown){return value===null||value===undefined?'':String(value).trim()}
function num(value:unknown){const n=Number(value||0);return Number.isFinite(n)?n:0}
function searchKey(value:unknown){return text(value).toLowerCase().replace(/[^a-z0-9]/g,'')}
function shortDate(value:string){if(!value)return'-';const d=new Date(value+'T00:00:00');return Number.isNaN(d.getTime())?value:d.toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'})}
function dateValue(value:unknown){if(!value)return'';if(typeof value==='string')return value;if(typeof value==='object'&&value!==null&&'toDate' in value&&typeof (value as {toDate?:unknown}).toDate==='function'){try{return((value as {toDate:()=>Date}).toDate()).toISOString()}catch{return''}}return''}
function rowFromData(id:string,data:Record<string,unknown>):PlanRow{return{id,planLineId:text(data.planLineId||data.planCode||id),year:num(data.year),monthKey:text(data.monthKey||data.month),monthLabel:text(data.monthLabel),week:text(data.week),inputDate:text(data.inputDate),startDate:text(data.startDate),endDate:text(data.endDate),companyCode:text(data.companyCode).toUpperCase(),farm:text(data.farm),pid:text(data.pid),description:text(data.description),activity:text(data.activity),targetAreaHa:num(data.targetAreaHa),sourceActualAreaHa:num(data.actualAreaHa),sourceBalanceHa:num(data.balanceHa),manualActualAreaHa:num(data.manualActualAreaHa),manualProgressNote:text(data.manualProgressNote),variety:text(data.variety),masterVariety:text(data.masterVariety),sourceStatus:text(data.sourceStatus),storedStatus:text(data.status),stage:text(data.stage),notes:text(data.notes),type:text(data.type),activityCategory:text(data.activityCategory),lastModifiedSource:text(data.lastModifiedSource),cancelled:data.cancelled===true,cancelReason:text(data.cancelReason),createdAt:dateValue(data.createdAt),updatedAt:dateValue(data.updatedAt)}}
function logFromData(id:string,data:Record<string,unknown>):ImportLog{return{id,sourceFileName:text(data.sourceFileName),total:num(data.total),created:num(data.created),updated:num(data.updated),unchanged:num(data.unchanged),protected:num(data.protected),warnings:num(data.warnings),errors:num(data.errors),importedBy:text(data.importedBy),importedAt:dateValue(data.importedAt)}}
function formatHa(value:number,digits=2){return new Intl.NumberFormat('id-ID',{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(value)+' Ha'}
function formatPct(value:number){return new Intl.NumberFormat('id-ID',{minimumFractionDigits:0,maximumFractionDigits:1}).format(value)+'%'}
function formatDateTime(value:string){if(!value)return'-';const d=new Date(value);return Number.isNaN(d.getTime())?value:d.toLocaleString('id-ID',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}
function isCancelled(row:PlanRow){return row.cancelled||row.sourceStatus.toUpperCase().includes('CANCEL')}
function autoStatus(row:PlanRow,actual:number){if(isCancelled(row))return'DONE';if(actual<=0)return'PLANNED';if(actual<row.targetAreaHa-0.0001)return'ON PROGRESS';if(Math.abs(actual-row.targetAreaHa)<=0.0001)return'DONE';return'OVER ACTUAL'}
function weekDates(monthKey:string,week:string){if(!/^\d{4}-\d{2}$/.test(monthKey))return{start:'',end:''};const[y,m]=monthKey.split('-').map(Number),last=new Date(y,m,0).getDate(),ranges:Record<string,[number,number]>={W1:[1,7],W2:[8,15],W3:[16,22],W4:[23,last]},range=ranges[week]||[1,last];return{start:monthKey+'-'+String(range[0]).padStart(2,'0'),end:monthKey+'-'+String(range[1]).padStart(2,'0')}}
const EXPORT_WEEKS=['W1','W2','W3','W4'] as const
function ExcelIcon(){return <svg className="monthly-excel-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="5.5" y="3" width="14.5" height="18" rx="2.2" fill="currentColor" opacity=".18"/><path d="M11 6h7v2h-7zm0 4h7v2h-7zm0 4h7v2h-7z" fill="currentColor"/><rect x="2" y="5.5" width="10" height="13" rx="1.8" fill="currentColor"/><path d="m4.6 9 1.45 2.35L7.55 9h1.7l-2.3 3.48L9.4 16H7.62l-1.6-2.46L4.43 16H2.7l2.4-3.52L2.88 9z" fill="#fff"/></svg>}
async function writerContext(appUser:User){const db=firestoreDb,auth=firebaseAuth;if(!db||!auth)throw new Error('Firebase belum tersedia.');await firebaseAuthPersistenceReady;if(typeof auth.authStateReady==='function')await auth.authStateReady();const current=auth.currentUser;if(!current)throw new Error('Sesi Firebase belum aktif. Login ulang lalu coba lagi.');const snap=await getDoc(doc(db,'users',current.uid));if(!snap.exists())throw new Error('Profil user tidak ditemukan.');const p=snap.data() as Record<string,unknown>;if(p.active!==true||!canEditAccess(appUser,'data_plan_monthly'))throw new Error('Hak akses Edit Monthly Plan belum diberikan.');return{db,username:text(p.username)||appUser.username}}

export default function MonthlyPlanListPanel({user,selectedMonth,selectedWeek,compact=false,refreshKey=0,onOpenDailyPlan}:Props){
  const defaultExportMonth=selectedMonth||new Date().toISOString().slice(0,7),initialExportWeeks=selectedWeek&&EXPORT_WEEKS.includes(selectedWeek as typeof EXPORT_WEEKS[number])?[selectedWeek]:[...EXPORT_WEEKS]
  const[rows,setRows]=useState<PlanRow[]>([]),[daily,setDaily]=useState<DailyRef[]>([]),[actuals,setActuals]=useState<ActualRef[]>([]),[logs,setLogs]=useState<ImportLog[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
  const[month,setMonth]=useState('ALL'),[week,setWeek]=useState('ALL'),[company,setCompany]=useState('ALL'),[farm,setFarm]=useState('ALL'),[status,setStatus]=useState('ALL'),[query,setQuery]=useState('')
  const[editMode,setEditMode]=useState<'details'|'progress'|''>(''),[editingId,setEditingId]=useState('')
  const[editTarget,setEditTarget]=useState(''),[editMonth,setEditMonth]=useState(''),[editVariety,setEditVariety]=useState(''),[editMasterVariety,setEditMasterVariety]=useState(''),[editStage,setEditStage]=useState(''),[editFarm,setEditFarm]=useState(''),[editWeek,setEditWeek]=useState('W1'),[editNotes,setEditNotes]=useState('')
  const[progressManual,setProgressManual]=useState(''),[progressNote,setProgressNote]=useState(''),[expandedDailyPlanId,setExpandedDailyPlanId]=useState('')
  const[exportOpen,setExportOpen]=useState(false),[exporting,setExporting]=useState(false),[exportFrom,setExportFrom]=useState(defaultExportMonth),[exportTo,setExportTo]=useState(defaultExportMonth),[exportWeeks,setExportWeeks]=useState<string[]>(initialExportWeeks)
  const[sourceCatalog,setSourceCatalog]=useState<PlanRow[]>([]),[sourceSearchLoaded,setSourceSearchLoaded]=useState(false),[sourceSearchBusy,setSourceSearchBusy]=useState(false)
  const[searchDaily,setSearchDaily]=useState<DailyRef[]>([]),[searchActuals,setSearchActuals]=useState<ActualRef[]>([])
  const isOwner=user.role==='owner',canWrite=canEditAccess(user,'data_plan_monthly')

  async function load(){if(!firestoreDb){setMessage('Firestore belum tersedia.');return}const db=firestoreDb;setSourceSearchLoaded(false);setSourceCatalog([]);setSearchDaily([]);setSearchActuals([]);setBusy(true);const monthFilter=selectedMonth||new Date().toISOString().slice(0,7);setMessage('Memuat Monthly '+monthFilter+'…');try{
    const planSnap=await getDocs(fsQuery(collection(db,'monthly_plans'),where('monthKey','==',monthFilter)))
    const next=planSnap.docs.map(x=>rowFromData(x.id,x.data() as Record<string,unknown>)).sort((a,b)=>{const aTime=a.createdAt||a.updatedAt||a.inputDate,bTime=b.createdAt||b.updatedAt||b.inputDate;return bTime.localeCompare(aTime)||b.planLineId.localeCompare(a.planLineId,undefined,{numeric:true})||b.pid.localeCompare(a.pid,undefined,{numeric:true})})
    const ids=next.map(x=>x.planLineId).filter(Boolean),dailyDocs:any[]=[],actualDocs:any[]=[]
    for(let i=0;i<ids.length;i+=30){const part=ids.slice(i,i+30);const[d,a]=await Promise.all([getDocs(fsQuery(collection(db,'daily_plans'),where('monthlyPlanLineId','in',part))),getDocs(fsQuery(collection(db,'daily_reports'),where('monthlyPlanLineId','in',part)))]);dailyDocs.push(...d.docs);actualDocs.push(...a.docs)}
    setRows(next);setDaily(dailyDocs.map(x=>{const d=x.data() as Record<string,unknown>;return{id:x.id,dailyPlanId:text(d.dailyPlanId||x.id),monthlyPlanLineId:text(d.monthlyPlanLineId),date:text(d.date),shift:text(d.shift),foreman:text(d.foreman),pid:text(d.pid),activity:text(d.activity||d.description),areaHa:num(d.areaHa)}}).sort((a,b)=>a.date.localeCompare(b.date)||a.shift.localeCompare(b.shift,undefined,{numeric:true})||a.dailyPlanId.localeCompare(b.dailyPlanId,undefined,{numeric:true})));setActuals(actualDocs.map(x=>{const d=x.data() as Record<string,unknown>;return{monthlyPlanLineId:text(d.monthlyPlanLineId),actualAreaHa:num(d.actualAreaHa)}}))
    if(compact)setLogs([]);else{const logSnap=await getDocs(collection(db,'monthly_plan_import_logs'));setLogs(logSnap.docs.map(x=>logFromData(x.id,x.data() as Record<string,unknown>)).sort((a,b)=>b.importedAt.localeCompare(a.importedAt)).slice(0,10))}
    setMessage('Monthly '+monthFilter+': '+next.length+' Plan Line. Actual = Actual Plan terhubung + progress manual/historis.')
  }catch(error){setMessage(error instanceof Error?error.message:'Monthly Plan gagal dimuat.')}finally{setBusy(false)}}
  useEffect(()=>{void load()},[selectedMonth,refreshKey])

  const searchNeedle=searchKey(query),searchingSource=Boolean(searchNeedle)
  useEffect(()=>{
    if(!searchingSource||sourceSearchLoaded||!firestoreDb)return
    const db=firestoreDb
    let cancelled=false
    const timer=window.setTimeout(()=>{
      setSourceSearchBusy(true)
      void getDocs(collection(db,'monthly_plans')).then(snap=>{
        if(cancelled)return
        const all=snap.docs.map(x=>rowFromData(x.id,x.data() as Record<string,unknown>)).sort((a,b)=>b.monthKey.localeCompare(a.monthKey)||b.week.localeCompare(a.week,undefined,{numeric:true})||b.planLineId.localeCompare(a.planLineId,undefined,{numeric:true})||b.pid.localeCompare(a.pid,undefined,{numeric:true}))
        setSourceCatalog(all);setSourceSearchLoaded(true)
      }).catch(error=>{if(!cancelled)setMessage(error instanceof Error?error.message:'Pencarian seluruh sumber Monthly Plan gagal.')}).finally(()=>{if(!cancelled)setSourceSearchBusy(false)})
    },220)
    return()=>{cancelled=true;window.clearTimeout(timer)}
  },[searchingSource,sourceSearchLoaded])

  const sourceMatches=useMemo(()=>searchingSource?sourceCatalog.filter(row=>searchKey([row.planLineId,row.pid,row.description,row.activity,row.variety,row.masterVariety,row.notes,row.cancelReason,row.monthKey,row.week,row.companyCode,row.farm,row.stage,row.type,row.activityCategory].join(' ')).includes(searchNeedle)):[],[sourceCatalog,searchNeedle,searchingSource])

  useEffect(()=>{
    if(!searchingSource||!sourceSearchLoaded||!firestoreDb){setSearchDaily([]);setSearchActuals([]);return}
    const db=firestoreDb
    let cancelled=false
    const timer=window.setTimeout(()=>{
      const ids=[...new Set(sourceMatches.map(row=>row.planLineId).filter(Boolean))]
      if(!ids.length){setSearchDaily([]);setSearchActuals([]);return}
      setSourceSearchBusy(true)
      void (async()=>{
        const dailyDocs:any[]=[],actualDocs:any[]=[]
        for(let i=0;i<ids.length;i+=30){
          const part=ids.slice(i,i+30)
          const[d,a]=await Promise.all([
            getDocs(fsQuery(collection(db,'daily_plans'),where('monthlyPlanLineId','in',part))),
            getDocs(fsQuery(collection(db,'daily_reports'),where('monthlyPlanLineId','in',part))),
          ])
          dailyDocs.push(...d.docs);actualDocs.push(...a.docs)
        }
        if(cancelled)return
        setSearchDaily(dailyDocs.map(x=>{const d=x.data() as Record<string,unknown>;return{id:x.id,dailyPlanId:text(d.dailyPlanId||x.id),monthlyPlanLineId:text(d.monthlyPlanLineId),date:text(d.date),shift:text(d.shift),foreman:text(d.foreman),pid:text(d.pid),activity:text(d.activity||d.description),areaHa:num(d.areaHa)}}).sort((a,b)=>a.date.localeCompare(b.date)||a.shift.localeCompare(b.shift,undefined,{numeric:true})||a.dailyPlanId.localeCompare(b.dailyPlanId,undefined,{numeric:true})))
        setSearchActuals(actualDocs.map(x=>{const d=x.data() as Record<string,unknown>;return{monthlyPlanLineId:text(d.monthlyPlanLineId),actualAreaHa:num(d.actualAreaHa)}}))
      })().catch(error=>{if(!cancelled)setMessage(error instanceof Error?error.message:'Data Daily/Actual untuk hasil pencarian gagal dimuat.')}).finally(()=>{if(!cancelled)setSourceSearchBusy(false)})
    },180)
    return()=>{cancelled=true;window.clearTimeout(timer)}
  },[searchingSource,sourceSearchLoaded,sourceMatches])

  const effectiveRows=searchingSource?sourceMatches:rows,effectiveDaily=searchingSource?searchDaily:daily,effectiveActuals=searchingSource?searchActuals:actuals
  const scheduledMap=useMemo(()=>{const map=new Map<string,number>();effectiveDaily.forEach(x=>{if(x.monthlyPlanLineId)map.set(x.monthlyPlanLineId,(map.get(x.monthlyPlanLineId)||0)+x.areaHa)});return map},[effectiveDaily])
  const actualMap=useMemo(()=>{const map=new Map<string,number>();effectiveActuals.forEach(x=>{if(x.monthlyPlanLineId)map.set(x.monthlyPlanLineId,(map.get(x.monthlyPlanLineId)||0)+x.actualAreaHa)});return map},[effectiveActuals])
  const viewRows=useMemo<ViewRow[]>(()=>effectiveRows.map(row=>{const scheduledAreaHa=scheduledMap.get(row.planLineId)||0,linkedActualAreaHa=actualMap.get(row.planLineId)||0,systemActualAreaHa=linkedActualAreaHa+row.manualActualAreaHa,cancelled=isCancelled(row),unallocatedAreaHa=cancelled?0:row.targetAreaHa-scheduledAreaHa,systemBalanceHa=cancelled?0:row.targetAreaHa-systemActualAreaHa,progressPct=cancelled?100:row.targetAreaHa>0?systemActualAreaHa/row.targetAreaHa*100:0;return{...row,scheduledAreaHa,unallocatedAreaHa,linkedActualAreaHa,systemActualAreaHa,systemBalanceHa,progressPct,systemStatus:autoStatus(row,systemActualAreaHa),isCancelled:cancelled}}),[effectiveRows,scheduledMap,actualMap])
  const months=useMemo(()=>[...new Set(viewRows.map(x=>x.monthKey).filter(Boolean))].sort().reverse(),[viewRows])
  const companies=useMemo(()=>[...new Set(viewRows.map(x=>x.companyCode).filter(Boolean))].sort(),[viewRows])
  const farms=useMemo(()=>[...new Set(viewRows.filter(x=>company==='ALL'||x.companyCode===company).map(x=>x.farm).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),[viewRows,company])
  const statuses=['PLANNED','ON PROGRESS','DONE','OVER ACTUAL']
  const activeWeek=selectedWeek||week
  const dailyByMonthlyId=useMemo(()=>{const map=new Map<string,DailyRef[]>();effectiveDaily.forEach(item=>{if(!item.monthlyPlanLineId)return;const current=map.get(item.monthlyPlanLineId)||[];current.push(item);map.set(item.monthlyPlanLineId,current)});return map},[effectiveDaily])
  const filtered=useMemo(()=>searchingSource?viewRows:viewRows.filter(row=>(selectedMonth?row.monthKey===selectedMonth:(month==='ALL'||row.monthKey===month))&&(activeWeek==='ALL'||row.week===activeWeek)&&(company==='ALL'||row.companyCode===company)&&(farm==='ALL'||row.farm===farm)&&(status==='ALL'||row.systemStatus===status)),[viewRows,searchingSource,selectedMonth,month,activeWeek,company,farm,status])
  const totals=useMemo(()=>filtered.reduce((acc,row)=>({target:acc.target+row.targetAreaHa,scheduled:acc.scheduled+row.scheduledAreaHa,unallocated:acc.unallocated+row.unallocatedAreaHa,actual:acc.actual+row.systemActualAreaHa,balance:acc.balance+row.systemBalanceHa}),{target:0,scheduled:0,unallocated:0,actual:0,balance:0}),[filtered])
  const hasActiveFilter=month!=='ALL'||week!=='ALL'||company!=='ALL'||farm!=='ALL'||status!=='ALL'||query.trim()!==''
  const editing=viewRows.find(row=>row.id===editingId)||null

  function startDetails(row:ViewRow){setEditingId(row.id);setEditMode('details');setEditTarget(String(row.targetAreaHa));setEditMonth(row.monthKey);setEditVariety(row.variety);setEditMasterVariety(row.masterVariety);setEditStage(row.stage);setEditFarm(row.farm);setEditWeek(row.week||'W1');setEditNotes(row.notes);requestAnimationFrame(()=>document.getElementById('monthly-edit-panel')?.scrollIntoView({behavior:'smooth',block:'start'}))}
  function startProgress(row:ViewRow){setEditingId(row.id);setEditMode('progress');setProgressManual(String(row.manualActualAreaHa||0));setProgressNote(row.manualProgressNote);requestAnimationFrame(()=>document.getElementById('monthly-edit-panel')?.scrollIntoView({behavior:'smooth',block:'start'}))}
  function closeEdit(){setEditingId('');setEditMode('')}

  function openExportDialog(){
    const activeMonth=selectedMonth||new Date().toISOString().slice(0,7)
    setExportFrom(activeMonth);setExportTo(activeMonth)
    setExportWeeks(selectedWeek&&EXPORT_WEEKS.includes(selectedWeek as typeof EXPORT_WEEKS[number])?[selectedWeek]:[...EXPORT_WEEKS])
    setExportOpen(true)
  }
  function toggleExportWeek(value:string){setExportWeeks(current=>current.includes(value)?current.filter(item=>item!==value):EXPORT_WEEKS.filter(item=>[...current,value].includes(item)))}
  async function exportMonthlyExcel(){
    if(!firestoreDb){setMessage('Firestore belum tersedia.');return}
    if(!/^\d{4}-\d{2}$/.test(exportFrom)||!/^\d{4}-\d{2}$/.test(exportTo)){setMessage('Rentang bulan export tidak valid.');return}
    if(exportFrom>exportTo){setMessage('Bulan Mulai tidak boleh setelah Bulan Sampai.');return}
    if(!exportWeeks.length){setMessage('Pilih minimal satu Week untuk export.');return}
    setExporting(true);setMessage('Menyiapkan Excel Monthly Plan '+exportFrom+' s.d. '+exportTo+'…')
    try{
      const planSnap=await getDocs(fsQuery(collection(firestoreDb,'monthly_plans'),where('monthKey','>=',exportFrom),where('monthKey','<=',exportTo)))
      const selectedWeekSet=new Set(exportWeeks),planRows=planSnap.docs.map(x=>rowFromData(x.id,x.data() as Record<string,unknown>)).filter(row=>selectedWeekSet.has(row.week.toUpperCase())).sort((a,b)=>a.monthKey.localeCompare(b.monthKey)||a.week.localeCompare(b.week,undefined,{numeric:true})||a.planLineId.localeCompare(b.planLineId,undefined,{numeric:true})||a.pid.localeCompare(b.pid,undefined,{numeric:true}))
      if(!planRows.length){setMessage('Tidak ada Monthly Plan pada rentang bulan dan Week yang dipilih.');setExportOpen(false);return}
      const ids=[...new Set(planRows.map(row=>row.planLineId).filter(Boolean))],dailyDocs:any[]=[],actualDocs:any[]=[]
      for(let i=0;i<ids.length;i+=30){const part=ids.slice(i,i+30),[d,a]=await Promise.all([getDocs(fsQuery(collection(firestoreDb,'daily_plans'),where('monthlyPlanLineId','in',part))),getDocs(fsQuery(collection(firestoreDb,'daily_reports'),where('monthlyPlanLineId','in',part)))]);dailyDocs.push(...d.docs);actualDocs.push(...a.docs)}
      const scheduled=new Map<string,number>(),linkedActual=new Map<string,number>()
      dailyDocs.forEach(x=>{const d=x.data() as Record<string,unknown>,id=text(d.monthlyPlanLineId);if(id)scheduled.set(id,(scheduled.get(id)||0)+num(d.areaHa))})
      actualDocs.forEach(x=>{const d=x.data() as Record<string,unknown>,id=text(d.monthlyPlanLineId);if(id)linkedActual.set(id,(linkedActual.get(id)||0)+num(d.actualAreaHa))})
      const exportRows=planRows.map(row=>{const dailyHa=scheduled.get(row.planLineId)||0,linkedHa=linkedActual.get(row.planLineId)||0,totalActual=linkedHa+row.manualActualAreaHa,cancelled=isCancelled(row),balance=cancelled?0:row.targetAreaHa-totalActual,progress=cancelled?100:row.targetAreaHa>0?totalActual/row.targetAreaHa*100:0,statusValue=autoStatus(row,totalActual);return[row.monthKey,row.week,row.planLineId,row.companyCode,row.farm,row.pid,row.description,row.activity,row.type,row.activityCategory,row.variety,row.masterVariety,row.stage,row.targetAreaHa,dailyHa,cancelled?0:row.targetAreaHa-dailyHa,linkedHa,row.manualActualAreaHa,totalActual,balance,Number(progress.toFixed(2)),statusValue,cancelled?'YA':'TIDAK',row.cancelReason,row.startDate,row.endDate,row.notes]})
      const headers=['Bulan','Week','Plan Line ID','Company','Farm','Paddock','Description','Activity','Type','Activity Category','Variety','Master Variety','Stage','Target (Ha)','Daily (Ha)','Sisa Belum Dijadwalkan (Ha)','Actual Linked (Ha)','Progress Manual (Ha)','Actual Total (Ha)','Balance (Ha)','Progress (%)','Status','Cancelled','Alasan Cancel','Start Date','End Date','Notes']
      const XLSX=await import('xlsx'),sheet=XLSX.utils.aoa_to_sheet([headers,...exportRows]),workbook=XLSX.utils.book_new()
      sheet['!cols']=headers.map(header=>({wch:/Description|Activity|Variety|Notes|Alasan/i.test(header)?24:/Plan Line|Paddock|Company|Status/i.test(header)?18:Math.min(22,Math.max(11,header.length+2))}))
      sheet['!autofilter']={ref:'A1:'+XLSX.utils.encode_col(headers.length-1)+(exportRows.length+1)}
      XLSX.utils.book_append_sheet(workbook,sheet,'Monthly Plan')
      const weekLabel=exportWeeks.length===EXPORT_WEEKS.length?'ALL_WEEK':exportWeeks.join('-')
      XLSX.writeFile(workbook,'Monthly_Plan_'+exportFrom+'_to_'+exportTo+'_'+weekLabel+'.xlsx')
      setExportOpen(false);setMessage('Export Excel selesai: '+planRows.length+' Plan Line · '+exportFrom+' s.d. '+exportTo+' · '+weekLabel+'.')
    }catch(error){setMessage(error instanceof Error?error.message:'Export Excel Monthly Plan gagal.')}finally{setExporting(false)}
  }

  async function saveDetails(e:FormEvent){e.preventDefault();if(!editing)return;const target=num(editTarget);if(target<=0){setMessage('Target harus lebih dari 0 Ha.');return}if(!/^\d{4}-\d{2}$/.test(editMonth)){setMessage('Bulan Monthly Plan tidak valid.');return}if(target<editing.systemActualAreaHa-0.0001&&!window.confirm('Target baru lebih kecil dari total Actual saat ini ('+formatHa(editing.systemActualAreaHa)+'). Status akan menjadi OVER ACTUAL. Tetap simpan?'))return
    if(editMonth!==editing.monthKey&&editing.scheduledAreaHa>0&&!window.confirm('Monthly Plan ini sudah mempunyai Daily Plan '+formatHa(editing.scheduledAreaHa)+'. Memindahkan bulan tidak mengubah tanggal Daily yang sudah dibuat dan link tetap dipertahankan. Tetap pindahkan ke '+editMonth+'?'))return
    setBusy(true)
    try{const{db,username}=await writerContext(user),dates=weekDates(editMonth,editWeek),[nextYear,nextMonthNumber]=editMonth.split('-').map(Number),nextMonthLabel=new Date(nextYear,nextMonthNumber-1,1).toLocaleString('id-ID',{month:'short'});await setDoc(doc(db,'monthly_plans',editing.id),{targetAreaHa:target,year:nextYear,monthNumber:nextMonthNumber,monthKey:editMonth,monthLabel:nextMonthLabel,variety:editVariety,masterVariety:editMasterVariety||editVariety,stage:editStage,farm:editFarm,week:editWeek,startDate:dates.start,endDate:dates.end,notes:editNotes,balanceHa:Math.max(target-editing.systemActualAreaHa,0),calculatedBalanceHa:target-editing.systemActualAreaHa,lastModifiedSource:'WEB',updatedAt:serverTimestamp(),updatedBy:username},{merge:true});setMessage('Monthly '+editing.planLineId+' berhasil diedit'+(editMonth!==editing.monthKey?' dan dipindahkan ke '+editMonth+' · '+editWeek:'')+'. Plan ID/PID/Activity tetap agar link Daily dan Actual tidak putus.');closeEdit();await load()}catch(error){setMessage(error instanceof Error?error.message:'Edit Monthly Plan gagal.')}finally{setBusy(false)}}

  async function saveProgress(e:FormEvent){e.preventDefault();if(!editing)return;const manual=num(progressManual);if(manual<0){setMessage('Progress manual tidak boleh negatif.');return}const total=editing.linkedActualAreaHa+manual;if(total>editing.targetAreaHa+0.0001&&!window.confirm('Total Actual setelah update menjadi '+formatHa(total)+', melebihi target '+formatHa(editing.targetAreaHa)+'. Tetap simpan?'))return
    setBusy(true)
    try{const{db,username}=await writerContext(user),nextStatus=total<=0?'PLANNED':total<editing.targetAreaHa-0.0001?'ON PROGRESS':Math.abs(total-editing.targetAreaHa)<=0.0001?'DONE':'OVER ACTUAL';await setDoc(doc(db,'monthly_plans',editing.id),{manualActualAreaHa:manual,manualProgressNote:progressNote,status:nextStatus,balanceHa:editing.targetAreaHa-total,calculatedBalanceHa:editing.targetAreaHa-total,lastModifiedSource:'WEB',manualProgressUpdatedAt:serverTimestamp(),manualProgressUpdatedBy:username,updatedAt:serverTimestamp(),updatedBy:username},{merge:true});setMessage('Progress manual '+editing.planLineId+' diperbarui menjadi '+formatHa(manual)+'. Total Actual sistem = '+formatHa(total)+'.');closeEdit();await load()}catch(error){setMessage(error instanceof Error?error.message:'Update progress manual gagal.')}finally{setBusy(false)}}

  async function cancelPlan(row:ViewRow){const reason=window.prompt('Cancel '+row.planLineId+' / '+row.pid+'?\nMasukkan alasan cancel. Status sistem akan langsung DONE dan balance menjadi 0.','');if(reason===null)return;if(!reason.trim()){setMessage('Alasan cancel wajib diisi.');return}setBusy(true);try{const{db,username}=await writerContext(user);await setDoc(doc(db,'monthly_plans',row.id),{cancelled:true,cancelReason:reason.trim(),sourceStatus:'CANCELLED',status:'DONE',balanceHa:0,calculatedBalanceHa:0,lastModifiedSource:'WEB',cancelledAt:serverTimestamp(),cancelledBy:username,updatedAt:serverTimestamp(),updatedBy:username},{merge:true});setMessage(row.planLineId+' dibatalkan. Status menjadi DONE · CANCELLED dan tidak akan muncul sebagai Monthly aktif di Input Daily.');await load()}catch(error){setMessage(error instanceof Error?error.message:'Cancel Monthly Plan gagal.')}finally{setBusy(false)}}

  async function reopenPlan(row:ViewRow){if(!window.confirm('Aktifkan kembali '+row.planLineId+'? Plan ini akan kembali mengikuti progress Actual.'))return;setBusy(true);try{const{db,username}=await writerContext(user),actual=row.systemActualAreaHa,nextStatus=actual<=0?'PLANNED':actual<row.targetAreaHa-0.0001?'ON PROGRESS':Math.abs(actual-row.targetAreaHa)<=0.0001?'DONE':'OVER ACTUAL';await setDoc(doc(db,'monthly_plans',row.id),{cancelled:false,cancelReason:'',sourceStatus:'',status:nextStatus,balanceHa:row.targetAreaHa-actual,calculatedBalanceHa:row.targetAreaHa-actual,lastModifiedSource:'WEB',reopenedAt:serverTimestamp(),reopenedBy:username,updatedAt:serverTimestamp(),updatedBy:username},{merge:true});setMessage(row.planLineId+' diaktifkan kembali.');await load()}catch(error){setMessage(error instanceof Error?error.message:'Aktifkan kembali Monthly Plan gagal.')}finally{setBusy(false)}}

  async function deleteRows(targets:ViewRow[],label:string){
    if(!isOwner){setMessage('Hanya Owner yang boleh menghapus Monthly Plan.');return}
    if(!firestoreDb){setMessage('Firestore belum tersedia.');return}
    if(!targets.length){setMessage('Tidak ada Monthly Plan yang dipilih untuk dihapus.');return}
    const ids=new Set(targets.map(x=>x.planLineId)),linkedDaily=daily.filter(x=>ids.has(x.monthlyPlanLineId)).length,linkedActual=actuals.filter(x=>ids.has(x.monthlyPlanLineId)).length,webEdited=targets.filter(row=>row.lastModifiedSource.toUpperCase()==='WEB').length
    const expected='HAPUS '+targets.length
    const dependency=linkedDaily||linkedActual?'\nPERHATIAN: terdapat '+linkedDaily+' Daily Plan dan '+linkedActual+' Actual yang masih mereferensikan Monthly Plan ini. Data downstream tidak ikut terhapus.':''
    const warning=webEdited?'\n'+webEdited+' record pernah diubah melalui Web dan ikut terhapus.':''
    const answer=window.prompt('Akan menghapus '+targets.length+' Monthly Plan ('+label+') dari Firestore.'+dependency+warning+'\n\nRiwayat import tetap disimpan. Ketik '+expected+' untuk lanjut.','')
    if(answer!==expected)return
    setBusy(true);setMessage('Menghapus '+targets.length+' Monthly Plan…')
    try{for(let start=0;start<targets.length;start+=450){const batch=writeBatch(firestoreDb);targets.slice(start,start+450).forEach(row=>batch.delete(doc(firestoreDb!,'monthly_plans',row.id)));await batch.commit()}const deletedIds=new Set(targets.map(row=>row.id));setRows(current=>current.filter(row=>!deletedIds.has(row.id)));setMessage('Hapus selesai: '+targets.length+' Monthly Plan dihapus. Daily/Actual downstream tidak dihapus.')}catch(error){setMessage(error instanceof Error?error.message:'Monthly Plan gagal dihapus.')}finally{setBusy(false)}
  }

  const exportDialog=exportOpen?<div className="monthly-export-backdrop" role="dialog" aria-modal="true" aria-label="Export Monthly Plan ke Excel"><div className="monthly-export-dialog">
    <div className="monthly-export-title"><div className="monthly-export-logo"><ExcelIcon/></div><div><span className="eyebrow">EXPORT MONTHLY PLAN</span><h3>Export ke Excel</h3><p>Pilih rentang bulan dan Week. Data diambil langsung dari Firestore, termasuk Daily, Actual, Balance, dan Status.</p></div><button type="button" className="monthly-export-close" onClick={()=>setExportOpen(false)} aria-label="Tutup">×</button></div>
    <div className="monthly-export-range"><label><span>Bulan Mulai</span><input type="month" value={exportFrom} onChange={e=>setExportFrom(e.target.value)}/></label><label><span>Bulan Sampai</span><input type="month" value={exportTo} onChange={e=>setExportTo(e.target.value)}/></label></div>
    <fieldset className="monthly-export-week-box"><legend>Week yang diexport</legend><div className="monthly-export-weeks">{EXPORT_WEEKS.map(item=><label className={exportWeeks.includes(item)?'selected':''} key={item}><input type="checkbox" checked={exportWeeks.includes(item)} onChange={()=>toggleExportWeek(item)}/><span>{item}</span></label>)}</div><div className="monthly-export-week-actions"><button type="button" onClick={()=>setExportWeeks([...EXPORT_WEEKS])}>Semua Week</button><button type="button" onClick={()=>setExportWeeks([])}>Kosongkan</button></div></fieldset>
    <div className="monthly-export-note">Rentang bersifat inklusif. Contoh 2026-08 s.d. 2026-10 dengan W2 + W4 akan mengekspor W2 dan W4 dari ketiga bulan tersebut.</div>
    <div className="monthly-export-actions"><button type="button" className="secondary" disabled={exporting} onClick={()=>setExportOpen(false)}>Batal</button><button type="button" className="monthly-excel-confirm" disabled={exporting||!exportWeeks.length} onClick={()=>void exportMonthlyExcel()}><ExcelIcon/>{exporting?'Menyiapkan Excel…':'Export Excel'}</button></div>
  </div></div>:null

  const editPanel=editing&&editMode?<form id="monthly-edit-panel" className="panel daily-single-form monthly-inline-edit-panel" onSubmit={editMode==='details'?saveDetails:saveProgress}>
    <div className="daily-form-toolbar"><div><div className="eyebrow">{editMode==='details'?'EDIT MONTHLY PLAN':'UPDATE PROGRESS MANUAL'}</div><h3>{editing.planLineId} · {editing.pid}</h3><p className="muted">{editMode==='details'?'Periode, target dan atribut dapat diubah. Plan ID, PID, dan Activity tetap dikunci agar link Daily/Actual tidak putus.':'Progress manual adalah progress historis/eksternal yang belum memiliki Actual Plan.'}</p></div><button type="button" onClick={closeEdit}>Batal</button></div>
    {editMode==='details'?<>
      <div className="daily-form-group"><div className="daily-form-group-title"><span>01</span><div><strong>Periode & Target</strong><small>Pindahkan Monthly Plan antar bulan tanpa memutus Plan ID.</small></div></div><div className="plan-grid monthly-edit-period-grid">
        <label><span>Bulan</span><input type="month" value={editMonth} onChange={e=>setEditMonth(e.target.value)}/></label>
        <label><span>Week</span><select value={editWeek} onChange={e=>setEditWeek(e.target.value)}>{['W1','W2','W3','W4'].map(x=><option key={x}>{x}</option>)}</select></label>
        <label><span>Target Luas (Ha)</span><input type="number" min="0.0001" step="0.0001" value={editTarget} onChange={e=>setEditTarget(e.target.value)}/></label>
      </div></div>
      <div className="daily-form-group"><div className="daily-form-group-title"><span>02</span><div><strong>Detail Paddock</strong><small>Variety, stage, farm dan keterangan.</small></div></div><div className="plan-grid monthly-edit-detail-grid">
        <label><span>Variety</span><input value={editVariety} onChange={e=>setEditVariety(e.target.value)}/></label>
        <label><span>Master Variety</span><input value={editMasterVariety} onChange={e=>setEditMasterVariety(e.target.value)}/></label>
        <label><span>Stage</span><input value={editStage} onChange={e=>setEditStage(e.target.value)}/></label>
        <label><span>Farm</span><input value={editFarm} onChange={e=>setEditFarm(e.target.value)}/></label>
        <label className="plan-span-2"><span>Keterangan</span><input value={editNotes} onChange={e=>setEditNotes(e.target.value)}/></label>
      </div></div>
      <div className="daily-form-group monthly-edit-locked"><div className="daily-form-group-title"><span>03</span><div><strong>Identitas Terkunci</strong><small>Dipertahankan agar Daily dan Actual tetap terhubung.</small></div></div><div className="plan-grid">
        <label><span>Plan ID</span><input value={editing.planLineId} readOnly/></label><label><span>PID</span><input value={editing.pid} readOnly/></label><label><span>Activity</span><input value={editing.activity||editing.description} readOnly/></label>
      </div></div>
    </>:<div className="daily-form-group"><div className="daily-form-group-title"><span>01</span><div><strong>Progress Manual</strong><small>Ditambahkan ke Actual Plan terhubung.</small></div></div><div className="plan-grid">
      <label><span>Actual dari Actual Plan</span><input value={formatHa(editing.linkedActualAreaHa)} readOnly/></label>
      <label><span>Progress Manual / Historis (Ha)</span><input type="number" min="0" step="0.0001" value={progressManual} onChange={e=>setProgressManual(e.target.value)}/></label>
      <label><span>Total Actual setelah update</span><input value={formatHa(editing.linkedActualAreaHa+num(progressManual))} readOnly/></label>
      <label><span>Target</span><input value={formatHa(editing.targetAreaHa)} readOnly/></label>
      <label className="plan-span-2"><span>Catatan Progress</span><input value={progressNote} onChange={e=>setProgressNote(e.target.value)} placeholder="Contoh: progress sebelum penggunaan Actual Plan web"/></label>
    </div></div>}
    <div className="daily-single-form-actions"><button type="submit" className="primary" disabled={busy}>{busy?'Menyimpan…':editMode==='details'?'Simpan Perubahan Monthly':'Simpan Update Progress'}</button><button type="button" onClick={closeEdit}>Batal</button></div>
  </form>:null

  if(compact)return <section className="monthly-period-list">
    <div className="section-head compact-saved-head"><div><div className="eyebrow">MONTHLY PERIODE</div><h3>{selectedMonth||'-'} · {selectedWeek||'Semua Week'}</h3><p className="muted">{filtered.length} plan line · urutan terbaru di atas. Actual = linked Actual + progress manual.</p></div><div className="monthly-list-head-actions"><button type="button" className="monthly-excel-trigger" disabled={exporting} onClick={openExportDialog}><ExcelIcon/><span>Export Excel</span></button><YinYangRefreshButton busy={busy} label="Refresh" compact onClick={()=>void load()}/></div></div>
    {exportDialog}
    {message&&<div className="alert">{message}</div>}
    <div className={'panel monthly-quick-search premium-search-filter '+(searchingSource?'source-search-active':'')}><label><span>Cari Monthly Plan / Paddock</span><div className="monthly-quick-search-row"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cari seluruh sumber: PID / Plan Line / Activity / bulan / week…"/>{query&&<button type="button" onClick={()=>setQuery('')}>Clear</button>}</div>{searchingSource?<small className="monthly-source-search-info"><b>Search seluruh sumber Firestore</b> · filter periode/week/company/farm/status diabaikan · {sourceSearchBusy?'sedang membaca data…':sourceSearchLoaded?sourceCatalog.length+' plan line diperiksa · '+filtered.length+' hasil ditemukan':'menyiapkan pencarian…'}</small>:<small>Pencarian mengabaikan tanda '-' dan spasi. Ketik sesuatu untuk mencari seluruh sumber Monthly Plan, lintas bulan dan week.</small>}</label></div>
    <div className="cards compact-period-cards"><div className="card"><span>PLAN LINE</span><strong>{filtered.length}</strong></div><div className="card"><span>TARGET</span><strong>{formatHa(totals.target)}</strong></div><div className="card"><span>DAILY</span><strong>{formatHa(totals.scheduled)}</strong></div><div className="card"><span>ACTUAL</span><strong>{formatHa(totals.actual)}</strong></div></div>
    <div className="monthly-period-card-list">{filtered.map(row=>{const linkedDaily=dailyByMonthlyId.get(row.planLineId)||[],dailyDates=[...new Set(linkedDaily.map(item=>item.date).filter(Boolean))].sort();return <article className="monthly-period-card" key={row.id}><div><span className="eyebrow">{searchingSource?row.monthKey+' · ':''}{row.week} · {row.companyCode}</span><h4>{row.description||row.activity}</h4><p>📍 {row.pid} · {row.farm||'-'}{row.variety?' · '+row.variety:''}</p>{row.isCancelled&&<p className="muted">🚫 CANCELLED{row.cancelReason?' · '+row.cancelReason:''}</p>}{row.manualActualAreaHa>0&&<p className="muted">📝 Progress manual {formatHa(row.manualActualAreaHa)}</p>}</div><div className="monthly-period-metrics"><span>Target <b>{formatHa(row.targetAreaHa)}</b></span><span>Daily <b>{formatHa(row.scheduledAreaHa)}</b></span><span>Actual <b>{formatHa(row.systemActualAreaHa)}</b></span><span>Balance <b>{formatHa(row.systemBalanceHa)}</b></span><span>Status <b>{row.systemStatus}{row.isCancelled?' · CANCELLED':''}</b></span></div><div className="row-actions monthly-card-actions"><button type="button" className="monthly-daily-link-button" disabled={!linkedDaily.length} onClick={()=>setExpandedDailyPlanId(current=>current===row.planLineId?'':row.planLineId)}>Daily {linkedDaily.length?('('+dailyDates.length+' tgl)'):'(0)'}</button>{canWrite&&<><button type="button" disabled={busy} onClick={()=>startDetails(row)}>Edit</button><button type="button" disabled={busy||row.isCancelled} onClick={()=>startProgress(row)}>Update</button>{row.isCancelled?<button type="button" disabled={busy} onClick={()=>void reopenPlan(row)}>Buka Lagi</button>:<button type="button" className="danger" disabled={busy} onClick={()=>void cancelPlan(row)}>Cancel</button>}</>}{isOwner&&<button type="button" className="danger monthly-card-delete" disabled={busy} onClick={()=>void deleteRows([row],'Plan ID '+row.planLineId)}>Hapus</button>}</div>{expandedDailyPlanId===row.planLineId&&<div className="monthly-linked-daily"><div><strong>Daily Plan terkait</strong><span>{linkedDaily.length} record · {dailyDates.length} tanggal</span></div><div className="monthly-linked-daily-list">{dailyDates.map(date=>{const dateRows=linkedDaily.filter(item=>item.date===date),area=dateRows.reduce((sum,item)=>sum+item.areaHa,0);return <button type="button" key={date} onClick={()=>onOpenDailyPlan?.({date,monthlyPlanLineId:row.planLineId,pid:row.pid})}><span>📅 {shortDate(date)}</span><strong>{formatHa(area)}</strong><small>{dateRows.map(item=>'Shift '+(item.shift||'-')+(item.foreman?' · '+item.foreman:'')).filter((value,index,array)=>array.indexOf(value)===index).join(' | ')}</small><b>Buka Daily →</b></button>})}</div></div>}</article>})}</div>
    {!filtered.length&&<div className="daily-draft-empty">Belum ada Monthly Plan pada periode ini.</div>}
    {editPanel}
  </section>

  return <section>
    <div className="section-head"><div><div className="eyebrow">MONTHLY PLAN</div><h2>Daftar & Progress</h2><p className="muted">Actual sistem = Actual Plan terhubung + progress manual/historis. Cancel menutup sisa pekerjaan dan mengubah status sistem menjadi DONE tanpa membuat Actual palsu.</p></div><div style={{display:'flex',gap:10,flexWrap:'wrap'}}><button type="button" className="monthly-excel-trigger" disabled={exporting} onClick={openExportDialog}><ExcelIcon/><span>Export Excel</span></button><YinYangRefreshButton busy={busy} label="Refresh Progress" onClick={()=>void load()}/>{isOwner&&<button type="button" disabled={busy||!filtered.length} onClick={()=>void deleteRows(filtered,hasActiveFilter?'sesuai filter saat ini':'SEMUA Monthly Plan')} style={{borderColor:'#b91c1c',color:'#b91c1c'}}>{hasActiveFilter?'Hapus Sesuai Filter ('+filtered.length+')':'Hapus Semua Plan ('+filtered.length+')'}</button>}</div></div>
    {exportDialog}
    {message&&<div className="alert" style={{whiteSpace:'pre-line'}}>{message}</div>}
    <div className="panel premium-filter-panel compact-filter-panel" style={{marginTop:18}}><div className="premium-filter-grid filter-grid-auto">
      <label className="premium-filter-field"><span>Bulan</span><select value={month} onChange={e=>setMonth(e.target.value)}><option value="ALL">Semua Bulan</option>{months.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
      <label className="premium-filter-field"><span>Week</span><select value={week} onChange={e=>setWeek(e.target.value)}><option value="ALL">Semua Week</option>{['W1','W2','W3','W4'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label className="premium-filter-field"><span>Company</span><select value={company} onChange={e=>{setCompany(e.target.value);setFarm('ALL')}}><option value="ALL">Semua Company</option>{companies.map(x=><option key={x}>{x}</option>)}</select></label>
      <label className="premium-filter-field"><span>Farm</span><select value={farm} onChange={e=>setFarm(e.target.value)}><option value="ALL">Semua Farm</option>{farms.map(x=><option key={x}>{x}</option>)}</select></label>
      <label className="premium-filter-field"><span>Status Sistem</span><select value={status} onChange={e=>setStatus(e.target.value)}><option value="ALL">Semua Status</option>{statuses.map(x=><option key={x}>{x}</option>)}</select></label>
      <label className="premium-filter-field"><span>Cari</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Plan ID / PID / Activity / Variety"/></label>
    </div></div>
    <div className="cards" style={{marginTop:18}}><div className="card"><span>PLAN LINE</span><strong>{filtered.length}</strong></div><div className="card"><span>TARGET MONTHLY</span><strong>{formatHa(totals.target)}</strong></div><div className="card"><span>DAILY PLAN</span><strong>{formatHa(totals.scheduled)}</strong></div><div className="card"><span>BELUM DIJADWALKAN</span><strong style={{color:totals.unallocated<0?'#b91c1c':undefined}}>{formatHa(totals.unallocated)}</strong></div><div className="card"><span>ACTUAL</span><strong>{formatHa(totals.actual)}</strong></div><div className="card"><span>BALANCE ACTUAL</span><strong style={{color:totals.balance<0?'#b91c1c':undefined}}>{formatHa(totals.balance)}</strong></div></div>
    <div className="panel" style={{marginTop:18}}><div className="table-wrap"><table><thead><tr><th>Plan ID</th><th>Bulan / Week</th><th>Company / Farm</th><th>PID</th><th>Activity</th><th>Variety</th><th>Target</th><th>Daily Plan</th><th>Actual Linked</th><th>Manual</th><th>Balance</th><th>Progress</th><th>Status</th><th>Keterangan</th><th>Aksi</th></tr></thead><tbody>{filtered.map(row=><tr key={row.id}><td><strong>{row.planLineId}</strong></td><td>{row.monthKey}<br/><span className="muted">{row.week}</span></td><td>{row.companyCode||'-'}<br/><span className="muted">{row.farm||'-'}</span></td><td>{row.pid}<br/><span className="muted">{row.stage||'-'}</span></td><td>{row.description}<br/><span className="muted">{row.activity||'-'}</span></td><td>{row.variety||row.masterVariety||'-'}</td><td>{formatHa(row.targetAreaHa)}</td><td>{formatHa(row.scheduledAreaHa)}</td><td>{formatHa(row.linkedActualAreaHa)}</td><td>{formatHa(row.manualActualAreaHa)}</td><td>{formatHa(row.systemBalanceHa)}</td><td>{formatPct(row.progressPct)}</td><td><strong>{row.systemStatus}</strong>{row.isCancelled&&<><br/><span className="muted">CANCELLED</span></>}</td><td>{row.notes||'-'}{row.cancelReason&&<><br/><span className="muted">Cancel: {row.cancelReason}</span></>}</td><td><div className="row-actions">{canWrite&&<><button type="button" disabled={busy} onClick={()=>startDetails(row)}>Edit</button><button type="button" disabled={busy||row.isCancelled} onClick={()=>startProgress(row)}>Update</button>{row.isCancelled?<button type="button" disabled={busy} onClick={()=>void reopenPlan(row)}>Buka Lagi</button>:<button type="button" className="danger" disabled={busy} onClick={()=>void cancelPlan(row)}>Cancel</button>}</>}{isOwner&&<button type="button" className="danger" disabled={busy} onClick={()=>void deleteRows([row],'Plan ID '+row.planLineId)}>Hapus</button>}</div></td></tr>)}</tbody></table></div>{!filtered.length&&<p className="muted">Tidak ada record sesuai filter.</p>}</div>
    {editPanel}
    <div className="panel" style={{marginTop:18}}><h3>Riwayat Import Monthly Plan</h3><p className="muted">10 import terakhir.</p><div className="table-wrap"><table><thead><tr><th>Waktu</th><th>File</th><th>Total</th><th>C/U/N/P</th><th>Warning</th><th>Error</th><th>Oleh</th></tr></thead><tbody>{logs.map(log=><tr key={log.id}><td>{formatDateTime(log.importedAt)}</td><td>{log.sourceFileName}</td><td>{log.total}</td><td>{log.created}/{log.updated}/{log.unchanged}/{log.protected}</td><td>{log.warnings}</td><td>{log.errors}</td><td>{log.importedBy}</td></tr>)}</tbody></table></div>{!logs.length&&<p className="muted">Belum ada riwayat import Monthly Plan.</p>}</div>
  </section>
}
