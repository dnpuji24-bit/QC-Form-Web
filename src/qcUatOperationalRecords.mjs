// 11D.5c.4.3 — bounded, immutable-audited synthetic QC record read model.
// No raw full DTO, photo paths, actual material amounts or browser-supplied queries.
// Authorization happens in the trusted Firestore emulator service, never here.
import {equalSprayValue} from './qcUatPlanningSprayCommit.mjs'

const need=(ok,code)=>{if(!ok)throw Error(code)}
const plain=v=>v!==null&&typeof v==='object'&&Object.getPrototypeOf(v)===Object.prototype
const sid=v=>typeof v==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(v)
const iso=v=>typeof v==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(v)&&
 !Number.isNaN(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v
const qty=v=>Number.isSafeInteger(v)&&v>=0&&v<=1000000000
export function operationalRecordsRequest(input){
 need(plain(input)&&Reflect.ownKeys(input).length===2&&
  Object.hasOwn(input,'monthKey')&&Object.hasOwn(input,'kind')&&
  typeof input.monthKey==='string'&&/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(input.monthKey)&&
  ['all','spray','fertilizer'].includes(input.kind),'INVALID_RECORDS_REQUEST')
 const [year,month]=input.monthKey.split('-').map(Number)
 return Object.freeze({monthKey:input.monthKey,kind:input.kind,
  startDate:input.monthKey+'-01',endDate:new Date(Date.UTC(year,month,0)).toISOString().slice(0,10)})
}
// The browser may request a bounded recent list or exact ID lookup across ALL dates.
// This is an exact synthetic identifier search, not a substring/fuzzy search engine.
export function operationalRecordsBrowseRequest(input){
 need(plain(input)&&
  ((Reflect.ownKeys(input).length===2&&input.mode==='recent')||
   (Reflect.ownKeys(input).length===3&&input.mode==='exact'))&&
  Object.hasOwn(input,'kind')&&['all','spray','fertilizer'].includes(input.kind),
  'INVALID_RECORDS_BROWSE_REQUEST')
 if(input.mode==='recent'){
  need(!Object.hasOwn(input,'term'),'INVALID_RECORDS_BROWSE_REQUEST')
  return Object.freeze({mode:'recent',kind:input.kind})
 }
 need(Object.hasOwn(input,'term')&&sid(input.term),
  'INVALID_RECORDS_BROWSE_REQUEST')
 return Object.freeze({mode:'exact',kind:input.kind,term:input.term})
}
export function operationalRecordsProjection(request,pairs){
 const browse=plain(request)&&Object.hasOwn(request,'mode')
 const q=browse?operationalRecordsBrowseRequest(request):operationalRecordsRequest({monthKey:request.monthKey,kind:request.kind})
 need(Array.isArray(pairs)&&pairs.length<=(browse?100:50),'RECORDS_SCOPE_LIMIT')
 const ids=new Set(),records=[]
 for(const {id,qc,detail,fullAudit,audit,actual} of pairs){
  need(sid(id)&&!ids.has(id)&&plain(qc)&&qc.testOnly===true&&qc.id===id&&
   ['spray','fertilizer'].includes(qc.formType)&&sid(qc.ownerUid)&&sid(qc.clientRevision)&&
   sid(qc.dailyPlanId)&&sid(qc.pid)&&sid(qc.foreman)&&
   ['1','2'].includes(qc.shift)&&iso(qc.date)&&
   (browse||qc.date>=q.startDate&&qc.date<=q.endDate)&&
   ['draft','ready','uploaded'].includes(qc.saveType),'INVALID_RECORDS_QC')
  ids.add(id)
  if(browse&&q.mode==='exact')need([id,qc.pid,qc.dailyPlanId,qc.foreman].includes(q.term),'RECORDS_SEARCH_MISMATCH')
  if(q.kind!=='all'&&q.kind!==qc.formType)continue
  const revision=qc.clientRevision
  need(plain(detail)&&detail.testOnly===true&&detail.canonicalQcId===id&&
   detail.fullRecordId==='qc-v2-'+id&&detail.clientRevision===revision&&
   detail.ownerUid===qc.ownerUid&&plain(detail.form)&&
   detail.form.id===detail.fullRecordId&&detail.form.formType===qc.formType&&
   detail.form.clientRevision===revision&&detail.form.saveType===qc.saveType&&
   equalSprayValue(detail,fullAudit),'RECORDS_FULL_AUDIT_CONFLICT')
  need(plain(audit)&&audit.testOnly===true&&audit.recordId===id&&
   audit.revision===revision&&audit.actorUid===qc.ownerUid&&
   audit.formType===qc.formType&&audit.saveType===qc.saveType,
   'RECORDS_AUDIT_CONFLICT')
  let ap=null
  if(actual!==null){
   need(plain(actual)&&actual.testOnly===true&&actual.actualReportId==='qcactual_'+id&&
    actual.qcRecordId===id&&actual.sourceOrigin==='QC'&&
    actual.qcFormType===qc.formType&&actual.clientRevision===revision&&
    actual.ownerUid===qc.ownerUid&&actual.dailyPlanId===qc.dailyPlanId&&
    actual.pid===qc.pid&&actual.date===qc.date&&actual.shift===qc.shift&&
    actual.foreman===qc.foreman&&qc.saveType!=='draft','RECORDS_ACTUAL_CONFLICT')
   if(qc.formType==='spray'){
    need(qty(actual.actualArea100)&&actual.actualArea100===qc.actualArea100&&
     !Object.hasOwn(actual,'applicationArea100'),'RECORDS_ACTUAL_CONFLICT')
    ap={semantics:'PHYSICAL_APPLICATION',area100:actual.actualArea100}
   }else{
    const items=actual.fertilizerComponents
    need(qty(actual.applicationArea100)&&actual.applicationArea100===qc.applicationArea100&&
     !Object.hasOwn(actual,'actualArea100')&&Array.isArray(items)&&items.length>0&&items.length<=4&&
     items.every(c=>sid(c.componentId)&&qty(c.actualArea100))&&
     items.reduce((n,c)=>n+c.actualArea100,0)===actual.applicationArea100,
     'RECORDS_ACTUAL_CONFLICT')
    ap={semantics:'COMPONENT_APPLICATION_SUM',applicationArea100:actual.applicationArea100,
     components:items.map(c=>({componentId:c.componentId,area100:c.actualArea100}))}
   }
  }else need(qc.saveType==='draft'||qc.formType==='spray'&&qc.actualArea100===0,
   'RECORDS_MISSING_ACTUAL')
  records.push({id,date:qc.date,shift:qc.shift,formType:qc.formType,
   saveType:qc.saveType,dailyPlanId:qc.dailyPlanId,pid:qc.pid,foreman:qc.foreman,
   clientRevision:revision,actual:ap})
 }
 records.sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id))
 return Object.freeze(browse?{testOnly:true,readOnly:true,mode:q.mode,kind:q.kind,
  ...(q.mode==='exact'?{term:q.term}:{}),recordCount:records.length,records}:
  {testOnly:true,readOnly:true,monthKey:q.monthKey,kind:q.kind,
  recordCount:records.length,records})
}
