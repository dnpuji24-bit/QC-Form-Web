import { ChangeEvent, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore'
import { firebaseAuth, firestoreDb } from './firebase'
import type { User } from './types'

type Props={user:User}
type ImportStatus='CREATE'|'UPDATE'|'NO_CHANGE'|'PROTECTED'
type IssueLevel='ERROR'|'WARNING'|'INFO'
type Issue={level:IssueLevel;item?:string;message:string}
type LinkStatus='LINKED'|'AMBIGUOUS'|'NOT_FOUND'|'NOT_APPLICABLE'
type SourceType='MONTHLY'|'ADHOC'|'SUPPORT'|'HISTORICAL'
type MaterialLine={slot:number;material:string;dosePerHa:number;doseUnit:string;totalMaterial:number;unit:string}
type DailyRef={id:string;dailyPlanId:string;sourcePlanIdRaw:string;date:string;shift:string;activity:string;paddockRaw:string;pid:string;areaHa:number;companyCode:string;farm:string;stage:string;masterVariety:string;monthlyPlanLineId:string}
type MonthlyRef={id:string;planLineId:string;monthLabel:string;week:string;description:string;pid:string;targetAreaHa:number;companyCode:string;farm:string;stage:string;masterVariety:string}
type MasterPaddock={pid:string;companyCode:string;farm:string;stage:string;variety:string;areaPaddockHa:number}
type Refs={daily:DailyRef[];monthlyByKey:Map<string,MonthlyRef[]>;paddocks:Map<string,MasterPaddock>}
type ParsedActual={
  docId:string;actualReportId:string;identityKey:string;sourceRow:number;dailySourcePlanIdRaw:string;monthlyLegacyPlanId:string;sourceType:SourceType
  dailyPlanId:string;dailyLinkStatus:LinkStatus;dailyCandidates:string[];monthlyPlanLineId:string;monthlyLinkStatus:LinkStatus;monthlyCandidates:string[]
  date:string;year:number;monthKey:string;shift:string;activity:string;paddockRaw:string;pid:string;actualAreaHa:number;areaUnit:string;manpower:number
  unitName:string;unitReady:number;unitStandby:number;unitBreakdown:number;foreman:string;notes:string;materials:MaterialLine[]
  plannedDailyAreaHa:number;dailyVarianceHa:number;companyCode:string;farm:string;stage:string;masterVariety:string;masterPending:boolean
}
type PreviewActual=ParsedActual&{importStatus:ImportStatus;changes:string[];previous?:Record<string,unknown>}
type ParsedFile={fileName:string;rows:ParsedActual[];issues:Issue[]}
type FirestoreProfile={active?:boolean;role?:string;username?:string}

function text(v:unknown){return v===null||v===undefined?'':String(v).trim()}
function normalized(v:unknown){return text(v).toLowerCase().replace(/\s+/g,' ')}
function num(v:unknown){if(typeof v==='number'&&Number.isFinite(v))return v;const raw=text(v);if(!raw)return 0;const cleaned=raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):raw;const n=Number(cleaned);return Number.isFinite(n)?n:0}
function pad(v:number){return String(v).padStart(2,'0')}
function excelDate(v:unknown){if(v instanceof Date&&!Number.isNaN(v.getTime()))return v.getFullYear()+'-'+pad(v.getMonth()+1)+'-'+pad(v.getDate());if(typeof v==='number'&&Number.isFinite(v)){const p=XLSX.SSF.parse_date_code(v);if(p)return p.y+'-'+pad(p.m)+'-'+pad(p.d)}const raw=text(v);if(!raw)return'';const d=new Date(raw);return Number.isNaN(d.getTime())?'':d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
function monthKeyFromDate(v:string){return /^\d{4}-\d{2}-\d{2}$/.test(v)?v.slice(0,7):''}
function normActivity(v:unknown){const s=normalized(v);if(['insectisida','insektisida','insecticide'].includes(s))return'insecticide';if(['knocdown','knockdown'].includes(s))return'knockdown';if(['top up','top-up','topup'].includes(s))return'top up';return s}
function activityShort(v:unknown){const s=normActivity(v);if(s.startsWith('pre'))return'pre';if(s.startsWith('post'))return'post';if(s.startsWith('top up'))return'topup';if(s.startsWith('top'))return'top';if(s.startsWith('single'))return'single';if(s.startsWith('bassalt'))return'bassalt';if(s.startsWith('insect'))return'insecticide';if(s.startsWith('knock'))return'knockdown';if(s.startsWith('water'))return'watering';return s.split(' ')[0]||''}
function normMonth(v:unknown){const s=normalized(v).replace(/\./g,'');const a:Record<string,string>={januari:'jan',jan:'jan',februari:'feb',feb:'feb',maret:'mar',mar:'mar',april:'apr',apr:'apr',mei:'mei',may:'mei',juni:'jun',jun:'jun',juli:'juli',jul:'juli',agustus:'agt',agu:'agt',ags:'agt',agt:'agt',aug:'agt',september:'sept',sept:'sept',sep:'sept',oktober:'okt',okt:'okt',oct:'okt',november:'nov',nov:'nov',desember:'des',des:'des',dec:'des'};return a[s]||s}
function compact(v:unknown){return text(v).toUpperCase().replace(/[^A-Z0-9]/g,'')}
function paddockSuffix(v:unknown){const p=text(v).toUpperCase().split('-').filter(Boolean);return p.length>=2?p.slice(-2).join('-'):text(v).toUpperCase()}
function legacyDailyKey(v:unknown){const p=text(v).split('-').filter(Boolean),wi=p.findIndex(x=>/^W[1-4]$/i.test(x));if(wi<1||wi+2>=p.length)return'';return normMonth(p[0])+'|'+p[wi].toUpperCase()+'|'+activityShort(p[wi+1])+'|'+compact(p.slice(wi+2).join('-'))}
function parseMonthlyLegacy(v:unknown){const s=text(v),p=s.split('-');if(p.length<5||!/^\d+$/.test(p[1]))return null;const rawTarget=p[p.length-1].replace(/\./g,'').replace(',','.');const target=Number(rawTarget);return{key:normMonth(p[0])+'|W'+p[1]+'|'+activityShort(p[2])+'|'+compact(p[p.length-3]+'-'+p[p.length-2]),target:Number.isFinite(target)?target:null}}
function monthlyKey(row:MonthlyRef){return normMonth(row.monthLabel)+'|'+text(row.week).toUpperCase()+'|'+activityShort(row.description)+'|'+compact(paddockSuffix(row.pid))}
function sourceType(dailyId:string,legacy:string,activity:string):SourceType{if(dailyId==='0')return'ADHOC';if(legacyDailyKey(dailyId)||parseMonthlyLegacy(legacy))return'MONTHLY';if(dailyId||legacy||['watering','knockdown','top up'].includes(normActivity(activity)))return'SUPPORT';return'HISTORICAL'}
function fnv1a(v:string){let h=0x811c9dc5;for(let i=0;i<v.length;i++){h^=v.charCodeAt(i);h=Math.imul(h,0x01000193)}return(h>>>0).toString(36).toUpperCase()}
function actualId(date:string,key:string,occ:number){return'AR-'+(date.replaceAll('-','')||'UNKNOWN')+'-'+fnv1a(key)+(occ>1?'-'+occ:'')}
function canonical(v:unknown):unknown{if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v as Record<string,unknown>).filter(([,x])=>x!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,canonical(x)]));return v}
function same(a:unknown,b:unknown){return JSON.stringify(canonical(a))===JSON.stringify(canonical(b))}
function formatHa(v:number,d=2){return new Intl.NumberFormat('id-ID',{minimumFractionDigits:d,maximumFractionDigits:d}).format(v)+' Ha'}
function headerIndexes(headers:unknown[],name:string){const n=normalized(name),out:number[]=[];headers.forEach((h,i)=>{if(normalized(h)===n)out.push(i)});return out}
function firstIndex(headers:unknown[],name:string){return headers.findIndex(h=>normalized(h)===normalized(name))}
function cell(row:unknown[],idx:number){return idx>=0?row[idx]:null}
function identityKey(date:string,dailySource:string,legacy:string,activity:string,shift:string,paddock:string,unitName:string,foreman:string){return[date,dailySource||legacy,normActivity(activity),shift,text(paddock).toUpperCase(),normalized(unitName),normalized(foreman)].join('¦')}

