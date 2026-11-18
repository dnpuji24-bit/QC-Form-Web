// Synthetic, photo-free Fertilizer component commit. Application hectares are not physical coverage.
import {prepareComponentFertilizer} from './qcUatFertilizerMaterialIntegration.mjs'
import {qcSourceRequest,standardQcMaterials} from './qcUatPlanningQcSource.mjs'
import {equalSprayValue} from './qcUatPlanningSprayCommit.mjs'
const need=(ok,code)=>{if(!ok)throw Error(code)}
const sid=v=>typeof v==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(v)
const exact=(v,ks)=>need(v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===ks.length&&ks.every(k=>Object.hasOwn(v,k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value')),'INVALID_FERTILIZER_COMMIT_FIELDS')
export function fertilizerCommitRequest(input){
 exact(input,['record','baseRevision','jobId','uploaderUid','expectedDailyRevision','foremanId'])
 const r=input.record
 need(r&&typeof r.id==='string'&&/^qc-v2-uat-[a-z0-9-]{1,50}$/.test(r.id)&&sid(input.jobId)&&sid(input.uploaderUid)&&(input.baseRevision===null||sid(input.baseRevision)),'INVALID_FERTILIZER_COMMIT_ID')
 need(r.formType==='fertilizer'&&sid(r.clientRevision),'INVALID_FERTILIZER_COMMIT_ID')
 return {id:r.id.slice('qc-v2-'.length),sourceRequest:qcSourceRequest({dailyPlanId:r.dailyPlanId,expectedDailyRevision:input.expectedDailyRevision,formType:'fertilizer',date:r.date,shift:r.shift,foreman:input.foremanId})}
}
export function fertilizerFormSource(s){
 need(s?.testOnly===true&&s.kind==='fertilizer'&&s.areaSemantics==='COMPONENT_APPLICATION_ONLY','INVALID_FERTILIZER_SOURCE')
 need(Array.isArray(s.materials)&&s.materials.length>0&&s.materials.length<=20,'FERTILIZER_RECIPE_REQUIRED')
 need(s.materials.every(m=>m.unit==='kg'&&m.doseUnit==='kg'),'FERTILIZER_KG_REQUIRED')
 return {testOnly:true,kind:'fertilizer',dailyPlanId:s.dailyPlanId,monthlyPlanLineId:s.monthlyPlanLineId,date:s.date,shift:s.sourceShift,foreman:s.sourceForemanName,pid:s.pid,activity:s.activity,type:'FERTILIZER',companyCode:s.companyCode,farm:s.farm,sourceType:s.sourceType,planningOrder:s.planningOrder,areaHa:s.area100/100,materials:s.materials.map(m=>({material:m.material,dosePerHa:m.dose10000/10000,doseUnit:'kg',unit:'kg',totalMaterial:m.totalMaterial1000000/1000000}))}
}
export function fertilizerProducts(source,rows){
 need(Array.isArray(rows)&&rows.length<=100,'INVALID_FERTILIZER_PRODUCTS')
 const products=rows.map(p=>{
  exact(p,['testOnly','productId','name','componentId','material','active'])
  const m=source.materials.find(m=>m.materialId===p.componentId)
  need(p.testOnly===true&&sid(p.productId)&&m&&m.material===p.material&&typeof p.name==='string'&&p.name.trim()===p.name&&p.name.length>0&&p.name.length<=160&&typeof p.active==='boolean','INVALID_FERTILIZER_PRODUCT')
  const {testOnly,...v}=p;return v
 })
 return products.sort((a,b)=>a.productId.localeCompare(b.productId))
}
export function historicalFertilizerSource(current,old){
 need(equalSprayValue({...current,planningOrder:old.planningOrder,executionForemanName:old.executionForemanName},old),'QC_FERTILIZER_SOURCE_CHANGED')
 return old
}
export function preparePlanningFertilizer(input,source,products,uid){
 const {id,sourceRequest:q}=fertilizerCommitRequest(input),r=input.record
 need(input.uploaderUid===uid&&r.ownerUid===uid&&r.inputtedBy===uid,'QC_OWNER_ONLY')
 need(source?.dailyPlanId===q.dailyPlanId&&source.dailyRevision===q.expectedDailyRevision&&source.executionShift===q.shift&&source.executionForemanId===q.foreman&&source.date===q.date,'QC_FERTILIZER_SOURCE_MISMATCH')
 need(r.name===source.executionForemanName,'QC_EXECUTOR_MISMATCH')
 need(['draft','ready'].includes(r.saveType),'PHOTO_FREE_STATUS_ONLY')
 const dp=fertilizerFormSource(source),master=fertilizerProducts(source,products)
 const prepared=prepareComponentFertilizer(r,dp,master)
 // Retain exact standard amounts at six decimals, separately from legacy rounded kg100.
 const std=standardQcMaterials(source,{componentAreas:prepared.fertilizerComponents.map(c=>({materialId:c.componentId,area100:c.actualArea100}))})
 const materials=std.map(m=>{
  const c=prepared.fertilizerComponents.find(c=>c.componentId===m.materialId),planned=source.materials.find(p=>p.materialId===m.materialId)
  need(c&&Number.isSafeInteger(c.actualKg100)&&c.actualKg100<=100000000,'INVALID_COMPONENT_TOTAL')
  const actualMaterial1000000=c.actualKg100*10000
  return {...m,plannedMaterial1000000:planned.totalMaterial1000000,actualMaterial1000000,varianceMaterial1000000:actualMaterial1000000-m.standardMaterial1000000}
 })
 const record={testOnly:true,id,fullRecordId:r.id,ownerUid:uid,inputtedBy:uid,formType:'fertilizer',clientRevision:r.clientRevision,saveType:r.saveType,dailyPlanId:source.dailyPlanId,monthlyPlanLineId:source.monthlyPlanLineId,pid:source.pid,date:source.date,shift:source.executionShift,foreman:source.executionForemanId,sessionId:r.sessionId,areaSemantics:'APPLICATION_HA_ONLY',applicationArea100:prepared.applicationArea100,fertilizerComponents:prepared.fertilizerComponents,operationalSaveId:input.jobId,firestoreSaveState:'confirmed'}
 const actual=r.saveType==='draft'?null:{testOnly:true,actualReportId:'qcactual_'+id,qcRecordId:id,fullRecordId:r.id,sourceOrigin:'QC',qcFormType:'fertilizer',qcSessionId:r.sessionId,clientRevision:r.clientRevision,dailyPlanId:record.dailyPlanId,monthlyPlanLineId:record.monthlyPlanLineId,pid:record.pid,date:record.date,shift:record.shift,foreman:record.foreman,ownerUid:uid,areaSemantics:record.areaSemantics,applicationArea100:record.applicationArea100,fertilizerComponents:record.fertilizerComponents,materials}
 const detail={testOnly:true,canonicalQcId:id,fullRecordId:r.id,clientRevision:r.clientRevision,jobId:input.jobId,ownerUid:uid,source,products:master.map(p=>({testOnly:true,...p})),form:r,materials}
 const audit={testOnly:true,recordId:id,revision:r.clientRevision,actorUid:uid,username:uid,formType:'fertilizer',saveType:r.saveType}
 return {record,actual,detail,audit}
}
// Validate old canonical pair and immutable revision copy before replay or correction.
export function verifyFertilizerPair(current,actual,detail,audit,fullAudit,source,uid){
 need(current&&detail&&fullAudit&&audit,'FULL_FERTILIZER_PAIR_REQUIRES_REVIEW')
 const prior=preparePlanningFertilizer({record:detail.form,baseRevision:null,jobId:detail.jobId,uploaderUid:uid,expectedDailyRevision:source.dailyRevision,foremanId:source.executionForemanId},source,detail.products,uid)
 need(equalSprayValue(current,prior.record)&&equalSprayValue(actual,prior.actual)&&equalSprayValue(audit,prior.audit)&&equalSprayValue(detail,prior.detail)&&equalSprayValue(fullAudit,prior.detail),'FULL_FERTILIZER_PAIR_REQUIRES_REVIEW')
 return prior
}
