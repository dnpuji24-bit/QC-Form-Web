// 11D.5c.2b: lossless, photo-free full operational DTO envelope for the isolated UAT HTTP gateway.
// Never map a full form to the scalar QC record: that loses units, hold, filling, material and variance data.
// This helper has NO SDK, local storage, network or production imports.
import {validateSprayDto} from './qcUatSprayFullDto.mjs'
import {validateFertilizerDtoForComponents} from './qcUatFertilizerFullDto.mjs'
import {sprayFormSource,sprayCommitRequest} from './qcUatPlanningSprayCommit.mjs'
import {fertilizerFormSource,fertilizerCommitRequest} from './qcUatPlanningFertilizerCommit.mjs'
const need=(ok,code)=>{if(!ok)throw Error(code)}
const exact=(o,keys)=>o&&Object.getPrototypeOf(o)===Object.prototype&&Reflect.ownKeys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k))
const sid=v=>typeof v==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(v)
const noPhoto=value=>{
 if(!value||typeof value!=='object')return true
 for(const [key,v] of Object.entries(value)){
  if(/photoBase64|scanReportPhotoBase64/i.test(key)&&typeof v==='string'&&v.length>0)return false
  // Photo URL(s) remain separate signed-storage work; do not send an unverified link in this phase.
  if(/photoDriveUrl|scanReportDriveUrl/i.test(key)&&typeof v==='string'&&v.length>0)return false
  if(typeof v==='object'&&!noPhoto(v))return false
 }
 return true
}
export function prepareUnifiedFullQc(input){
 need(exact(input,['source','record','baseRevision','jobId','uploaderUid','expectedDailyRevision','foremanId']),'INVALID_FULL_QC_ENVELOPE')
 const {source,record:r}=input
 need(source?.testOnly===true&&['spray','fertilizer'].includes(source.kind)&&
  r?.formType===source.kind,'INVALID_FULL_QC_SOURCE')
 need(sid(input.uploaderUid)&&r.ownerUid===input.uploaderUid&&r.inputtedBy===input.uploaderUid,'QC_OWNER_ONLY')
 need(['draft','ready'].includes(r.saveType),'PHOTO_FREE_STATUS_ONLY')
 need(noPhoto(r),'PHOTO_GATE_PENDING')
 need(source.dailyPlanId===r.dailyPlanId&&source.date===r.date&&
  source.dailyRevision===input.expectedDailyRevision&&
  source.executionShift===r.shift&&source.executionForemanId===input.foremanId,'QC_FULL_SOURCE_MISMATCH')
 need(typeof input.expectedDailyRevision==='number'&&Number.isSafeInteger(input.expectedDailyRevision)&&input.expectedDailyRevision>=0&&input.expectedDailyRevision<1000000,'INVALID_DAILY_REVISION')
 const request={record:r,baseRevision:input.baseRevision,jobId:input.jobId,
  uploaderUid:input.uploaderUid,expectedDailyRevision:input.expectedDailyRevision,foremanId:input.foremanId}
 if(source.kind==='spray'){
  validateSprayDto(r,sprayFormSource(source))
  sprayCommitRequest(request)
 }else{
  validateFertilizerDtoForComponents(r,fertilizerFormSource(source))
  fertilizerCommitRequest(request)
 }
 // Deliberately carry the ENTIRE validated form. No scalar conversion, flattening, rounding,
 // reordering, and never replace the server's authoritative current source.
 return request
}