function parseMaterials(row:unknown[],headers:unknown[],area:number){
  const result:MaterialLine[]=[]
  for(let slot=1;slot<=5;slot++){const bi=firstIndex(headers,'Bahan '+slot),di=firstIndex(headers,'Dosis '+slot),ui=firstIndex(headers,'UoM '+slot);const material=text(cell(row,bi)),dose=num(cell(row,di)),doseUnit=text(cell(row,ui));if(!material&&!dose&&!doseUnit)continue;result.push({slot,material,dosePerHa:dose,doseUnit,totalMaterial:area*dose,unit:''})}
  return result
}

async function writerContext(appUser:User){const db=firestoreDb,auth=firebaseAuth;if(!db||!auth)throw new Error('Firebase belum terkonfigurasi.');const current=auth.currentUser;if(!current)throw new Error('Firebase Auth belum terhubung. Login ulang terlebih dahulu.');const snap=await getDoc(doc(db,'users',current.uid));if(!snap.exists())throw new Error('Profil Firebase user tidak ditemukan.');const profile=snap.data() as FirestoreProfile;if(profile.active!==true)throw new Error('Profil Firebase tidak aktif.');if(!['owner','asisten'].includes(profile.role||'')||!['owner','asisten'].includes(appUser.role))throw new Error('Role tidak memiliki izin import Actual Plan.');return{db,username:profile.username||appUser.username}}

