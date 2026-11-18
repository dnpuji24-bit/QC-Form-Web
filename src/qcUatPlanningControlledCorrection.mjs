// Narrow, synthetic remediation: archive one byte-equivalent logical QC Actual duplicate.
// No relink, inferred component areas, arbitrary patch, or canonical row modification.
import {equalSprayValue} from './qcUatPlanningSprayCommit.mjs'
const need=(ok,code)=>{if(!ok)throw Error(code)}
const sid=v=>typeof v==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(v)
const rev=v=>Number.isSafeInteger(v)&&v>=0&&v<999999
const exact=(v,ks)=>need(v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===ks.length&&ks.every(k=>Object.hasOwn(v,k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value')),'INVALID_CORRECTION_FIELDS')
export function correctionRequest(q){
 exact(q,['dailyPlanId','expectedRevision','reason'])
 need(sid(q.dailyPlanId)&&rev(q.expectedRevision),'INVALID_CORRECTION_REQUEST')
 need(typeof q.reason==='string'&&q.reason===q.reason.trim()&&q.reason.length>=5&&q.reason.length<=500,'CORRECTION_REASON_REQUIRED')
 return q
}
export function duplicateCandidate(id,actuals){
 need(sid(id)&&Array.isArray(actuals)&&actuals.length<=100,'INVALID_CORRECTION_SCOPE')
 const candidates=[]
 for(const item of actuals){
  const a=item.row
  if(!sid(item.id)||a?.testOnly!==true||a.sourceOrigin!=='QC'||a.dailyPlanId!==id||!sid(a.qcRecordId)||a.actualReportId!=='qcactual_'+a.qcRecordId||!['spray','fertilizer'].includes(a.qcFormType))continue
  const canonical=actuals.find(x=>x.id===a.actualReportId)
  if(canonical&&equalSprayValue(canonical.row,a))candidates.push({duplicateId:item.id,canonicalId:canonical.id,original:a})
 }
 return candidates.length===1?candidates[0]:null
}
export function appliedReview(input,before,evidence,uid){
 const q=correctionRequest(input)
 need(before?.dailyPlanId===q.dailyPlanId&&before.revision===q.expectedRevision,'REVIEW_REVISION_CONFLICT')
 need(before.status==='APPROVED'&&before.applied===false&&before.proposal==='VERIFY_DUPLICATE'&&before.issueCode==='ACTUAL_RECONCILIATION_REQUIRED','CORRECTION_NOT_APPROVED')
 need(before.decisionBy===uid&&before.submittedBy!==uid,'CORRECTION_APPROVER_ONLY')
 need(evidence?.dailyPlanId===q.dailyPlanId&&evidence.status==='REVIEW_REQUIRED'&&evidence.code===before.issueCode&&evidence.fingerprint===before.fingerprint,'REVIEW_EVIDENCE_CHANGED')
 return {...before,revision:before.revision+1,status:'APPLIED',applied:true}
}
export function correctionReceipt(input,before,after,candidate,uid){
 const q=correctionRequest(input)
 need(sid(candidate?.duplicateId)&&candidate.canonicalId==='qcactual_'+candidate.original?.qcRecordId&&candidate.original?.dailyPlanId===q.dailyPlanId,'INVALID_CORRECTION_CANDIDATE')
 return {testOnly:true,action:'ARCHIVE_EXACT_QC_DUPLICATE',dailyPlanId:q.dailyPlanId,approvedRevision:before.revision,revision:after.revision,actorUid:uid,reason:q.reason,fingerprint:before.fingerprint,duplicateId:candidate.duplicateId,canonicalId:candidate.canonicalId,original:candidate.original}
}
export function verifyCorrectionReceipt(receipt,row){
 need(receipt&&row?.status==='APPLIED','CORRECTION_RECEIPT_REQUIRED')
 exact(receipt,['testOnly','action','dailyPlanId','approvedRevision','revision','actorUid','reason','fingerprint','duplicateId','canonicalId','original'])
 need(receipt.testOnly===true&&receipt.action==='ARCHIVE_EXACT_QC_DUPLICATE'&&receipt.dailyPlanId===row.dailyPlanId&&receipt.approvedRevision===row.revision-1&&receipt.revision===row.revision&&receipt.actorUid===row.decisionBy&&receipt.fingerprint===row.fingerprint&&typeof receipt.reason==='string'&&receipt.reason.trim()===receipt.reason&&receipt.reason.length>=5&&receipt.reason.length<=500&&sid(receipt.duplicateId)&&receipt.original?.testOnly===true&&receipt.original.sourceOrigin==='QC'&&receipt.original.dailyPlanId===row.dailyPlanId&&sid(receipt.original.qcRecordId)&&receipt.canonicalId==='qcactual_'+receipt.original.qcRecordId&&receipt.original.actualReportId===receipt.canonicalId,'CORRECTION_RECEIPT_REQUIRED')
 return receipt
}
