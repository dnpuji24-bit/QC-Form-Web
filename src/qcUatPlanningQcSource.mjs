// Isolated trusted QC form source projection. No write, photo, or inventory effects.
import {currentPlanningRow} from './qcUatPlanningWriteContract.mjs'
import {readDailySnapshot,readMonthlySnapshot} from './qcUatPlanningMasterSnapshot.mjs'
const need=(ok,code)=>{if(!ok)throw Error(code)}
const exact=(v,ks)=>need(v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===ks.length&&ks.every(k=>Object.hasOwn(v,k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value')),'INVALID_QC_SOURCE_FIELDS')
const sid=v=>{need(typeof v==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(v),'INVALID_SYNTHETIC_ID');return v}
const integer=(v,max)=>{need(Number.isSafeInteger(v)&&v>=0&&v<=max,'INVALID_QC_SOURCE_NUMBER');return v}
export function qcSourceRequest(input){
 exact(input,['dailyPlanId','expectedDailyRevision','formType','date','shift','foreman'])
 sid(input.dailyPlanId);sid(input.foreman);integer(input.expectedDailyRevision,999999)
 need(['spray','fertilizer'].includes(input.formType)&&['1','2'].includes(input.shift),'INVALID_QC_SOURCE_FORM')
 need(typeof input.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(input.date)&&Number.isFinite(Date.parse(input.date+'T00:00:00Z'))&&new Date(input.date+'T00:00:00Z').toISOString().slice(0,10)===input.date,'INVALID_QC_SOURCE_DATE')
 return input
}
export function projectQcSource(input,daily,dpSnapshot,parent,mpSnapshot,header,groupSnapshot,foreman){
 const q=qcSourceRequest(input)
 need(daily,'MISSING_DAILY_PLAN')
 currentPlanningRow('daily',q.dailyPlanId,daily)
 need(daily.status==='open','PLAN_CLOSED')
 need(daily.revision===q.expectedDailyRevision,'DAILY_REVISION_CONFLICT')
 need(daily.formType===q.formType,'PLANNING_FORM_MISMATCH')
 need(daily.date===q.date&&((daily.shift===q.shift&&daily.foreman===q.foreman)||(daily.shift==='1'&&q.shift==='2')),'QC_SOURCE_SESSION_DENIED')
 let source=null
 if(daily.sourceType==='MONTHLY'){
  need(parent?.status==='open','MONTHLY_PARENT_CLOSED')
  source=readMonthlySnapshot(parent,mpSnapshot).snapshot
 }else need(parent==null&&mpSnapshot==null,'UNEXPECTED_MONTHLY_PARENT')
 const s=readDailySnapshot(daily,dpSnapshot,source)
 need(header?.testOnly===true&&header.status==='open'&&header.dailyPlanIds.includes(daily.id)&&groupSnapshot?.workGroupId===header.workGroupId&&groupSnapshot.resources.foremanId===daily.foreman,'INVALID_GROUP_SNAPSHOT')
 need(foreman?.testOnly===true&&foreman.id===q.foreman&&foreman.active===true&&typeof foreman.name==='string'&&foreman.name.trim()===foreman.name&&foreman.name.length>0&&foreman.name.length<=160,'INVALID_EXECUTION_FOREMAN')
 // Only current member data. No other PID, group totals, other user records or master internals.
 return {testOnly:true,kind:daily.formType,dailyPlanId:daily.id,monthlyPlanLineId:daily.monthlyPlanLineId,pid:daily.pid,sourceType:daily.sourceType,date:daily.date,sourceShift:daily.shift,sourceForemanId:daily.foreman,sourceForemanName:groupSnapshot.resources.foremanName,executionShift:q.shift,executionForemanId:q.foreman,executionForemanName:foreman.name,carryover:daily.shift!==q.shift,dailyRevision:daily.revision,planningOrder:header.planningOrder,companyCode:s.companyCode,farm:s.farm,activityId:s.activityId,activity:s.activity,description:s.description,stage:s.stage,masterVariety:s.masterVariety,selectedVarieties:s.selectedVarieties,selectedVarietyDetails:s.selectedVarietyDetails,area100:daily.area100,materials:s.materials,areaSemantics:daily.formType==='fertilizer'?'COMPONENT_APPLICATION_ONLY':'SCALAR_APPLICATION'}
}
// These are theoretical estimates, never measured usage. Fertilizer must provide
// per-component area; one scalar area cannot represent overlapping components.
export function standardQcMaterials(source,input){
 need(source?.testOnly===true&&['spray','fertilizer'].includes(source.kind)&&Array.isArray(source.materials),'INVALID_QC_SOURCE')
 let areas
 if(source.kind==='spray'){
  exact(input,['actualArea100']);integer(input.actualArea100,10000000)
  areas=new Map(source.materials.map(m=>[m.materialId,input.actualArea100]))
 }else{
  exact(input,['componentAreas'])
  need(Array.isArray(input.componentAreas)&&input.componentAreas.length===source.materials.length&&Array.from({length:input.componentAreas.length},(_,i)=>Object.hasOwn(input.componentAreas,i)).every(Boolean),'COMPONENT_AREA_REQUIRED')
  areas=new Map()
  for(const c of input.componentAreas){exact(c,['materialId','area100']);sid(c.materialId);integer(c.area100,10000000);need(!areas.has(c.materialId)&&source.materials.some(m=>m.materialId===c.materialId),'INVALID_COMPONENT_AREA');areas.set(c.materialId,c.area100)}
 }
 return source.materials.map(m=>{
  const area100=areas.get(m.materialId),standardMaterial1000000=m.dose10000*area100
  need(Number.isSafeInteger(standardMaterial1000000),'MATERIAL_TOTAL_OVERFLOW')
  return {materialId:m.materialId,material:m.material,unit:m.unit,dose10000:m.dose10000,area100,standardMaterial1000000}
 })
}