async function loadRefs():Promise<Refs>{
  if(!firestoreDb)throw new Error('Firestore belum tersedia.')
  const[dailySnap,monthlySnap,paddockSnap]=await Promise.all([getDocs(collection(firestoreDb,'daily_plans')),getDocs(collection(firestoreDb,'monthly_plans')),getDocs(collection(firestoreDb,'master_paddocks'))])
  const daily=dailySnap.docs.map(x=>{const d=x.data() as Record<string,unknown>;return{id:x.id,dailyPlanId:text(d.dailyPlanId||x.id),sourcePlanIdRaw:text(d.sourcePlanIdRaw),date:text(d.date),shift:text(d.shift),activity:text(d.activity),paddockRaw:text(d.paddockRaw),pid:text(d.pid),areaHa:num(d.areaHa),companyCode:text(d.companyCode),farm:text(d.farm),stage:text(d.stage),masterVariety:text(d.masterVariety),monthlyPlanLineId:text(d.monthlyPlanLineId)}})
  const monthlyByKey=new Map<string,MonthlyRef[]>()
  monthlySnap.docs.forEach(x=>{const d=x.data() as Record<string,unknown>,row:MonthlyRef={id:x.id,planLineId:text(d.planLineId||x.id),monthLabel:text(d.monthLabel),week:text(d.week),description:text(d.description),pid:text(d.pid),targetAreaHa:num(d.targetAreaHa),companyCode:text(d.companyCode),farm:text(d.farm),stage:text(d.stage),masterVariety:text(d.masterVariety||d.variety)},key=monthlyKey(row),list=monthlyByKey.get(key)||[];list.push(row);monthlyByKey.set(key,list)})
  const paddocks=new Map<string,MasterPaddock>()
  paddockSnap.docs.forEach(x=>{const d=x.data() as Record<string,unknown>,pid=text(d.pid||x.id).toUpperCase();paddocks.set(pid,{pid,companyCode:text(d.companyCode),farm:text(d.farm),stage:text(d.currentStage||d.stage),variety:text(d.variety),areaPaddockHa:num(d.areaPlantedHa||d.areaPaddockHa)})})
  return{daily,monthlyByKey,paddocks}
}

function uniqueNearestByArea(candidates:DailyRef[],areaHa:number){
  if(!candidates.length)return null
  const ranked=candidates.map(row=>({row,diff:Math.abs(row.areaHa-areaHa)})).sort((a,b)=>a.diff-b.diff)
  if(ranked.length===1||ranked[0].diff<ranked[1].diff-0.000001)return ranked[0].row
  return null
}
function resolveDaily(dailySource:string,date:string,activity:string,shift:string,paddock:string,areaHa:number,refs:Refs){
  const samePlan=refs.daily.filter(d=>normalized(d.sourcePlanIdRaw)===normalized(dailySource))
  if(samePlan.length){
    const sameWork=samePlan.filter(d=>normActivity(d.activity)===normActivity(activity)&&compact(d.paddockRaw)===compact(paddock))
    if(sameWork.length===1)return{status:'LINKED' as LinkStatus,row:sameWork[0],candidates:sameWork}
    if(sameWork.length>1){
      const sameDate=sameWork.filter(d=>d.date===date)
      if(sameDate.length===1)return{status:'LINKED' as LinkStatus,row:sameDate[0],candidates:sameWork}
      const sameDateShift=sameDate.filter(d=>text(d.shift)===text(shift))
      if(sameDateShift.length===1)return{status:'LINKED' as LinkStatus,row:sameDateShift[0],candidates:sameWork}
      const sameShift=sameWork.filter(d=>text(d.shift)===text(shift))
      if(sameShift.length===1)return{status:'LINKED' as LinkStatus,row:sameShift[0],candidates:sameWork}
      const nearest=uniqueNearestByArea(sameDateShift.length?sameDateShift:sameDate.length?sameDate:sameShift.length?sameShift:sameWork,areaHa)
      if(nearest)return{status:'LINKED' as LinkStatus,row:nearest,candidates:sameWork}
      return{status:'AMBIGUOUS' as LinkStatus,row:null,candidates:sameWork}
    }
  }

  const fallback=refs.daily.filter(d=>d.date===date&&normActivity(d.activity)===normActivity(activity)&&compact(d.paddockRaw)===compact(paddock))
  if(fallback.length===1)return{status:'LINKED' as LinkStatus,row:fallback[0],candidates:fallback}
  if(fallback.length>1){
    const sameShift=fallback.filter(d=>text(d.shift)===text(shift))
    if(sameShift.length===1)return{status:'LINKED' as LinkStatus,row:sameShift[0],candidates:fallback}
    const nearest=uniqueNearestByArea(sameShift.length?sameShift:fallback,areaHa)
    if(nearest)return{status:'LINKED' as LinkStatus,row:nearest,candidates:fallback}
    return{status:'AMBIGUOUS' as LinkStatus,row:null,candidates:fallback}
  }
  return{status:'NOT_FOUND' as LinkStatus,row:null,candidates:[] as DailyRef[]}
}
function resolveMonthly(dailySource:string,legacy:string,areaHa:number,refs:Refs){
  const parsedLegacy=parseMonthlyLegacy(legacy)
  const key=parsedLegacy?.key||legacyDailyKey(dailySource)
  if(!key)return{status:'NOT_APPLICABLE' as LinkStatus,row:null as MonthlyRef|null,candidates:[] as MonthlyRef[]}
  const candidates=refs.monthlyByKey.get(key)||[]
  if(candidates.length===1)return{status:'LINKED' as LinkStatus,row:candidates[0],candidates}
  const target=parsedLegacy?.target??areaHa
  if(candidates.length>1){const exact=candidates.filter(x=>Math.abs(x.targetAreaHa-target)<=0.02);if(exact.length===1)return{status:'LINKED' as LinkStatus,row:exact[0],candidates}}
  return{status:(candidates.length?'AMBIGUOUS':'NOT_FOUND') as LinkStatus,row:null,candidates}
}

