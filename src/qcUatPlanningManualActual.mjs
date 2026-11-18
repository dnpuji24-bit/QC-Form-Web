// Synthetic Manual Actual lifecycle. One active manual record per source DP.
import {standardQcMaterials} from './qcUatPlanningQcSource.mjs'
import {equalSprayValue} from './qcUatPlanningSprayCommit.mjs'
const need=(ok,code)=>{if(!ok)throw Error(code)}
const sid=v=>typeof v==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(v)
const exact=(v,ks)=>need(v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===ks.length&&ks.every(k=>Object.hasOwn(v,k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value')),'INVALID_MANUAL_FIELDS')
const integer=(v,max)=>{need(Number.isSafeInteger(v)&&v>=0&&v<=max,'INVALID_MANUAL_NUMBER');return v}
export const manualActualId=id=>{need(sid(id),'INVALID_SYNTHETIC_ID');return 'manualactual_'+id}
export function manualRequest(q){
 need(q&&['create','update','cancel'].includes(q.action),'INVALID_MANUAL_ACTION')
 exact(q,['action','dailyPlanId','expectedDailyRevision','expectedRevision','reason',...(q.action==='cancel'?[]:['execution'])])
 manualActualId(q.dailyPlanId);integer(q.expectedDailyRevision,999999)
 if(q.action==='create')need(q.expectedRevision===null,'INVALID_MANUAL_REVISION');else integer(q.expectedRevision,999999)
 need(typeof q.reason==='string'&&q.reason.trim()===q.reason&&q.reason.length>=5&&q.reason.length<=500,'MANUAL_REASON_REQUIRED')
 return q
}
function quantities(source,execution){
 const spray=source.kind==='spray'
 need(source?.testOnly===true&&['spray','fertilizer'].includes(source.kind)&&source.carryover===false,'INVALID_MANUAL_SOURCE')
 exact(execution,spray?['actualArea100','measured']:['components'])
 const entries=spray?execution.measured:execution.components
 need(Array.isArray(entries)&&entries.length===source.materials.length&&entries.length<=20&&Array.from({length:entries.length},(_,i)=>Object.hasOwn(entries,i)).every(Boolean),'MANUAL_COMPONENTS_REQUIRED')
 if(!spray)need(entries.length>0&&source.materials.every(m=>m.unit==='kg'&&m.doseUnit==='kg'),'FERTILIZER_RECIPE_REQUIRED')
 const map=new Map()
 for(const e of entries){
  exact(e,spray?['materialId','actualMaterial1000000']:['materialId','area100','actualMaterial1000000'])
  need(sid(e.materialId)&&!map.has(e.materialId)&&source.materials.some(m=>m.materialId===e.materialId),'INVALID_MANUAL_COMPONENT')
  if(!spray){integer(e.area100,10000000);need(e.area100!==0||e.actualMaterial1000000===0,'MANUAL_ZERO_AREA_USAGE')}
  if(e.actualMaterial1000000!==null||!spray)integer(e.actualMaterial1000000,1000000000000)
  map.set(e.materialId,e)
 }
 const input=spray?{actualArea100:integer(execution.actualArea100,10000000)}:{componentAreas:source.materials.map(m=>({materialId:m.materialId,area100:map.get(m.materialId).area100}))}
 const std=standardQcMaterials(source,input),area=spray?execution.actualArea100:std.reduce((n,m)=>n+m.area100,0)
 need(area>0,'MANUAL_POSITIVE_AREA_REQUIRED')
 const materials=std.map((m,i)=>{const actual=map.get(m.materialId).actualMaterial1000000;return {...m,plannedMaterial1000000:source.materials[i].totalMaterial1000000,actualMaterial1000000:actual,varianceMaterial1000000:actual===null?null:actual-m.standardMaterial1000000}})
 return {areaSemantics:spray?'SCALAR_APPLICATION':'APPLICATION_HA_ONLY',...(spray?{actualArea100:area}:{applicationArea100:area}),materials}
}
export function historicalManualSource(current,old){
 need(equalSprayValue({...current,planningOrder:old.planningOrder,executionForemanName:old.executionForemanName},old),'MANUAL_SOURCE_CHANGED')
 return old
}
function build(source,execution,reason,revision,status,createdBy,updatedBy){
 need(sid(createdBy)&&sid(updatedBy),'INVALID_SYNTHETIC_ID')
 return {testOnly:true,sourceOrigin:'MANUAL',actualReportId:manualActualId(source.dailyPlanId),dailyPlanId:source.dailyPlanId,monthlyPlanLineId:source.monthlyPlanLineId,pid:source.pid,date:source.date,shift:source.executionShift,foreman:source.executionForemanId,kind:source.kind,sourceDailyRevision:source.dailyRevision,revision,status,reason,createdBy,updatedBy,source,execution,...quantities(source,execution)}
}
export function verifyManualActual(row,source,audit){
 need(row&&audit,'MANUAL_RECONCILIATION_REQUIRED')
 const trusted=historicalManualSource(source,row.source)
 integer(row.revision,999999)
 need(['active','cancelled'].includes(row.status),'MANUAL_RECONCILIATION_REQUIRED')
 manualRequest({action:'create',dailyPlanId:trusted.dailyPlanId,expectedDailyRevision:trusted.dailyRevision,expectedRevision:null,reason:row.reason,execution:row.execution})
 const canonical=build(trusted,row.execution,row.reason,row.revision,row.status,row.createdBy,row.updatedBy)
 need(equalSprayValue(row,canonical)&&audit.testOnly===true&&audit.id===row.actualReportId&&audit.revision===row.revision&&audit.actorUid===row.updatedBy&&audit.action===(row.status==='cancelled'?'cancel':row.revision===0?'create':'update')&&equalSprayValue(audit.after,row),'MANUAL_RECONCILIATION_REQUIRED')
 return row
}
export function nextManualActual(input,source,prior,uid){
 const q=manualRequest(input)
 need(source?.dailyPlanId===q.dailyPlanId&&source.dailyRevision===q.expectedDailyRevision,'DAILY_REVISION_CONFLICT')
 if(q.action==='create'){
  need(!prior,'MANUAL_ALREADY_EXISTS')
  return build(source,q.execution,q.reason,0,'active',uid,uid)
 }
 need(prior,'MANUAL_NOT_FOUND');need(prior.status==='active','MANUAL_CLOSED')
 need(prior.revision===q.expectedRevision,'MANUAL_REVISION_CONFLICT');need(prior.revision<999999,'INVALID_MANUAL_REVISION')
 const trusted=historicalManualSource(source,prior.source)
 return build(trusted,q.action==='cancel'?prior.execution:q.execution,q.reason,prior.revision+1,q.action==='cancel'?'cancelled':'active',prior.createdBy,uid)
}
export function manualProjection(row){
 const {actualReportId:id,revision,kind,dailyPlanId,monthlyPlanLineId,pid,date,shift,foreman,areaSemantics,materials}=row
 return {id,revision,sourceOrigin:'MANUAL',kind,dailyPlanId,monthlyPlanLineId,pid,date,shift,foreman,areaSemantics,materials,...(kind==='spray'?{actualArea100:row.actualArea100}:{applicationArea100:row.applicationArea100})}
}
