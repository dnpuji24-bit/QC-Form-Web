// Isolated reconciliation review. Approval authorizes a proposed investigation only, never data repair.
import {createHash} from 'node:crypto'
import {equalSprayValue} from './qcUatPlanningSprayCommit.mjs'
const need=(ok,code)=>{if(!ok)throw Error(code)}
const sid=v=>typeof v==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(v)
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
const rev=v=>Number.isSafeInteger(v)&&v>=0&&v<1000000
const reason=v=>typeof v==='string'&&v===v.trim()&&v.length>=5&&v.length<=500
const exact=(v,ks)=>need(v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===ks.length&&ks.every(k=>Object.hasOwn(v,k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value')),'INVALID_REVIEW_FIELDS')
export const issueCodes=Object.freeze(['ACTUAL_RECONCILIATION_REQUIRED','MANUAL_RECONCILIATION_REQUIRED','MANUAL_ACTUAL_CONFLICT','MANUAL_SOURCE_CHANGED','INVALID_ACTUAL_PAIR','FULL_FERTILIZER_PAIR_REQUIRES_REVIEW','ENRICHED_SOURCE_REQUIRED','MISSING_DAILY_PLAN','CANCELLED_PLAN_HAS_ACTUAL'])
export const proposals=Object.freeze(['VERIFY_DUPLICATE','VERIFY_SOURCE_LINK','VERIFY_LEGACY_COMPONENTS','VERIFY_AUDIT','INVESTIGATE'])
export function evidenceFingerprint(id,code,versions){
 need(sid(id)&&issueCodes.includes(code)&&Array.isArray(versions)&&versions.length<=2000,'INVALID_REVIEW_EVIDENCE')
 const sorted=versions.map(v=>{
  need(Array.isArray(v)&&v.length===2&&typeof v[0]==='string'&&v[0].startsWith('qc_uat_workspaces/cutover/')&&(v[1]===null||typeof v[1]==='string'&&/^-?\d+:\d+$/.test(v[1])),'INVALID_REVIEW_EVIDENCE')
  return v
 }).sort((a,b)=>a[0].localeCompare(b[0]))
 need(new Set(sorted.map(v=>v[0])).size===sorted.length,'INVALID_REVIEW_EVIDENCE')
 return createHash('sha256').update(JSON.stringify([id,code,sorted])).digest('hex')
}
export function reviewRequest(q){
 need(q&&['submit','approve','reject','withdraw'].includes(q.action),'INVALID_REVIEW_ACTION')
 exact(q,['action','dailyPlanId','expectedRevision','reason',...(q.action==='submit'?['fingerprint','proposal']:[])])
 need(sid(q.dailyPlanId),'INVALID_SYNTHETIC_ID')
 need(q.action==='submit'&&q.expectedRevision===null||rev(q.expectedRevision),'INVALID_REVIEW_REVISION')
 need(reason(q.reason),'REVIEW_REASON_REQUIRED')
 if(q.action==='submit')need(hex(q.fingerprint)&&proposals.includes(q.proposal),'INVALID_REVIEW_PROPOSAL')
 return q
}
export function verifyReview(row,audit,id){
 need(row&&audit,'REVIEW_AUDIT_REQUIRED')
 exact(row,['testOnly','dailyPlanId','revision','status','issueCode','fingerprint','proposal','reason','submittedBy','decisionBy','decisionReason','applied'])
 need(row.testOnly===true&&row.dailyPlanId===id&&sid(id)&&rev(row.revision)&&['PENDING','APPROVED','REJECTED','WITHDRAWN','APPLIED'].includes(row.status)&&issueCodes.includes(row.issueCode)&&hex(row.fingerprint)&&proposals.includes(row.proposal)&&reason(row.reason)&&sid(row.submittedBy)&&row.applied===(row.status==='APPLIED'),'INVALID_REVIEW_ROW')
 if(row.status==='PENDING')need(row.decisionBy===null&&row.decisionReason===null,'INVALID_REVIEW_ROW')
 else need(sid(row.decisionBy)&&reason(row.decisionReason)&&(row.status==='WITHDRAWN'?row.decisionBy===row.submittedBy:row.decisionBy!==row.submittedBy),'INVALID_REVIEW_ROW')
 const action={PENDING:'submit',APPROVED:'approve',REJECTED:'reject',WITHDRAWN:'withdraw',APPLIED:'apply'}[row.status]
 exact(audit,['testOnly','dailyPlanId','revision','actorUid','action','before','after'])
 need(audit.testOnly===true&&audit.dailyPlanId===id&&audit.revision===row.revision&&audit.action===action&&audit.actorUid===(row.decisionBy??row.submittedBy)&&equalSprayValue(audit.after,row),'REVIEW_AUDIT_REQUIRED')
 need(row.revision===0?audit.before===null:audit.before?.revision===row.revision-1&&audit.before.dailyPlanId===id,'REVIEW_AUDIT_REQUIRED')
 if(row.status==='APPLIED')need(audit.before?.status==='APPROVED'&&audit.before.applied===false&&equalSprayValue({...audit.before,revision:row.revision,status:'APPLIED',applied:true},row),'REVIEW_AUDIT_REQUIRED')
 return row
}
export function nextReview(input,prior,evidence,uid){
 const q=reviewRequest(input)
 need(sid(uid),'INVALID_SYNTHETIC_ID')
 need(q.expectedRevision===(prior?.revision??null),'REVIEW_REVISION_CONFLICT')
 const revision=(prior?.revision??-1)+1
 need(rev(revision),'INVALID_REVIEW_REVISION')
 if(q.action==='submit'){
  need(!prior||prior.status!=='PENDING','REVIEW_ALREADY_PENDING')
  need(evidence?.dailyPlanId===q.dailyPlanId&&evidence.status==='REVIEW_REQUIRED'&&issueCodes.includes(evidence.code),'REVIEW_ISSUE_REQUIRED')
  need(evidence.fingerprint===q.fingerprint,'REVIEW_EVIDENCE_CHANGED')
  return {testOnly:true,dailyPlanId:q.dailyPlanId,revision,status:'PENDING',issueCode:evidence.code,fingerprint:evidence.fingerprint,proposal:q.proposal,reason:q.reason,submittedBy:uid,decisionBy:null,decisionReason:null,applied:false}
 }
 need(prior?.status==='PENDING','REVIEW_NOT_PENDING')
 if(q.action==='withdraw')need(prior.submittedBy===uid,'REVIEW_SUBMITTER_ONLY')
 else need(prior.submittedBy!==uid,'REVIEW_INDEPENDENT_APPROVER_REQUIRED')
 if(q.action==='approve')need(evidence?.dailyPlanId===prior.dailyPlanId&&evidence.status==='REVIEW_REQUIRED'&&evidence.code===prior.issueCode&&evidence.fingerprint===prior.fingerprint,'REVIEW_EVIDENCE_CHANGED')
 return {...prior,revision,status:{approve:'APPROVED',reject:'REJECTED',withdraw:'WITHDRAWN'}[q.action],decisionBy:uid,decisionReason:q.reason}
}