function parseWorkbook(buffer:ArrayBuffer,fileName:string,refs:Refs):ParsedFile{
  const wb=XLSX.read(buffer,{type:'array',cellDates:true}),sheet=wb.Sheets[wb.SheetNames[0]];if(!sheet)throw new Error('Workbook tidak memiliki sheet yang bisa dibaca.')
  const matrix=XLSX.utils.sheet_to_json<unknown[]>(sheet,{header:1,defval:null,raw:true});if(matrix.length<2)throw new Error('Sheet Actual Plan kosong.')
  const headers=matrix[0],planCols=headerIndexes(headers,'Plan ID'),dateI=firstIndex(headers,'Tanggal'),activityI=firstIndex(headers,'Kegiatan'),shiftI=firstIndex(headers,'Shift'),paddockI=firstIndex(headers,'Paddock'),areaI=firstIndex(headers,'Luas'),haI=firstIndex(headers,'Ha'),manpowerI=firstIndex(headers,'Tenaga Kerja'),unitI=firstIndex(headers,'Nama Unit'),readyI=firstIndex(headers,'Ready'),standbyI=firstIndex(headers,'Standby'),breakdownI=firstIndex(headers,'Breakdown'),foremanI=firstIndex(headers,'Mandor'),notesI=firstIndex(headers,'Catatan')
  const missing=[['Tanggal',dateI],['Kegiatan',activityI],['Paddock',paddockI],['Luas',areaI]].filter(([,i])=>(i as number)<0).map(([n])=>n as string);if(missing.length)throw new Error('Header wajib belum lengkap: '+missing.join(', ')+'.')
  if(planCols.length<1)throw new Error('Header Plan ID tidak ditemukan.')
  const issues:Issue[]=[],rows:ParsedActual[]=[],occurrences=new Map<string,number>()
  matrix.slice(1).forEach((r,index)=>{
    const sourceRow=index+2,date=excelDate(cell(r,dateI)),activity=text(cell(r,activityI)),paddockRaw=text(cell(r,paddockI)).toUpperCase(),actualAreaHa=num(cell(r,areaI))
    const dailyRaw=text(cell(r,planCols[0])),secondRaw=planCols.length>1?text(cell(r,planCols[1])):'',legacy=parseMonthlyLegacy(secondRaw)?secondRaw:'',supportFromSecond=!legacy?secondRaw:''
    const dailySourcePlanIdRaw=dailyRaw!==''?dailyRaw:supportFromSecond
    if(!date&&!activity&&!paddockRaw&&!actualAreaHa&&!dailyRaw&&!secondRaw)return
    if(!date||!activity||!paddockRaw){issues.push({level:'ERROR',item:'Baris '+sourceRow,message:'Tanggal, Kegiatan, dan Paddock wajib terisi.'});return}
    if(actualAreaHa<0)issues.push({level:'ERROR',item:'Baris '+sourceRow,message:'Luas aktual tidak boleh negatif.'})
    const shift=text(cell(r,shiftI)),unitName=text(cell(r,unitI)),foreman=text(cell(r,foremanI)),key=identityKey(date,dailySourcePlanIdRaw,legacy,activity,shift,paddockRaw,unitName,foreman),occ=(occurrences.get(key)||0)+1;occurrences.set(key,occ)
    if(occ>1)issues.push({level:'INFO',item:'Baris '+sourceRow,message:'Identitas inti Actual sama dengan record sebelumnya; sistem membuat Actual Report ID terpisah dengan urutan '+occ+'.'})
    const dailyRes=resolveDaily(dailySourcePlanIdRaw,date,activity,shift,paddockRaw,actualAreaHa,refs)
    const directMonthly=resolveMonthly(dailySourcePlanIdRaw,legacy,actualAreaHa,refs),dailyRow=dailyRes.row
    let monthlyRow:MonthlyRef|null=null,monthlyLinkStatus:LinkStatus='NOT_APPLICABLE',monthlyCandidates:string[]=[]
    if(dailyRow?.monthlyPlanLineId){monthlyLinkStatus='LINKED';monthlyCandidates=[dailyRow.monthlyPlanLineId]}
    else if(directMonthly.row){monthlyRow=directMonthly.row;monthlyLinkStatus='LINKED';monthlyCandidates=directMonthly.candidates.map(x=>x.planLineId)}
    else{monthlyLinkStatus=directMonthly.status;monthlyCandidates=directMonthly.candidates.map(x=>x.planLineId)}
    if(dailyRes.status==='NOT_FOUND')issues.push({level:'INFO',item:'Baris '+sourceRow,message:'DAILY PLAN PENDING — Actual belum menemukan pasangan Daily Plan yang unik. Data historis tetap boleh diimport.'})
    if(dailyRes.status==='AMBIGUOUS')issues.push({level:'INFO',item:'Baris '+sourceRow,message:'DAILY PLAN AMBIGUOUS — ditemukan '+dailyRes.candidates.length+' kandidat Daily Plan. Import tidak memaksa link.'})
    if(directMonthly.status==='AMBIGUOUS'&&!dailyRow?.monthlyPlanLineId)issues.push({level:'INFO',item:legacy,message:'MONTHLY AMBIGUOUS — ditemukan '+directMonthly.candidates.length+' kandidat Monthly Plan.'})
    const pid=(dailyRow?.pid||monthlyRow?.pid||paddockRaw).toUpperCase(),master=refs.paddocks.get(pid),masterPending=!master
    const plannedDailyAreaHa=dailyRow?.areaHa||0,dailyVarianceHa=plannedDailyAreaHa?plannedDailyAreaHa-actualAreaHa:0
    rows.push({docId:actualId(date,key,occ),actualReportId:actualId(date,key,occ),identityKey:key,sourceRow,dailySourcePlanIdRaw,monthlyLegacyPlanId:legacy,sourceType:sourceType(dailySourcePlanIdRaw,legacy,activity),dailyPlanId:dailyRow?.dailyPlanId||'',dailyLinkStatus:dailyRes.status,dailyCandidates:dailyRes.candidates.map(x=>x.dailyPlanId),monthlyPlanLineId:dailyRow?.monthlyPlanLineId||monthlyRow?.planLineId||'',monthlyLinkStatus,monthlyCandidates,date,year:Number(date.slice(0,4))||0,monthKey:monthKeyFromDate(date),shift,activity,paddockRaw,pid,actualAreaHa,areaUnit:text(cell(r,haI))||'Ha',manpower:num(cell(r,manpowerI)),unitName,unitReady:num(cell(r,readyI)),unitStandby:num(cell(r,standbyI)),unitBreakdown:num(cell(r,breakdownI)),foreman,notes:text(cell(r,notesI)),materials:parseMaterials(r,headers,actualAreaHa),plannedDailyAreaHa,dailyVarianceHa,companyCode:dailyRow?.companyCode||monthlyRow?.companyCode||master?.companyCode||'',farm:dailyRow?.farm||monthlyRow?.farm||master?.farm||'',stage:dailyRow?.stage||monthlyRow?.stage||master?.stage||'',masterVariety:dailyRow?.masterVariety||monthlyRow?.masterVariety||master?.variety||'',masterPending})
  })
  rows.sort((a,b)=>a.date.localeCompare(b.date)||a.shift.localeCompare(b.shift)||a.pid.localeCompare(b.pid,undefined,{numeric:true})||a.activity.localeCompare(b.activity))
  return{fileName,rows,issues}
}

