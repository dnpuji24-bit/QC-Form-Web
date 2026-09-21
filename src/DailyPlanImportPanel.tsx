import { ChangeEvent, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore'
import { firebaseAuth, firestoreDb } from './firebase'
import { FALLBACK_COMPANIES, type CompanyRecord } from './companyMaster'
import type { User } from './types'

type Props={user:User}
type SheetRow=Record<string,unknown>
type ImportStatus='CREATE'|'UPDATE'|'NO_CHANGE'|'PROTECTED'
type IssueLevel='ERROR'|'WARNING'|'INFO'
type Issue={level:IssueLevel;item?:string;message:string}
type SourceType='MONTHLY'|'ADHOC'|'SUPPORT'
type MonthlyLinkStatus='LINKED'|'AMBIGUOUS'|'NOT_FOUND'|'NOT_APPLICABLE'
type MaterialLine={slot:number;material:string;dosePerHa:number;doseUnit:string;totalMaterial:number;unit:string}
type MasterPaddock={pid:string;companyCode:string;farm:string;variety:string;stage:string;areaPaddockHa:number}
type MonthlyPlanRef={id:string;planLineId:string;monthLabel:string;week:string;description:string;pid:string;targetAreaHa:number;companyCode:string;farm:string;stage:string;areaPaddockHa:number;masterVariety:string;masterActivityId:string;activityCode:string;type:string;activityCategory:string;componentsSnapshot:unknown[]}
type MasterRefs={paddocks:Map<string,MasterPaddock>;paddockSuffixes:Map<string,MasterPaddock[]>;monthlyByLegacyKey:Map<string,MonthlyPlanRef[]>;companies:CompanyRecord[]}
type ParsedDaily={
  docId:string;dailyPlanId:string;identityKey:string;sourceRow:number;sourcePlanIdRaw:string;sourceType:SourceType;monthlyLinkStatus:MonthlyLinkStatus;monthlyPlanLineId:string;monthlyCandidates:string[]
  date:string;year:number;monthKey:string;shift:string;activity:string;description:string;paddockRaw:string;pid:string;areaHa:number;areaUnit:string;manpower:number
  unitName:string;unitReady:number;unitStandby:number;unitBreakdown:number;foreman:string;notes:string
  companyCode:string;farm:string;stage:string;areaPaddockHa:number;masterVariety:string;masterPending:boolean
  masterActivityId:string;activityCode:string;type:string;activityCategory:string;componentsSnapshot:unknown[]
  materials:MaterialLine[]
}
type PreviewDaily=ParsedDaily&{importStatus:ImportStatus;changes:string[];previous?:Record<string,unknown>}
type ParsedFile={fileName:string;plans:ParsedDaily[];issues:Issue[]}
type FirestoreProfile={active?:boolean;role?:string;username?:string}

const REQUIRED_HEADERS=['Plan ID','Tanggal','Kegiatan','Paddock','Luas']
const OPTIONAL_BASE_HEADERS=['Shift','Ha','Tenaga Kerja','Nama Unit','Ready','Standby','Breakdown','Mandor','Catatan']
const MATERIAL_SLOTS=[1,2,3,4,5]

function text(value:unknown){return value===null||value===undefined?'':String(value).trim()}
function normalized(value:unknown){return text(value).toLowerCase().replace(/\s+/g,' ')}
function num(value:unknown){if(typeof value==='number'&&Number.isFinite(value))return value;const raw=text(value);if(!raw)return 0;const cleaned=raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):raw;const parsed=Number(cleaned);return Number.isFinite(parsed)?parsed:0}
function rowValue(row:SheetRow,...names:string[]){const lookup=new Map(Object.keys(row).map(key=>[normalized(key),row[key]]));for(const name of names){const value=lookup.get(normalized(name));if(value!==undefined)return value}return undefined}
function pad(value:number){return String(value).padStart(2,'0')}
function excelDate(value:unknown){if(value instanceof Date&&!Number.isNaN(value.getTime()))return value.getFullYear()+'-'+pad(value.getMonth()+1)+'-'+pad(value.getDate());if(typeof value==='number'&&Number.isFinite(value)){const parsed=XLSX.SSF.parse_date_code(value);if(parsed)return parsed.y+'-'+pad(parsed.m)+'-'+pad(parsed.d)}const raw=text(value);if(!raw)return'';const d=new Date(raw);return Number.isNaN(d.getTime())?'':d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
function monthKeyFromDate(value:string){return /^\d{4}-\d{2}-\d{2}$/.test(value)?value.slice(0,7):''}
function companyFromData(id:string,data:Record<string,unknown>):CompanyRecord{return{id,code:text(data.code||id).toUpperCase(),name:text(data.name),prefixes:Array.isArray(data.prefixes)?data.prefixes.map(x=>text(x).toUpperCase()).filter(Boolean):[],active:data.active!==false}}
function normalizeMonthLabel(value:string){const key=normalized(value).replace(/\./g,'');const aliases:Record<string,string>={januari:'jan',jan:'jan',februari:'feb',feb:'feb',maret:'mar',mar:'mar',april:'apr',apr:'apr',mei:'mei',may:'mei',juni:'jun',jun:'jun',juli:'juli',jul:'juli',agustus:'agt',agu:'agt',ags:'agt',agt:'agt',aug:'agt',september:'sept',sept:'sept',sep:'sept',oktober:'okt',okt:'okt',oct:'okt',november:'nov',nov:'nov',desember:'des',des:'des',dec:'des'};return aliases[key]||key}
function activityShort(value:string){const key=normalized(value);if(key.startsWith('pre'))return'pre';if(key.startsWith('post'))return'post';if(key.startsWith('top up'))return'topup';if(key.startsWith('top'))return'top';if(key.startsWith('single'))return'single';if(key.startsWith('bassalt'))return'bassalt';if(key.startsWith('insect')||key.startsWith('insekt'))return'insecticide';if(key.startsWith('knock')||key.startsWith('knoc'))return'knockdown';if(key.startsWith('water'))return'watering';return key.split(' ')[0]||''}
function compactPaddock(value:string){return text(value).toUpperCase().replace(/[^A-Z0-9]/g,'')}
function paddockSuffix(pid:string){const parts=text(pid).toUpperCase().split('-').filter(Boolean);if(parts.length>=2)return parts.slice(-2).join('-');return text(pid).toUpperCase()}
function pidPrefix(pid:string){return text(pid).toUpperCase().split('-')[0]}
function legacyPlanKey(value:string){const parts=text(value).split('-').filter(Boolean);const weekIndex=parts.findIndex(x=>/^W[1-4]$/i.test(x));if(weekIndex<1||weekIndex+2>=parts.length)return'';return normalizeMonthLabel(parts[0])+'|'+parts[weekIndex].toUpperCase()+'|'+activityShort(parts[weekIndex+1])+'|'+compactPaddock(parts.slice(weekIndex+2).join('-'))}
function monthlyLegacyKey(row:MonthlyPlanRef){return normalizeMonthLabel(row.monthLabel)+'|'+text(row.week).toUpperCase()+'|'+activityShort(row.description)+'|'+compactPaddock(paddockSuffix(row.pid))}
function sourceTypeFor(planId:string):SourceType{if(!planId||planId==='0')return'ADHOC';return legacyPlanKey(planId)?'MONTHLY':'SUPPORT'}
function fnv1a(value:string){let hash=0x811c9dc5;for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,0x01000193)}return(hash>>>0).toString(36).toUpperCase()}
function dailyPlanId(date:string,key:string,occurrence:number){return'DP-'+(date.replaceAll('-','')||'UNKNOWN')+'-'+fnv1a(key)+(occurrence>1?'-'+occurrence:'')}
function identityKey(row:SheetRow,date:string){return[text(rowValue(row,'Plan ID')),date,normalized(rowValue(row,'Kegiatan')),text(rowValue(row,'Shift')),text(rowValue(row,'Paddock')).toUpperCase()].join('¦')}
function canonical(value:unknown):unknown{if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value as Record<string,unknown>).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));return value}
function canonicalMaterials(value:MaterialLine[]){return value.map(x=>({slot:x.slot,material:x.material,dosePerHa:x.dosePerHa,doseUnit:x.doseUnit,totalMaterial:x.totalMaterial,unit:x.unit})).sort((a,b)=>a.slot-b.slot)}
function same(a:unknown,b:unknown){return JSON.stringify(canonical(a))===JSON.stringify(canonical(b))}
function formatHa(value:number,digits=2){return new Intl.NumberFormat('id-ID',{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(value)+' Ha'}
function headersOf(row:SheetRow){return new Set(Object.keys(row).map(normalized))}
function slotValue(row:SheetRow,base:string,slot:number){return rowValue(row,base+' '+slot,slot===1?base:'__never__')}

function parseMaterials(row:SheetRow,areaHa:number,sourceRow:number,issues:Issue[]){
  const materials:MaterialLine[]=[]
  MATERIAL_SLOTS.forEach(slot=>{
    const material=text(slotValue(row,'Bahan',slot)),dose=num(slotValue(row,'Dosis',slot)),doseUnit=text(slotValue(row,'UoM',slot)),unit=text(slotValue(row,'Satuan',slot))
    if(!material&&!dose&&!doseUnit&&!unit)return
    if(!material&&dose>0)issues.push({level:'WARNING',item:'Baris '+sourceRow,message:'Dosis '+slot+' terisi tetapi Bahan '+slot+' kosong. Slot tetap disimpan untuk review.'})
    if(material&&dose<=0)issues.push({level:'INFO',item:'Baris '+sourceRow,message:'Bahan '+slot+' ('+material+') belum memiliki dosis. Daily Plan tetap dapat diimport.'})
    materials.push({slot,material,dosePerHa:dose,doseUnit,totalMaterial:areaHa*dose,unit})
  })
  return materials
}

async function writerContext(appUser:User){const db=firestoreDb,auth=firebaseAuth;if(!db||!auth)throw new Error('Firebase belum terkonfigurasi.');const current=auth.currentUser;if(!current)throw new Error('Firebase Auth belum terhubung. Login ulang terlebih dahulu.');const snap=await getDoc(doc(db,'users',current.uid));if(!snap.exists())throw new Error('Profil Firebase user tidak ditemukan.');const profile=snap.data() as FirestoreProfile;if(profile.active!==true)throw new Error('Profil Firebase tidak aktif.');if(!['owner','asisten'].includes(profile.role||'')||!['owner','asisten'].includes(appUser.role))throw new Error('Role tidak memiliki izin import Daily Plan.');return{db,username:profile.username||appUser.username}}

async function loadRefs():Promise<MasterRefs>{
  if(!firestoreDb)throw new Error('Firestore belum tersedia.')
  const[paddockSnap,monthlySnap,companySnap]=await Promise.all([getDocs(collection(firestoreDb,'master_paddocks')),getDocs(collection(firestoreDb,'monthly_plans')),getDocs(collection(firestoreDb,'master_companies'))])
  const paddocks=new Map<string,MasterPaddock>(),paddockSuffixes=new Map<string,MasterPaddock[]>()
  paddockSnap.docs.forEach(item=>{const data=item.data() as Record<string,unknown>,pid=text(data.pid||item.id).toUpperCase(),row:MasterPaddock={pid,companyCode:text(data.companyCode).toUpperCase(),farm:text(data.farm),variety:text(data.variety),stage:text(data.currentStage||data.stage||''),areaPaddockHa:num(data.areaPlantedHa||data.areaPaddockHa)};paddocks.set(pid,row);const suffixKey=compactPaddock(paddockSuffix(pid)),list=paddockSuffixes.get(suffixKey)||[];list.push(row);paddockSuffixes.set(suffixKey,list)})
  const monthlyByLegacyKey=new Map<string,MonthlyPlanRef[]>()
  monthlySnap.docs.forEach(item=>{const data=item.data() as Record<string,unknown>,row:MonthlyPlanRef={id:item.id,planLineId:text(data.planLineId||data.planCode||item.id),monthLabel:text(data.monthLabel),week:text(data.week),description:text(data.description),pid:text(data.pid).toUpperCase(),targetAreaHa:num(data.targetAreaHa),companyCode:text(data.companyCode).toUpperCase(),farm:text(data.farm),stage:text(data.stage),areaPaddockHa:num(data.areaPaddockHa),masterVariety:text(data.masterVariety||data.variety),masterActivityId:text(data.masterActivityId),activityCode:text(data.activityCode),type:text(data.type),activityCategory:text(data.activityCategory),componentsSnapshot:Array.isArray(data.componentsSnapshot)?data.componentsSnapshot:[]},key=monthlyLegacyKey(row),list=monthlyByLegacyKey.get(key)||[];list.push(row);monthlyByLegacyKey.set(key,list)})
  const companies=companySnap.empty?FALLBACK_COMPANIES:companySnap.docs.map(item=>companyFromData(item.id,item.data() as Record<string,unknown>)).filter(x=>x.active)
  return{paddocks,paddockSuffixes,monthlyByLegacyKey,companies}
}

function resolveMonthly(sourcePlanIdRaw:string,areaHa:number,refs:MasterRefs){
  const sourceType=sourceTypeFor(sourcePlanIdRaw)
  if(sourceType!=='MONTHLY')return{sourceType,monthlyLinkStatus:'NOT_APPLICABLE' as MonthlyLinkStatus,monthly:null as MonthlyPlanRef|null,candidates:[] as MonthlyPlanRef[]}
  const candidates=refs.monthlyByLegacyKey.get(legacyPlanKey(sourcePlanIdRaw))||[]
  if(candidates.length===1)return{sourceType,monthlyLinkStatus:'LINKED' as MonthlyLinkStatus,monthly:candidates[0],candidates}
  if(candidates.length>1){const areaMatches=candidates.filter(x=>Math.abs(x.targetAreaHa-areaHa)<=0.02);if(areaMatches.length===1)return{sourceType,monthlyLinkStatus:'LINKED' as MonthlyLinkStatus,monthly:areaMatches[0],candidates}}
  return{sourceType,monthlyLinkStatus:(candidates.length?'AMBIGUOUS':'NOT_FOUND') as MonthlyLinkStatus,monthly:null as MonthlyPlanRef|null,candidates}
}

function parseWorkbook(buffer:ArrayBuffer,fileName:string,refs:MasterRefs):ParsedFile{
  const workbook=XLSX.read(buffer,{type:'array',cellDates:true}),sheet=workbook.Sheets[workbook.SheetNames[0]]
  if(!sheet)throw new Error('Workbook tidak memiliki sheet yang bisa dibaca.')
  const rows=XLSX.utils.sheet_to_json<SheetRow>(sheet,{defval:null,raw:true})
  if(!rows.length)throw new Error('Sheet Daily Plan kosong.')
  const keys=headersOf(rows[0]),missing=REQUIRED_HEADERS.filter(header=>!keys.has(normalized(header)))
  if(missing.length)throw new Error('Header wajib belum lengkap: '+missing.join(', ')+'.')
  const hasHorizontalMaterials=MATERIAL_SLOTS.some(slot=>keys.has(normalized('Bahan '+slot))||keys.has(normalized('Dosis '+slot))||keys.has(normalized('UoM '+slot)))
  if(!hasHorizontalMaterials&&keys.has(normalized('Bahan'))){} // legacy slot 1 tetap didukung
  const issues:Issue[]=[],plans:ParsedDaily[]=[],identityOccurrences=new Map<string,number>()
  rows.forEach((row,index)=>{
    const sourceRow=index+2,date=excelDate(rowValue(row,'Tanggal')),activity=text(rowValue(row,'Kegiatan')),paddockRaw=text(rowValue(row,'Paddock')).toUpperCase(),areaHa=num(rowValue(row,'Luas')),sourcePlanIdRaw=text(rowValue(row,'Plan ID'))
    const completelyBlank=!sourcePlanIdRaw&&!date&&!activity&&!paddockRaw&&!areaHa
    if(completelyBlank)return
    if(!sourcePlanIdRaw||!date||!activity||!paddockRaw){issues.push({level:'ERROR',item:'Baris '+sourceRow,message:'Plan ID, Tanggal, Kegiatan, dan Paddock wajib terisi.'});return}
    if(areaHa<=0)issues.push({level:'WARNING',item:'Baris '+sourceRow,message:'Luas '+formatHa(areaHa)+' tidak lebih dari 0. Data tetap dibaca untuk review.'})
    const shift=text(rowValue(row,'Shift'))
    if(!shift)issues.push({level:'INFO',item:'Baris '+sourceRow,message:'Shift kosong. Data historis tetap dapat diimport.'})
    const key=identityKey(row,date),occurrence=(identityOccurrences.get(key)||0)+1;identityOccurrences.set(key,occurrence)
    if(occurrence>1)issues.push({level:'INFO',item:'Baris '+sourceRow,message:'Identitas inti Daily Plan sama dengan baris sebelumnya. Sistem membuat Daily Plan ID terpisah dengan nomor urut '+occurrence+'.'})
    const monthlyResult=resolveMonthly(sourcePlanIdRaw,areaHa,refs),monthly=monthlyResult.monthly
    if(monthlyResult.sourceType==='MONTHLY'&&monthlyResult.monthlyLinkStatus==='NOT_FOUND')issues.push({level:'INFO',item:sourcePlanIdRaw,message:'MONTHLY PENDING — Plan ID sumber '+sourcePlanIdRaw+' belum menemukan pasangan unik di Monthly Plan final. Daily Plan tetap dapat diimport dan link dapat diperbaiki kemudian.'})
    if(monthlyResult.monthlyLinkStatus==='AMBIGUOUS')issues.push({level:'INFO',item:sourcePlanIdRaw,message:'MONTHLY AMBIGUOUS — ditemukan '+monthlyResult.candidates.length+' kandidat Monthly Plan ('+monthlyResult.candidates.map(x=>x.planLineId).join(', ')+'). Daily Plan tetap diimport tanpa memaksa link.'})
    const exactMaster=refs.paddocks.get(paddockRaw),suffixCandidates=refs.paddockSuffixes.get(compactPaddock(paddockRaw))||[],suffixMaster=!exactMaster&&suffixCandidates.length===1?suffixCandidates[0]:null,master=monthly?.pid?refs.paddocks.get(monthly.pid):exactMaster||suffixMaster
    const pid=monthly?.pid||master?.pid||paddockRaw,companyByPrefix=refs.companies.find(x=>x.prefixes.map(p=>p.toUpperCase()).includes(pidPrefix(pid))),companyCode=monthly?.companyCode||master?.companyCode||companyByPrefix?.code||'',masterPending=!master
    if(masterPending)issues.push({level:'INFO',item:date+' / '+paddockRaw,message:'MASTER PENDING — Paddock '+paddockRaw+' belum ditemukan unik di Master Paddock. Nilai sumber tetap disimpan; metadata dapat dilengkapi setelah master diperbarui.'})
    const materials=parseMaterials(row,areaHa,sourceRow,issues)
    const id=dailyPlanId(date,key,occurrence),year=Number(date.slice(0,4))||0,monthKey=monthKeyFromDate(date)
    plans.push({
      docId:id,dailyPlanId:id,identityKey:key,sourceRow,sourcePlanIdRaw,sourceType:monthlyResult.sourceType,monthlyLinkStatus:monthlyResult.monthlyLinkStatus,monthlyPlanLineId:monthly?.planLineId||'',monthlyCandidates:monthlyResult.candidates.map(x=>x.planLineId),
      date,year,monthKey,shift,activity,description:monthly?.description||'',paddockRaw,pid,areaHa,areaUnit:text(rowValue(row,'Ha'))||'Ha',manpower:num(rowValue(row,'Tenaga Kerja')),
      unitName:text(rowValue(row,'Nama Unit')),unitReady:num(rowValue(row,'Ready')),unitStandby:num(rowValue(row,'Standby')),unitBreakdown:num(rowValue(row,'Breakdown')),foreman:text(rowValue(row,'Mandor')),notes:text(rowValue(row,'Catatan')),
      companyCode,farm:master?.farm||monthly?.farm||'',stage:master?.stage||monthly?.stage||'',areaPaddockHa:master?.areaPaddockHa||monthly?.areaPaddockHa||0,masterVariety:master?.variety||monthly?.masterVariety||'',masterPending,
      masterActivityId:monthly?.masterActivityId||'',activityCode:monthly?.activityCode||'',type:monthly?.type||'',activityCategory:monthly?.activityCategory||'',componentsSnapshot:monthly?.componentsSnapshot||[],materials
    })
  })
  plans.sort((a,b)=>a.date.localeCompare(b.date)||a.shift.localeCompare(b.shift)||a.pid.localeCompare(b.pid,undefined,{numeric:true})||a.activity.localeCompare(b.activity))
  return{fileName,plans,issues}
}

function importedShape(row:ParsedDaily){return{dailyPlanId:row.dailyPlanId,identityKey:row.identityKey,sourcePlanIdRaw:row.sourcePlanIdRaw,sourceType:row.sourceType,monthlyLinkStatus:row.monthlyLinkStatus,monthlyPlanLineId:row.monthlyPlanLineId,date:row.date,year:row.year,monthKey:row.monthKey,shift:row.shift,activity:row.activity,description:row.description,paddockRaw:row.paddockRaw,pid:row.pid,areaHa:row.areaHa,areaUnit:row.areaUnit,manpower:row.manpower,unitName:row.unitName,unitReady:row.unitReady,unitStandby:row.unitStandby,unitBreakdown:row.unitBreakdown,foreman:row.foreman,notes:row.notes,companyCode:row.companyCode,farm:row.farm,stage:row.stage,areaPaddockHa:row.areaPaddockHa,masterVariety:row.masterVariety,masterPending:row.masterPending,materials:canonicalMaterials(row.materials)}}
function existingShape(data:Record<string,unknown>){const materials=Array.isArray(data.materials)?data.materials.map((item,index)=>{const x=(item&&typeof item==='object'?item:{}) as Record<string,unknown>;return{slot:num(x.slot)||index+1,material:text(x.material),dosePerHa:num(x.dosePerHa),doseUnit:text(x.doseUnit),totalMaterial:num(x.totalMaterial),unit:text(x.unit)}}):[];return{dailyPlanId:text(data.dailyPlanId),identityKey:text(data.identityKey),sourcePlanIdRaw:text(data.sourcePlanIdRaw),sourceType:text(data.sourceType),monthlyLinkStatus:text(data.monthlyLinkStatus),monthlyPlanLineId:text(data.monthlyPlanLineId),date:text(data.date),year:num(data.year),monthKey:text(data.monthKey),shift:text(data.shift),activity:text(data.activity),description:text(data.description),paddockRaw:text(data.paddockRaw),pid:text(data.pid),areaHa:num(data.areaHa),areaUnit:text(data.areaUnit),manpower:num(data.manpower),unitName:text(data.unitName),unitReady:num(data.unitReady),unitStandby:num(data.unitStandby),unitBreakdown:num(data.unitBreakdown),foreman:text(data.foreman),notes:text(data.notes),companyCode:text(data.companyCode),farm:text(data.farm),stage:text(data.stage),areaPaddockHa:num(data.areaPaddockHa),masterVariety:text(data.masterVariety),masterPending:data.masterPending===true,materials:canonicalMaterials(materials)}}
function diffKeys(previous:Record<string,unknown>,row:ParsedDaily){const before=existingShape(previous),after=importedShape(row),changes:string[]=[];Object.keys(after).forEach(key=>{if(!same(before[key as keyof typeof before],after[key as keyof typeof after]))changes.push(key)});return changes}
async function compareFirestore(parsed:ParsedFile):Promise<PreviewDaily[]>{if(!firestoreDb)throw new Error('Firestore belum tersedia.');const snap=await getDocs(collection(firestoreDb,'daily_plans')),existing=new Map(snap.docs.map(item=>[item.id,item.data() as Record<string,unknown>]));return parsed.plans.map(row=>{const previous=existing.get(row.docId);if(!previous)return{...row,importStatus:'CREATE' as ImportStatus,changes:[]};const changes=diffKeys(previous,row);if(!changes.length)return{...row,importStatus:'NO_CHANGE' as ImportStatus,changes:[],previous};if(text(previous.lastModifiedSource).toUpperCase()==='WEB')return{...row,importStatus:'PROTECTED' as ImportStatus,changes,previous};return{...row,importStatus:'UPDATE' as ImportStatus,changes,previous}})}
function chunks<T>(items:T[],size:number){const out:T[][]=[];for(let i=0;i<items.length;i+=size)out.push(items.slice(i,i+size));return out}

export default function DailyPlanImportPanel({user}:Props){
  const[parsed,setParsed]=useState<ParsedFile|null>(null),[preview,setPreview]=useState<PreviewDaily[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
  const isOwner=user.role==='owner'
  const counts=useMemo(()=>({total:preview.length,monthly:preview.filter(x=>x.sourceType==='MONTHLY').length,adhoc:preview.filter(x=>x.sourceType==='ADHOC').length,support:preview.filter(x=>x.sourceType==='SUPPORT').length,linked:preview.filter(x=>x.monthlyLinkStatus==='LINKED').length,pending:preview.filter(x=>x.masterPending).length,withMaterials:preview.filter(x=>x.materials.length>0).length,create:preview.filter(x=>x.importStatus==='CREATE').length,update:preview.filter(x=>x.importStatus==='UPDATE').length,unchanged:preview.filter(x=>x.importStatus==='NO_CHANGE').length,protected:preview.filter(x=>x.importStatus==='PROTECTED').length,info:parsed?.issues.filter(x=>x.level==='INFO').length||0,warnings:parsed?.issues.filter(x=>x.level==='WARNING').length||0,errors:parsed?.issues.filter(x=>x.level==='ERROR').length||0}),[preview,parsed])

  async function onFile(event:ChangeEvent<HTMLInputElement>){const file=event.target.files?.[0];if(!file)return;setBusy(true);setMessage('Membaca Daily Plan horizontal, Monthly Plan, dan Master Paddock…');try{const refs=await loadRefs(),next=parseWorkbook(await file.arrayBuffer(),file.name,refs),nextPreview=await compareFirestore(next);setParsed(next);setPreview(nextPreview);setMessage('Preview siap: '+next.plans.length+' Daily Plan dari '+next.plans.length+' baris data; '+nextPreview.filter(x=>x.importStatus==='CREATE').length+' CREATE / '+nextPreview.filter(x=>x.importStatus==='UPDATE').length+' UPDATE / '+nextPreview.filter(x=>x.importStatus==='NO_CHANGE').length+' NO CHANGE / '+nextPreview.filter(x=>x.importStatus==='PROTECTED').length+' PROTECTED.')}catch(error){setParsed(null);setPreview([]);setMessage(error instanceof Error?error.message:'File Daily Plan gagal dibaca.')}finally{setBusy(false)}}
  async function refreshComparison(){if(!parsed)return;setBusy(true);setMessage('Membandingkan ulang Daily Plan dengan Firestore…');try{const next=await compareFirestore(parsed);setPreview(next);setMessage('Perbandingan selesai: '+next.filter(x=>x.importStatus==='CREATE').length+' CREATE / '+next.filter(x=>x.importStatus==='UPDATE').length+' UPDATE / '+next.filter(x=>x.importStatus==='NO_CHANGE').length+' NO CHANGE / '+next.filter(x=>x.importStatus==='PROTECTED').length+' PROTECTED.')}catch(error){setMessage(error instanceof Error?error.message:'Perbandingan gagal.')}finally{setBusy(false)}}


  async function deleteExcelData(){
    if(!isOwner){setMessage('Hanya Owner yang boleh menghapus data Excel Daily Plan.');return}
    setBusy(true);setMessage('Memeriksa data Excel Daily Plan di Firestore…')
    try{
      const{db}=await writerContext(user),snap=await getDocs(collection(db,'daily_plans'))
      const excelDocs=snap.docs.filter(item=>{const data=item.data() as Record<string,unknown>,origin=text(data.sourceOrigin).toUpperCase();return origin==='EXCEL'||(!origin&&(text(data.sourceFileName)||text(data.lastImportBatchId)))})
      if(!excelDocs.length){setMessage('Tidak ada data Daily Plan yang berasal dari import Excel. Data Web tidak diubah.');return}
      const webEdited=excelDocs.filter(item=>text((item.data() as Record<string,unknown>).lastModifiedSource).toUpperCase()==='WEB').length
      const expected='HAPUS DAILY '+excelDocs.length
      const answer=window.prompt('Akan menghapus '+excelDocs.length+' Daily Plan yang berasal dari Excel. Data yang dibuat langsung dari Web tetap dipertahankan.'+(webEdited?'\n\nPERHATIAN: '+webEdited+' record asal Excel pernah diedit melalui Web dan ikut dihapus agar dataset Excel dapat diganti penuh.':'')+'\n\nKetik '+expected+' untuk lanjut.','')
      if(answer!==expected){setMessage('Penghapusan dibatalkan.');return}
      for(const part of chunks(excelDocs,400)){const batch=writeBatch(db);part.forEach(item=>batch.delete(item.ref));await batch.commit()}
      if(parsed){const next=await compareFirestore(parsed);setPreview(next)}
      else setPreview([])
      setMessage('Hapus selesai: '+excelDocs.length+' Daily Plan asal Excel dihapus. Data Web dipertahankan. Sekarang file Daily Plan terbaru dapat diimport.')
    }catch(error){setMessage(error instanceof Error?error.message:'Gagal menghapus data Excel Daily Plan.')}finally{setBusy(false)}
  }

  async function confirmImport(){
    if(!parsed||!preview.length)return;if(counts.errors){setMessage('Import diblokir karena masih ada '+counts.errors+' ERROR.');return}
    const writable=preview.filter(x=>x.importStatus==='CREATE'||x.importStatus==='UPDATE');if(!writable.length){setMessage(counts.protected?'Tidak ada data yang dapat ditulis. '+counts.protected+' record dilindungi karena pernah diubah melalui Web.':'Semua Daily Plan sudah NO CHANGE. Firestore tidak diubah.');return}
    const confirmText=window.prompt('Akan menulis '+writable.length+' Daily Plan ke Firestore. Bahan boleh kosong; MONTHLY PENDING / MASTER PENDING tetap boleh masuk. Ketik IMPORT untuk lanjut.','');if(confirmText!=='IMPORT')return
    setBusy(true);setMessage('Mengimport Daily Plan…')
    try{
      const{db,username}=await writerContext(user),batchId='DP-'+Date.now()
      for(const part of chunks(writable,400)){const batch=writeBatch(db);part.forEach(row=>{const existing=row.previous||{},payload:Record<string,unknown>={...importedShape(row),sourceRow:row.sourceRow,sourceOrigin:text(existing.sourceOrigin)||'EXCEL',lastModifiedSource:'EXCEL',monthlyCandidates:row.monthlyCandidates,masterActivityId:row.masterActivityId,activityCode:row.activityCode,type:row.type,activityCategory:row.activityCategory,componentsSnapshot:row.componentsSnapshot,materials:row.materials,sourceFileName:parsed.fileName,lastImportBatchId:batchId,importedAt:serverTimestamp(),updatedAt:serverTimestamp(),updatedBy:username};if(row.importStatus==='CREATE'){payload.createdAt=serverTimestamp();payload.createdBy=username}batch.set(doc(db,'daily_plans',row.docId),payload,{merge:true})});await batch.commit()}
      await setDoc(doc(db,'daily_plan_import_logs',batchId),{batchId,sourceFileName:parsed.fileName,total:preview.length,sourceRows:parsed.plans.length,created:counts.create,updated:counts.update,unchanged:counts.unchanged,protected:counts.protected,monthly:counts.monthly,adhoc:counts.adhoc,support:counts.support,linked:counts.linked,masterPending:counts.pending,withMaterials:counts.withMaterials,info:counts.info,warnings:counts.warnings,errors:counts.errors,importedBy:username,importedAt:serverTimestamp()})
      const next=await compareFirestore(parsed);setPreview(next);const remaining=next.filter(x=>x.importStatus==='CREATE'||x.importStatus==='UPDATE').length
      setMessage('Import selesai. Ditulis '+writable.length+' Daily Plan ('+counts.create+' CREATE / '+counts.update+' UPDATE). Verifikasi: '+next.filter(x=>x.importStatus==='NO_CHANGE').length+' NO CHANGE, '+next.filter(x=>x.importStatus==='PROTECTED').length+' PROTECTED'+(remaining?', '+remaining+' masih berbeda':'. Firestore sinkron dengan file untuk record yang tidak dilindungi.'))
    }catch(error){setMessage(error instanceof Error?error.message:'Import Daily Plan gagal.')}finally{setBusy(false)}
  }

  return <section>
    <div className="section-head"><div><div className="eyebrow">DAILY PLAN</div><h2>Update / Import Excel</h2><p className="muted">Format utama sekarang 1 baris Excel = 1 Daily Plan. Field wajib hanya Plan ID, Tanggal, Kegiatan, Paddock, dan Luas. Bahan 1–5, dosis, UoM, tenaga kerja, unit, mandor, dan catatan boleh kosong. Kolom bahan horizontal dibaca langsung sebagai array bahan.</p></div></div>
    <div className="panel"><label><span>File Daily Plan (.xlsx / .xls)</span><input type="file" accept=".xlsx,.xls" onChange={onFile} disabled={busy}/></label><div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:14}}><button type="button" onClick={()=>void refreshComparison()} disabled={busy||!parsed}>Bandingkan Firestore</button><button type="button" className="primary" onClick={()=>void confirmImport()} disabled={busy||!parsed||!preview.length}>Confirm Import Firestore</button>{isOwner&&<button type="button" onClick={()=>void deleteExcelData()} disabled={busy} style={{borderColor:'#b91c1c',color:'#b91c1c'}}>Hapus Data Excel Daily Plan</button>}</div><p className="muted" style={{marginTop:10}}>Hapus Data Excel hanya menghapus record yang berasal dari import Excel. Daily Plan yang dibuat langsung melalui Web tetap dipertahankan.</p>{message&&<div className="alert" style={{marginTop:14,whiteSpace:'pre-line'}}>{message}</div>}</div>
    {parsed&&<>
      <div className="cards" style={{marginTop:18}}><div className="card"><span>DAILY PLAN</span><strong>{counts.total}</strong></div><div className="card"><span>MONTHLY</span><strong>{counts.monthly}</strong></div><div className="card"><span>ADHOC</span><strong>{counts.adhoc}</strong></div><div className="card"><span>SUPPORT</span><strong>{counts.support}</strong></div><div className="card"><span>MONTHLY LINKED</span><strong>{counts.linked}</strong></div><div className="card"><span>MASTER PENDING</span><strong>{counts.pending}</strong></div><div className="card"><span>ADA BAHAN</span><strong>{counts.withMaterials}</strong></div><div className="card"><span>CREATE</span><strong>{counts.create}</strong></div><div className="card"><span>UPDATE</span><strong>{counts.update}</strong></div><div className="card"><span>NO CHANGE</span><strong>{counts.unchanged}</strong></div><div className="card"><span>PROTECTED</span><strong>{counts.protected}</strong></div><div className="card"><span>WARNING</span><strong>{counts.warnings}</strong></div><div className="card"><span>ERROR</span><strong>{counts.errors}</strong></div></div>
      {parsed.issues.length>0&&<div className="panel" style={{marginTop:18}}><h3>Data Quality</h3><p className="muted">INFO tidak memblokir import. Bahan kosong adalah kondisi valid untuk baseline historis.</p><div className="table-wrap"><table><thead><tr><th>Level</th><th>Item</th><th>Keterangan</th></tr></thead><tbody>{parsed.issues.slice(0,250).map((issue,index)=><tr key={issue.level+'-'+index}><td><strong>{issue.level}</strong></td><td>{issue.item||'-'}</td><td>{issue.message}</td></tr>)}</tbody></table></div>{parsed.issues.length>250&&<p className="muted">Menampilkan 250 dari {parsed.issues.length} issue.</p>}</div>}
      <div className="panel" style={{marginTop:18}}><div className="section-head"><div><h3>Preview Import</h3><p className="muted">PROTECTED = record pernah diubah melalui Web dan tidak ditimpa otomatis.</p></div></div><div className="table-wrap"><table><thead><tr><th>Status</th><th>Daily Plan ID</th><th>Sumber</th><th>Plan ID Excel</th><th>Tanggal / Shift</th><th>PID</th><th>Kegiatan</th><th>Luas</th><th>Bahan</th><th>Link Monthly</th><th>Perubahan</th></tr></thead><tbody>{preview.slice(0,300).map(row=><tr key={row.docId}><td><strong>{row.importStatus}</strong></td><td>{row.dailyPlanId}</td><td>{row.sourceType}</td><td>{row.sourcePlanIdRaw||'-'}</td><td>{row.date}<br/><span className="muted">Shift {row.shift||'-'}</span></td><td>{row.pid}<br/><span className="muted">{row.paddockRaw!==row.pid?'Sumber: '+row.paddockRaw:''}</span></td><td>{row.activity}</td><td>{formatHa(row.areaHa)}</td><td>{row.materials.length}</td><td>{row.monthlyLinkStatus}{row.monthlyPlanLineId?<><br/><span className="muted">{row.monthlyPlanLineId}</span></>:null}</td><td>{row.changes.join(', ')||'-'}</td></tr>)}</tbody></table></div>{preview.length>300&&<p className="muted">Menampilkan 300 dari {preview.length} Daily Plan.</p>}</div>
    </>}
  </section>
}
