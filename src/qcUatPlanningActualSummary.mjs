// Read-model candidate for current, validated QC Actual pairs. Never pool physical and component hectares.
const need=(ok,code)=>{if(!ok)throw Error(code)}
const sid=v=>typeof v==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(v)
const qty=v=>{need(Number.isSafeInteger(v)&&v>=0,'INVALID_SUMMARY_QUANTITY');return v}
const sum=xs=>qty(xs.reduce((a,b)=>a+qty(b),0))
const label=v=>{need(typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=160,'INVALID_SUMMARY_LABEL');return v}
const exact=(v,ks)=>need(v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===ks.length&&ks.every(k=>Object.hasOwn(v,k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value')),'INVALID_SUMMARY_FIELDS')
export function summaryRequest(q){
 exact(q,['scope','id'])
 need(['daily','monthly'].includes(q.scope)&&sid(q.id),'INVALID_SUMMARY_REQUEST')
 return q
}
export function actualProjection(a,detail){
 need(a?.testOnly===true&&detail?.testOnly===true&&sid(a.qcRecordId)&&a.actualReportId==='qcactual_'+a.qcRecordId&&a.qcRecordId===detail.canonicalQcId&&a.clientRevision===detail.clientRevision,'INVALID_ACTUAL_PAIR')
 const common={id:a.actualReportId,qcRecordId:a.qcRecordId,revision:a.clientRevision,kind:a.qcFormType,dailyPlanId:a.dailyPlanId,monthlyPlanLineId:a.monthlyPlanLineId,pid:a.pid,date:a.date,shift:a.shift,foreman:a.foreman,materials:detail.materials}
 if(a.qcFormType==='spray'){
  need(!Object.hasOwn(a,'applicationArea100')&&Number.isSafeInteger(a.actualArea100)&&a.actualArea100>0,'INVALID_SPRAY_ACTUAL')
  return {...common,areaSemantics:'SCALAR_APPLICATION',actualArea100:a.actualArea100}
 }
 need(a.qcFormType==='fertilizer'&&a.areaSemantics==='APPLICATION_HA_ONLY'&&!Object.hasOwn(a,'actualArea100')&&!Object.hasOwn(a,'actualAreaHa')&&qty(a.applicationArea100)>0,'INVALID_COMPONENT_ACTUAL')
 return {...common,areaSemantics:'APPLICATION_HA_ONLY',applicationArea100:a.applicationArea100}
}
// Only use after validating full current records, immutable audits and source links.
export function summarizeActualPlan(input){
 exact(input,['kind','targetArea100','cancelled','materials','actuals'])
 const {kind,targetArea100,cancelled,materials,actuals}=input
 need(['spray','fertilizer'].includes(kind)&&qty(targetArea100)>0&&typeof cancelled==='boolean','INVALID_SUMMARY_PLAN')
 need(Array.isArray(materials)&&materials.length<=20&&Array.isArray(actuals)&&actuals.length<=100,'INVALID_SUMMARY_LIST')
 need(kind==='spray'||materials.length>0,'FERTILIZER_RECIPE_REQUIRED')
 need(new Set(materials.map(m=>m.materialId)).size===materials.length&&new Set(actuals.map(a=>a.id)).size===actuals.length,'DUPLICATE_SUMMARY_ID')
 need(!cancelled||actuals.length===0,'CANCELLED_PLAN_HAS_ACTUAL')
 for(const a of actuals){
  need(a.kind===kind&&['1','2'].includes(a.shift)&&Array.isArray(a.materials)&&a.materials.length===materials.length&&new Set(a.materials.map(m=>m.materialId)).size===materials.length,'SUMMARY_FORM_MISMATCH')
  if(kind==='spray')need(a.areaSemantics==='SCALAR_APPLICATION'&&qty(a.actualArea100)>0&&!Object.hasOwn(a,'applicationArea100'),'INVALID_SPRAY_ACTUAL')
  else need(a.areaSemantics==='APPLICATION_HA_ONLY'&&qty(a.applicationArea100)>0&&!Object.hasOwn(a,'actualArea100')&&!Object.hasOwn(a,'actualAreaHa')&&sum(a.materials.map(m=>m.area100))===a.applicationArea100,'INVALID_COMPONENT_ACTUAL')
 }
 const componentRows=materials.map(m=>{
  need(sid(m.materialId)&&label(m.material)&&label(m.unit)&&qty(m.dose10000)>0,'INVALID_SUMMARY_MATERIAL')
  const planned=qty(targetArea100*m.dose10000)
  need(m.totalMaterial1000000===planned,'INVALID_SUMMARY_MATERIAL')
  const entries=actuals.map(a=>{
   const v=a.materials.find(x=>x.materialId===m.materialId)
   need(v&&v.material===m.material&&v.unit===m.unit&&v.dose10000===m.dose10000,'SUMMARY_MATERIAL_MISMATCH')
   qty(v.area100)
   if(kind==='spray')need(v.area100===a.actualArea100,'SUMMARY_MATERIAL_AREA_MISMATCH')
   need(v.standardMaterial1000000===qty(v.area100*v.dose10000),'SUMMARY_MATERIAL_STANDARD_MISMATCH')
   need(v.actualMaterial1000000===null?kind==='spray'&&v.varianceMaterial1000000===null:qty(v.actualMaterial1000000)>=0&&v.varianceMaterial1000000===v.actualMaterial1000000-v.standardMaterial1000000,'INVALID_SUMMARY_MEASURED')
   return {v,shift:a.shift}
  })
  const area=sum(entries.map(e=>e.v.area100)),standard=sum(entries.map(e=>e.v.standardMaterial1000000))
  const unknown=entries.filter(e=>e.v.actualMaterial1000000===null).length,known=sum(entries.map(e=>e.v.actualMaterial1000000??0))
  return {materialId:m.materialId,material:m.material,unit:m.unit,dose10000:m.dose10000,targetArea100,actualArea100:area,signedBalance100:targetArea100-area,remainingArea100:Math.max(0,targetArea100-area),overArea100:Math.max(0,area-targetArea100),progressPct:area/targetArea100*100,plannedMaterial1000000:planned,standardMaterial1000000:standard,knownActualMaterial1000000:known,unknownActualCount:unknown,actualMaterial1000000:unknown?null:known,varianceMaterial1000000:unknown?null:known-standard,actualByShift100:Object.fromEntries(['1','2'].map(s=>[s,sum(entries.filter(e=>e.shift===s).map(e=>e.v.area100))]))}
 })
 const common={kind,targetArea100,cancelled,actualCount:actuals.length,materials:componentRows}
 if(kind==='spray'){
  const area=sum(actuals.map(a=>a.actualArea100)),balance=targetArea100-area
  return {...common,areaSemantics:'SCALAR_APPLICATION',actualArea100:area,signedBalance100:balance,remainingArea100:Math.max(0,balance),overArea100:Math.max(0,-balance),progressPct:area/targetArea100*100,status:cancelled?'CANCELLED':area===0?'PLANNED':balance>0?'ON PROGRESS':balance===0?'DONE':'OVER ACTUAL',actualByShift100:Object.fromEntries(['1','2'].map(s=>[s,sum(actuals.filter(a=>a.shift===s).map(a=>a.actualArea100))]))}
 }
 const done=componentRows.every(c=>c.signedBalance100<=0),applicationArea100=sum(componentRows.map(c=>c.actualArea100))
 return {...common,areaSemantics:'APPLICATION_HA_ONLY',applicationArea100,applicationTargetArea100:qty(targetArea100*componentRows.length),limitingProgressPct:Math.min(...componentRows.map(c=>c.progressPct)),status:cancelled?'CANCELLED':done?'DONE':applicationArea100?'ON PROGRESS':'PLANNED',done:!cancelled&&done}
}