function importedShape(r:ParsedActual){return{actualReportId:r.actualReportId,identityKey:r.identityKey,dailySourcePlanIdRaw:r.dailySourcePlanIdRaw,monthlyLegacyPlanId:r.monthlyLegacyPlanId,sourceType:r.sourceType,dailyPlanId:r.dailyPlanId,dailyLinkStatus:r.dailyLinkStatus,monthlyPlanLineId:r.monthlyPlanLineId,monthlyLinkStatus:r.monthlyLinkStatus,date:r.date,year:r.year,monthKey:r.monthKey,shift:r.shift,activity:r.activity,paddockRaw:r.paddockRaw,pid:r.pid,actualAreaHa:r.actualAreaHa,areaUnit:r.areaUnit,manpower:r.manpower,unitName:r.unitName,unitReady:r.unitReady,unitStandby:r.unitStandby,unitBreakdown:r.unitBreakdown,foreman:r.foreman,notes:r.notes,materials:r.materials,plannedDailyAreaHa:r.plannedDailyAreaHa,dailyVarianceHa:r.dailyVarianceHa,companyCode:r.companyCode,farm:r.farm,stage:r.stage,masterVariety:r.masterVariety,masterPending:r.masterPending}}
function existingShape(d:Record<string,unknown>){return{actualReportId:text(d.actualReportId),identityKey:text(d.identityKey),dailySourcePlanIdRaw:text(d.dailySourcePlanIdRaw),monthlyLegacyPlanId:text(d.monthlyLegacyPlanId),sourceType:text(d.sourceType),dailyPlanId:text(d.dailyPlanId),dailyLinkStatus:text(d.dailyLinkStatus),monthlyPlanLineId:text(d.monthlyPlanLineId),monthlyLinkStatus:text(d.monthlyLinkStatus),date:text(d.date),year:num(d.year),monthKey:text(d.monthKey),shift:text(d.shift),activity:text(d.activity),paddockRaw:text(d.paddockRaw),pid:text(d.pid),actualAreaHa:num(d.actualAreaHa),areaUnit:text(d.areaUnit),manpower:num(d.manpower),unitName:text(d.unitName),unitReady:num(d.unitReady),unitStandby:num(d.unitStandby),unitBreakdown:num(d.unitBreakdown),foreman:text(d.foreman),notes:text(d.notes),materials:Array.isArray(d.materials)?d.materials:[],plannedDailyAreaHa:num(d.plannedDailyAreaHa),dailyVarianceHa:num(d.dailyVarianceHa),companyCode:text(d.companyCode),farm:text(d.farm),stage:text(d.stage),masterVariety:text(d.masterVariety),masterPending:d.masterPending===true}}
function diffKeys(prev:Record<string,unknown>,r:ParsedActual){const a=existingShape(prev),b=importedShape(r),out:string[]=[];Object.keys(b).forEach(k=>{if(!same(a[k as keyof typeof a],b[k as keyof typeof b]))out.push(k)});return out}
async function compareFirestore(parsed:ParsedFile){if(!firestoreDb)throw new Error('Firestore belum tersedia.');const snap=await getDocs(collection(firestoreDb,'daily_reports')),existing=new Map(snap.docs.map(x=>[x.id,x.data() as Record<string,unknown>]));return parsed.rows.map(r=>{const previous=existing.get(r.docId);if(!previous)return{...r,importStatus:'CREATE' as ImportStatus,changes:[]};const changes=diffKeys(previous,r);if(!changes.length)return{...r,importStatus:'NO_CHANGE' as ImportStatus,changes,previous};if(text(previous.lastModifiedSource).toUpperCase()==='WEB')return{...r,importStatus:'PROTECTED' as ImportStatus,changes,previous};return{...r,importStatus:'UPDATE' as ImportStatus,changes,previous}})}
function chunks<T>(items:T[],size:number){const out:T[][]=[];for(let i=0;i<items.length;i+=size)out.push(items.slice(i,i+size));return out}

