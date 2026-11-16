// Isolated UAT only. Never pass this representation to existing scalar progress readers.
import {createHash} from 'node:crypto'
import {validateFertilizerDtoForComponents} from './qcUatFertilizerFullDto.mjs'
import {commitQcAndActual} from './qcAtomicCommit.mjs'
import {stripOperationalPhotoPayload} from './qcOperationalPhotoManifest.mjs'
import {operationalQueueId} from './qcOperationalSaveTransport.mjs'
const need=(ok,code)=>{if(!ok)throw Error(code)}
const key=v=>String(v??'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ')
const sid=v=>typeof v==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(v)
const exact=(v,ks)=>need(v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).length===ks.length&&ks.every(k=>Object.hasOwn(v,k)),'INVALID_COMPONENT_FIELDS')
const quantity=v=>{const n=Math.round(v*100);need(Number.isFinite(v)&&v>=0&&Number.isSafeInteger(n)&&n<=100000000&&Math.abs(v*100-n)<1e-6,'COMPONENT_PRECISION_REQUIRED');return n}
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}'
const hash=v=>createHash('sha256').update(canonical(v)).digest('hex')
const sourceIdentity=r=>[r.dailyPlanId,r.monthlyPlanLineId,r.paddock,r.date,r.shift,key(r.name),r.activity]
export function prepareComponentFertilizer(r,dp,master){
 validateFertilizerDtoForComponents(r,dp)
 need(!r.photoBase64&&!r.scanReportPhotoBase64&&!r.photoDriveUrl&&!r.scanReportDriveUrl&&r.holdIntervals.every(h=>!h.photoBase64&&!h.photoDriveUrl)&&r.downtimeList.every(h=>!h.photoDriveUrl),'PHOTO_GATE_PENDING')
 need(Array.isArray(master)&&master.length<=100&&Array.isArray(dp.materials)&&dp.materials.length>0,'INVALID_COMPONENT_MASTER')
 const materials=dp.materials.map(m=>{
  need(typeof m.material==='string'&&key(m.material)&&Number.isFinite(m.dosePerHa)&&m.dosePerHa>0&&key(m.unit)==='kg'&&['kg','kg/ha'].includes(key(m.doseUnit)),'INVALID_COMPONENT_SOURCE')
  return m
 })
 need(new Set(materials.map(m=>key(m.material))).size===materials.length,'AMBIGUOUS_COMPONENT_SOURCE')
 const products=master.map(p=>{
  exact(p,['productId','name','componentId','material','active'])
  need(sid(p.productId)&&sid(p.componentId)&&typeof p.name==='string'&&key(p.name)&&typeof p.material==='string'&&key(p.material)&&typeof p.active==='boolean','INVALID_COMPONENT_MASTER')
  return p
 })
 need(new Set(products.map(p=>p.productId)).size===products.length&&new Set(products.map(p=>key(p.name))).size===products.length,'AMBIGUOUS_PRODUCT')
 const byMaterial=new Map(),byComponent=new Map()
 for(const p of products){
  const k=key(p.material)
  need(!byMaterial.has(k)||byMaterial.get(k)===p.componentId,'AMBIGUOUS_COMPONENT_ID')
  need(!byComponent.has(p.componentId)||byComponent.get(p.componentId)===k,'AMBIGUOUS_COMPONENT_ID')
  byMaterial.set(k,p.componentId);byComponent.set(p.componentId,k)
 }
 const rows=materials.map(m=>{
  const componentId=byMaterial.get(key(m.material))
  need(componentId,'UNMAPPED_SOURCE_COMPONENT')
  return {componentId,material:m.material,targetArea100:quantity(dp.areaHa),targetDoseKgHa:m.dosePerHa,actualArea100:0,actualKg100:0,estimatedKg100:0,weightedDoseKgHa:null,fillings:[]}
 })
 const ready=r.saveType!=='draft'
 for(const f of r.pengisianList){
  if(!ready&&!key(f.jenisPupuk)&&!f.jumlah&&!f.hasilKerja)continue
  const p=products.find(x=>key(x.name)===key(f.jenisPupuk))
  need(p&&p.active,'PRODUCT_NOT_AUTHORIZED')
  const c=rows.find(x=>x.componentId===p.componentId)
  need(c,'PRODUCT_NOT_IN_SOURCE')
  need(f.dosis===c.targetDoseKgHa,'COMPONENT_TARGET_DOSE_MISMATCH')
  const area100=quantity(f.hasilKerja),kg100=quantity(f.jumlah)
  c.actualArea100+=area100;c.actualKg100+=kg100
  c.fillings.push({fillingNo:f.pengisianKe,productId:p.productId,area100,kg100})
 }
 for(const c of rows){
  c.estimatedKg100=Math.round(c.actualArea100*c.targetDoseKgHa)
  c.weightedDoseKgHa=c.actualArea100?c.actualKg100/c.actualArea100:null
 }
 const applicationArea100=rows.reduce((s,c)=>s+c.actualArea100,0)
 need(applicationArea100===quantity(r.actualAreaHa),'COMPONENT_TOTAL_MISMATCH')
 // Keep the QC form's legacy scalar as application area for inspection; not physical coverage.
 // Replace its old all-material estimate with the correct per-component estimates.
 const estimates=rows.map(c=>({material:c.material,dosePerHa:c.targetDoseKgHa,doseUnit:'kg',unit:'kg',totalMaterial:c.estimatedKg100/100}))
 const record={...stripOperationalPhotoPayload(r),actualPlanMaterials:estimates,areaSemantics:'APPLICATION_HA_ONLY',applicationArea100,fertilizerComponents:rows}
 return {...record,componentFingerprint:hash(record)}
}
export function componentActual(record,buildActual){
 need(record?.testOnly===true&&record.formType==='fertilizer'&&record.areaSemantics==='APPLICATION_HA_ONLY','COMPONENT_RECORD_REQUIRED')
 if(record.saveType==='draft')return null
 const legacy=buildActual(record);need(legacy&&legacy.qcRecordId===record.id,'ACTUAL_MAPPER_FAILED')
 // Omit scalar fields rather than falsely reporting 42.5 ha as one plan's progress.
 const {actualAreaHa,plannedDailyAreaHa,dailyVarianceHa,materials,...metadata}=legacy
 return {...metadata,testOnly:true,clientRevision:record.clientRevision,areaSemantics:'APPLICATION_HA_ONLY',applicationArea100:record.applicationArea100,fertilizerComponents:record.fertilizerComponents,componentFingerprint:record.componentFingerprint,estimatedMaterials:record.actualPlanMaterials}
}
export async function commitComponentFertilizer({record,dp,master,baseRevision,uploaderUid},deps){
 const prepared=prepareComponentFertilizer(record,dp,master)
 need(prepared.ownerUid===uploaderUid,'OWNER_MISMATCH')
 const jobId=operationalQueueId(uploaderUid,prepared.id,prepared.clientRevision)
 return commitQcAndActual({record:prepared,baseRevision,jobId,uploaderUid},{
  currentUid:deps.currentUid,buildActual:r=>componentActual(r,deps.buildActual),
  transaction:fn=>deps.transaction(tx=>fn({...tx,readQc:async id=>{
   const old=await tx.readQc(id)
   if(old){
    need(old.areaSemantics==='APPLICATION_HA_ONLY'&&old.componentFingerprint,'LEGACY_COMPONENT_REVIEW_REQUIRED')
    need(old.ownerUid===prepared.ownerUid&&old.inputtedBy===prepared.inputtedBy,'OWNER_MISMATCH')
    need(canonical(sourceIdentity(old))===canonical(sourceIdentity(prepared)),'COMPONENT_SOURCE_IMMUTABLE')
    if(old.clientRevision===prepared.clientRevision){
     need(old.componentFingerprint===prepared.componentFingerprint&&old.operationalSaveId===jobId,'COMPONENT_REPLAY_CONFLICT')
     const actual=await tx.readActual('qcactual_'+id),expected=componentActual(old,deps.buildActual)
     if(expected)need(actual&&actual.componentFingerprint===expected.componentFingerprint&&actual.clientRevision===old.clientRevision&&canonical(actual.fertilizerComponents)===canonical(expected.fertilizerComponents)&&actual.qcRecordId===id,'COMPONENT_PAIR_MISMATCH')
     else need(!actual,'COMPONENT_PAIR_MISMATCH')
    }
   }
   return old
  }}))
 })
}
// Project current Actual documents (not QC history) into the verified per-component read model.
export function componentProgressRecords(actuals){
 need(Array.isArray(actuals)&&actuals.length<=100,'INVALID_ACTUAL_SNAPSHOT')
 const seen=new Set()
 return actuals.map(a=>{
  need(a?.testOnly===true&&a.qcFormType==='fertilizer'&&a.areaSemantics==='APPLICATION_HA_ONLY'&&a.actualReportId==='qcactual_'+a.qcRecordId&&/^qc-v2-uat-[a-z0-9-]{1,50}$/.test(a.qcRecordId)&&sid(a.clientRevision)&&Array.isArray(a.fertilizerComponents)&&!Object.hasOwn(a,'actualAreaHa'),'COMPONENT_ACTUAL_REQUIRED')
  need(!seen.has(a.actualReportId),'DUPLICATE_ACTUAL');seen.add(a.actualReportId)
  return {id:'uat-'+a.qcRecordId.slice('qc-v2-uat-'.length),revision:a.clientRevision,dailyPlanId:a.dailyPlanId,monthlyPlanLineId:a.monthlyPlanLineId,pid:a.pid,date:a.date,shift:a.shift,foreman:a.foreman,saveType:'ready',fillings:a.fertilizerComponents.flatMap(c=>c.fillings.map(f=>({id:'uat-f'+f.fillingNo,componentId:c.componentId,productId:f.productId,area100:f.area100,kg100:f.kg100})))}
 })
}
