// Photo-free, synthetic full Spray candidate; canonical QC + Actual stay scalar.
// Never infer measured usage from theoretical estimates.
import {validateSprayDto} from './qcUatSprayFullDto.mjs'
import {qcSourceRequest,standardQcMaterials} from './qcUatPlanningQcSource.mjs'
const need=(ok,code)=>{if(!ok)throw Error(code)}
const sid=v=>typeof v==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(v)
const exact=(v,ks)=>need(v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===ks.length&&ks.every(k=>Object.hasOwn(v,k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value')),'INVALID_SPRAY_COMMIT_FIELDS')
export function equalSprayValue(a,b){
 if(a===b)return true
 if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false
 const ks=Object.keys(a);return ks.length===Object.keys(b).length&&ks.every(k=>Object.hasOwn(b,k)&&equalSprayValue(a[k],b[k]))
}
export function sprayCommitRequest(input){
 exact(input,['record','baseRevision','jobId','uploaderUid','expectedDailyRevision','foremanId'])
 const r=input.record
 need(r&&typeof r.id==='string'&&/^qc-v2-uat-[a-z0-9-]{1,60}$/.test(r.id)&&sid(input.jobId)&&sid(input.uploaderUid)&&(input.baseRevision===null||sid(input.baseRevision)),'INVALID_SPRAY_COMMIT_ID')
 need(r.formType==='spray'&&sid(r.clientRevision),'INVALID_SPRAY_COMMIT_ID')
 const sourceRequest=qcSourceRequest({dailyPlanId:r.dailyPlanId,expectedDailyRevision:input.expectedDailyRevision,formType:'spray',date:r.date,shift:r.shift,foreman:input.foremanId})
 return {id:r.id.slice('qc-v2-'.length),sourceRequest}
}
export function sprayFormSource(s){
 need(s?.testOnly===true&&s.kind==='spray'&&s.areaSemantics==='SCALAR_APPLICATION','INVALID_SPRAY_SOURCE')
 // Existing Spray form has four actual-usage slots. Do not silently truncate.
 need(Array.isArray(s.materials)&&s.materials.length<=4,'SPRAY_MATERIAL_SLOT_LIMIT')
 return {testOnly:true,kind:'spray',dailyPlanId:s.dailyPlanId,monthlyPlanLineId:s.monthlyPlanLineId,date:s.date,shift:s.sourceShift,foreman:s.sourceForemanName,pid:s.pid,activity:s.activity,description:s.description,masterVariety:s.masterVariety,type:'SPRAY',companyCode:s.companyCode,farm:s.farm,sourceType:s.sourceType,planningOrder:s.planningOrder,areaHa:s.area100/100,materials:s.materials.map(m=>({material:m.material,dosePerHa:m.dose10000/10000,doseUnit:m.doseUnit,unit:m.unit,totalMaterial:m.totalMaterial1000000/1000000}))}
}
function actualQuantity(v){
 if(v==='')return null
 need(typeof v==='string'||typeof v==='number','INVALID_ACTUAL_MATERIAL')
 const s=String(v).replace(',','.')
 need(/^\d+(\.\d{1,6})?$/.test(s),'INVALID_ACTUAL_MATERIAL')
 const [a,b='']=s.split('.'),n=Number(a)*1000000+Number(b.padEnd(6,'0'))
 need(Number.isSafeInteger(n)&&n>=0&&n<=1000000000000,'INVALID_ACTUAL_MATERIAL')
 return n
}
export function preparePlanningSpray(input,source,uid){
 const {id,sourceRequest:q}=sprayCommitRequest(input),r=input.record
 need(input.uploaderUid===uid&&r.ownerUid===uid&&r.inputtedBy===uid,'QC_OWNER_ONLY')
 need(source?.dailyPlanId===q.dailyPlanId&&source.dailyRevision===q.expectedDailyRevision&&source.executionShift===q.shift&&source.executionForemanId===q.foreman&&source.date===q.date,'QC_SPRAY_SOURCE_MISMATCH')
 need(r.name===source.executionForemanName,'QC_EXECUTOR_MISMATCH')
 const dp=sprayFormSource(source)
 validateSprayDto(r,dp)
 need(!r.photoBase64&&!r.photoDriveUrl&&r.holdIntervals.every(h=>!h.photoBase64&&!h.photoDriveUrl),'PHOTO_GATE_PENDING')
 need(['draft','ready'].includes(r.saveType),'PHOTO_FREE_STATUS_ONLY')
 const area100=Math.round(r.actualAreaHa*100)
 need(Number.isSafeInteger(area100)&&area100>=0&&area100<=10000000&&Math.abs(r.actualAreaHa*100-area100)<1e-6,'SPRAY_AREA_PRECISION')
 const std=standardQcMaterials(source,{actualArea100:area100})
 for(let i=source.materials.length+1;i<=4;i++)need(r['actUsagePesticide'+i]==='','UNMAPPED_ACTUAL_MATERIAL')
 const materials=std.map((m,i)=>{
  const planned=source.materials[i],actual=actualQuantity(r['actUsagePesticide'+(i+1)])
  return {...m,plannedMaterial1000000:planned.totalMaterial1000000,actualMaterial1000000:actual,varianceMaterial1000000:actual===null?null:actual-m.standardMaterial1000000}
 })
 actualQuantity(r.actUsageAdjuvant) // validate recorded number, no unverified unit conversion.
 const record={testOnly:true,id,ownerUid:uid,inputtedBy:uid,formType:'spray',clientRevision:r.clientRevision,saveType:r.saveType,dailyPlanId:source.dailyPlanId,monthlyPlanLineId:source.monthlyPlanLineId,pid:source.pid,date:source.date,shift:source.executionShift,foreman:source.executionForemanId,actualArea100:area100,sessionId:r.sessionId}
 const detail={testOnly:true,canonicalQcId:id,fullRecordId:r.id,clientRevision:r.clientRevision,jobId:input.jobId,ownerUid:uid,source,form:r,materials}
 return {record,detail,job:{record,baseRevision:input.baseRevision,jobId:input.jobId,uploaderUid:uid}}
}
// Reorder and display-name updates do not rewrite existing QC source history.
export function historicalSpraySource(current,old){
 const next={...current,planningOrder:old.planningOrder,executionForemanName:old.executionForemanName}
 need(equalSprayValue(next,old),'QC_SPRAY_SOURCE_CHANGED')
 return old
}