export default function ActualPlanImportPanel({user}:Props){
  const[parsed,setParsed]=useState<ParsedFile|null>(null),[preview,setPreview]=useState<PreviewActual[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
  const isOwner=user.role==='owner'
  const counts=useMemo(()=>({total:preview.length,dailyLinked:preview.filter(x=>x.dailyLinkStatus==='LINKED').length,dailyPending:preview.filter(x=>x.dailyLinkStatus!=='LINKED').length,monthlyLinked:preview.filter(x=>x.monthlyPlanLineId).length,masterPending:preview.filter(x=>x.masterPending).length,monthly:preview.filter(x=>x.sourceType==='MONTHLY').length,adhoc:preview.filter(x=>x.sourceType==='ADHOC').length,support:preview.filter(x=>x.sourceType==='SUPPORT').length,create:preview.filter(x=>x.importStatus==='CREATE').length,update:preview.filter(x=>x.importStatus==='UPDATE').length,unchanged:preview.filter(x=>x.importStatus==='NO_CHANGE').length,protected:preview.filter(x=>x.importStatus==='PROTECTED').length,warnings:parsed?.issues.filter(x=>x.level==='WARNING').length||0,errors:parsed?.issues.filter(x=>x.level==='ERROR').length||0}),[preview,parsed])
  async function onFile(e:ChangeEvent<HTMLInputElement>){const file=e.target.files?.[0];if(!file)return;setBusy(true);setMessage('Membaca Actual Plan dan mencocokkan Daily Plan…');try{const refs=await loadRefs(),next=parseWorkbook(await file.arrayBuffer(),file.name,refs),p=await compareFirestore(next);setParsed(next);setPreview(p);setMessage('Preview siap: '+next.rows.length+' Actual; '+p.filter(x=>x.importStatus==='CREATE').length+' CREATE / '+p.filter(x=>x.importStatus==='UPDATE').length+' UPDATE / '+p.filter(x=>x.importStatus==='NO_CHANGE').length+' NO CHANGE / '+p.filter(x=>x.importStatus==='PROTECTED').length+' PROTECTED.')}catch(err){setParsed(null);setPreview([]);setMessage(err instanceof Error?err.message:'File Actual Plan gagal dibaca.')}finally{setBusy(false)}}
  async function refresh(){if(!parsed)return;setBusy(true);try{const p=await compareFirestore(parsed);setPreview(p);setMessage('Perbandingan selesai: '+p.filter(x=>x.importStatus==='CREATE').length+' CREATE / '+p.filter(x=>x.importStatus==='UPDATE').length+' UPDATE / '+p.filter(x=>x.importStatus==='NO_CHANGE').length+' NO CHANGE / '+p.filter(x=>x.importStatus==='PROTECTED').length+' PROTECTED.')}catch(err){setMessage(err instanceof Error?err.message:'Perbandingan gagal.')}finally{setBusy(false)}}

  async function deleteExcelData(){
    if(!isOwner){setMessage('Hanya Owner yang boleh menghapus data Excel Actual Plan.');return}
    setBusy(true);setMessage('Memeriksa data Excel Actual Plan di Firestore…')
    try{
      const{db}=await writerContext(user),snap=await getDocs(collection(db,'daily_reports'))
      const excelDocs=snap.docs.filter(item=>{const data=item.data() as Record<string,unknown>,origin=text(data.sourceOrigin).toUpperCase();return origin==='EXCEL'||(!origin&&(text(data.sourceFileName)||text(data.lastImportBatchId)))})
      if(!excelDocs.length){setMessage('Tidak ada Actual Plan yang berasal dari import Excel. Data Web tidak diubah.');return}
      const webEdited=excelDocs.filter(item=>text((item.data() as Record<string,unknown>).lastModifiedSource).toUpperCase()==='WEB').length
      const expected='HAPUS ACTUAL '+excelDocs.length
      const answer=window.prompt('Akan menghapus '+excelDocs.length+' Actual Plan / Daily Report yang berasal dari Excel. Data yang dibuat langsung dari Web tetap dipertahankan.'+(webEdited?'\n\nPERHATIAN: '+webEdited+' record asal Excel pernah diedit melalui Web dan ikut dihapus agar dataset Excel dapat diganti penuh.':'')+'\n\nKetik '+expected+' untuk lanjut.','')
      if(answer!==expected){setMessage('Penghapusan dibatalkan.');return}
      for(const part of chunks(excelDocs,400)){const batch=writeBatch(db);part.forEach(item=>batch.delete(item.ref));await batch.commit()}
      if(parsed){const next=await compareFirestore(parsed);setPreview(next)}
      else setPreview([])
      setMessage('Hapus selesai: '+excelDocs.length+' Actual Plan asal Excel dihapus. Data Web dipertahankan. Sekarang file Actual Plan terbaru dapat diimport.')
    }catch(error){setMessage(error instanceof Error?error.message:'Gagal menghapus data Excel Actual Plan.')}finally{setBusy(false)}
  }

  async function confirmImport(){if(!parsed||!preview.length)return;if(counts.errors){setMessage('Import diblokir karena masih ada '+counts.errors+' ERROR.');return}const writable=preview.filter(x=>x.importStatus==='CREATE'||x.importStatus==='UPDATE');if(!writable.length){setMessage('Tidak ada data yang perlu ditulis.');return}const ok=window.prompt('Akan menulis '+writable.length+' Actual Plan ke Daily Report. Record Daily Plan Pending tetap boleh masuk. Ketik IMPORT untuk lanjut.','');if(ok!=='IMPORT')return;setBusy(true);try{const{db,username}=await writerContext(user),batchId='AR-'+Date.now();for(const part of chunks(writable,400)){const batch=writeBatch(db);part.forEach(r=>{const prev=r.previous||{},payload:Record<string,unknown>={...importedShape(r),dailyCandidates:r.dailyCandidates,monthlyCandidates:r.monthlyCandidates,sourceRow:r.sourceRow,sourceOrigin:text(prev.sourceOrigin)||'EXCEL',lastModifiedSource:'EXCEL',sourceFileName:parsed.fileName,lastImportBatchId:batchId,importedAt:serverTimestamp(),updatedAt:serverTimestamp(),updatedBy:username};if(r.importStatus==='CREATE'){payload.createdAt=serverTimestamp();payload.createdBy=username}batch.set(doc(db,'daily_reports',r.docId),payload,{merge:true})});await batch.commit()}await setDoc(doc(db,'actual_plan_import_logs',batchId),{batchId,sourceFileName:parsed.fileName,total:preview.length,created:counts.create,updated:counts.update,unchanged:counts.unchanged,protected:counts.protected,dailyLinked:counts.dailyLinked,dailyPending:counts.dailyPending,monthlyLinked:counts.monthlyLinked,masterPending:counts.masterPending,warnings:counts.warnings,errors:counts.errors,importedBy:username,importedAt:serverTimestamp()});const next=await compareFirestore(parsed);setPreview(next);setMessage('Import selesai. Ditulis '+writable.length+' Actual. Verifikasi: '+next.filter(x=>x.importStatus==='NO_CHANGE').length+' NO CHANGE, '+next.filter(x=>x.importStatus==='PROTECTED').length+' PROTECTED.')}catch(err){setMessage(err instanceof Error?err.message:'Import Actual Plan gagal.')}finally{setBusy(false)}}
  return <section>
    <div className="section-head"><div><div className="eyebrow">ACTUAL PLAN</div><h2>Update / Import Excel</h2><p className="muted">Actual disimpan sebagai Daily Report terpisah; Daily Plan dan Monthly Plan tidak diubah saat import. Link Daily Plan memprioritaskan Plan ID + kegiatan + paddock, lalu tanggal/shift/luas sebagai pembeda. Plan ID yang mengikuti pola Monthly juga dicocokkan langsung ke Monthly Plan.</p></div></div>
    <div className="panel"><label><span>File Actual Plan (.xlsx / .xls)</span><input type="file" accept=".xlsx,.xls" onChange={onFile} disabled={busy}/></label><div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:14}}><button type="button" onClick={()=>void refresh()} disabled={busy||!parsed}>Bandingkan Firestore</button><button type="button" className="primary" onClick={()=>void confirmImport()} disabled={busy||!preview.length}>Confirm Import Firestore</button>{isOwner&&<button type="button" onClick={()=>void deleteExcelData()} disabled={busy} style={{borderColor:'#b91c1c',color:'#b91c1c'}}>Hapus Data Excel Actual Plan</button>}</div><p className="muted" style={{marginTop:10}}>Hapus Data Excel hanya menghapus Actual yang berasal dari import Excel. Actual yang dibuat langsung melalui Web tetap dipertahankan.</p>{message&&<div className="alert" style={{marginTop:14}}>{message}</div>}</div>
    {parsed&&<><div className="cards" style={{marginTop:18}}><div className="card"><span>ACTUAL</span><strong>{counts.total}</strong></div><div className="card"><span>DAILY LINKED</span><strong>{counts.dailyLinked}</strong></div><div className="card"><span>DAILY PENDING</span><strong>{counts.dailyPending}</strong></div><div className="card"><span>MONTHLY LINKED</span><strong>{counts.monthlyLinked}</strong></div><div className="card"><span>MASTER PENDING</span><strong>{counts.masterPending}</strong></div><div className="card"><span>CREATE</span><strong>{counts.create}</strong></div><div className="card"><span>UPDATE</span><strong>{counts.update}</strong></div><div className="card"><span>NO CHANGE</span><strong>{counts.unchanged}</strong></div><div className="card"><span>PROTECTED</span><strong>{counts.protected}</strong></div><div className="card"><span>WARNING</span><strong>{counts.warnings}</strong></div><div className="card"><span>ERROR</span><strong>{counts.errors}</strong></div></div>
    {parsed.issues.length>0&&<div className="panel" style={{marginTop:18}}><h3>Data Quality</h3><p className="muted">DAILY PLAN PENDING dan MONTHLY AMBIGUOUS adalah INFO dan tidak memblokir data historis.</p><div className="table-wrap"><table><thead><tr><th>Level</th><th>Item</th><th>Keterangan</th></tr></thead><tbody>{parsed.issues.slice(0,250).map((x,i)=><tr key={i}><td><strong>{x.level}</strong></td><td>{x.item||'-'}</td><td>{x.message}</td></tr>)}</tbody></table></div></div>}
    <div className="panel" style={{marginTop:18}}><h3>Preview Actual</h3><div className="table-wrap"><table><thead><tr><th>Status</th><th>Actual ID</th><th>Tanggal</th><th>Plan ID Daily</th><th>Plan ID Legacy</th><th>PID</th><th>Kegiatan</th><th>Actual</th><th>Daily Plan</th><th>Monthly Plan</th><th>Mandor</th></tr></thead><tbody>{preview.slice(0,300).map(r=><tr key={r.docId}><td><strong>{r.importStatus}</strong></td><td>{r.actualReportId}</td><td>{r.date}</td><td>{r.dailySourcePlanIdRaw||'-'}</td><td>{r.monthlyLegacyPlanId||'-'}</td><td>{r.pid}</td><td>{r.activity}</td><td>{formatHa(r.actualAreaHa)}</td><td>{r.dailyLinkStatus}<br/><span className="muted">{r.dailyPlanId||'-'}</span></td><td>{r.monthlyLinkStatus}<br/><span className="muted">{r.monthlyPlanLineId||'-'}</span></td><td>{r.foreman||'-'}</td></tr>)}</tbody></table></div>{preview.length>300&&<p className="muted">Menampilkan 300 dari {preview.length} Actual.</p>}</div></>}
  </section>
}
