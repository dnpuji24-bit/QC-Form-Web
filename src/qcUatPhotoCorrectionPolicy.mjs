// 11D.5c.3b.2f.1: correction of a VERIFIED full QC photo manifest.
// Pure guard used only inside the trusted Firestore emulator transaction.
// Previous immutable QC/full/manifest audits remain untouched. Photo-only delta:
// resubmit all slots; replace >=1, preserve full operational DTO byte-for-byte
// except for its new clientRevision. NO object deletion or browser-supplied URLs.
import {photoLedgerEqual} from './qcUatVerifiedPhotoLedger.mjs'

const need=(ok,code)=>{if(!ok)throw Error(code)}
const sid=v=>typeof v==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(v)
const obj=v=>v&&Object.getPrototypeOf(v)===Object.prototype

export function requirePhotoOnlyCorrection({currentQc,oldFull,oldLedger,oldPhotoAudit,request,newLedger}){
 const r=request?.record
 need(obj(currentQc)&&obj(oldFull)&&obj(oldLedger)&&obj(oldPhotoAudit)&&obj(newLedger)&&
  obj(r)&&obj(oldFull.form)&&obj(oldLedger.manifest)&&obj(newLedger.manifest),
  'PHOTO_CORRECTION_HISTORY_REQUIRED')
 need(oldFull.testOnly===true&&currentQc.testOnly===true&&oldLedger.testOnly===true&&
  photoLedgerEqual(oldLedger,oldPhotoAudit)&&
  oldLedger.recordId===currentQc.id&&oldFull.canonicalQcId===currentQc.id&&
  oldLedger.fullRecordId===oldFull.fullRecordId&&oldFull.fullRecordId===r.id&&
  oldFull.form.id===r.id&&oldFull.clientRevision===currentQc.clientRevision&&
  oldFull.form.clientRevision===currentQc.clientRevision&&
  oldLedger.clientRevision===currentQc.clientRevision&&
  oldLedger.ownerUid===currentQc.ownerUid&&oldFull.ownerUid===currentQc.ownerUid&&
  oldLedger.formType===currentQc.formType&&r.formType===currentQc.formType&&
  oldLedger.jobId===currentQc.operationalSaveId&&
  oldFull.jobId===currentQc.operationalSaveId&&
  oldLedger.dailyPlanId===r.dailyPlanId&&
  oldLedger.bucket===newLedger.bucket&&oldLedger.storageMode===newLedger.storageMode,
  'PHOTO_CORRECTION_HISTORY_INVALID')
 need(sid(request.baseRevision)&&request.baseRevision===currentQc.clientRevision&&
  sid(r.clientRevision)&&r.clientRevision!==currentQc.clientRevision&&
  newLedger.baseRevision===currentQc.clientRevision&&newLedger.clientRevision===r.clientRevision&&
  sid(request.jobId)&&request.jobId!==currentQc.operationalSaveId&&
  newLedger.jobId===request.jobId&&
  newLedger.ownerUid===currentQc.ownerUid&&r.ownerUid===currentQc.ownerUid&&
  newLedger.recordId===currentQc.id&&newLedger.fullRecordId===r.id,
  'PHOTO_CORRECTION_REVISION_CONFLICT')
 need(photoLedgerEqual({...r,clientRevision:oldFull.form.clientRevision},oldFull.form),
  'PHOTO_CORRECTION_OPERATIONAL_FIELDS_CHANGED')
 const prior=Object.keys(oldLedger.manifest).sort(),next=Object.keys(newLedger.manifest).sort()
 need(prior.length>0&&prior.length<=4&&photoLedgerEqual(prior,next),
  'PHOTO_CORRECTION_ALL_SLOTS_REQUIRED')
 need(!photoLedgerEqual(oldLedger.manifest,newLedger.manifest),
  'PHOTO_CORRECTION_NO_PHOTO_CHANGED')
 for(const slot of next){
  const a=oldLedger.manifest[slot],b=newLedger.manifest[slot]
  need(a?.kind===b?.kind&&a?.uploaderUid===b?.uploaderUid&&
   (a.kind!=='hold'||a.holdId===b.holdId),'PHOTO_CORRECTION_SLOT_CHANGED')
 }
 return Object.freeze({priorRevision:currentQc.clientRevision,newRevision:r.clientRevision,
  correctedSlots:next.filter(slot=>!photoLedgerEqual(oldLedger.manifest[slot],newLedger.manifest[slot]))})
}
