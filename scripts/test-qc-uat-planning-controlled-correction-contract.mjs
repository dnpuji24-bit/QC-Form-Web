import assert from 'node:assert/strict'
import {correctionRequest,duplicateCandidate,appliedReview,correctionReceipt,verifyCorrectionReceipt} from '../src/qcUatPlanningControlledCorrection.mjs'
import {nextReview,verifyReview} from '../src/qcUatPlanningReconciliationReview.mjs'
const id='uat-d1',uid='uat-reviewer',fingerprint='a'.repeat(64),ev={dailyPlanId:id,status:'REVIEW_REQUIRED',code:'ACTUAL_RECONCILIATION_REQUIRED',fingerprint}
const pending=nextReview({action:'submit',dailyPlanId:id,expectedRevision:null,fingerprint,proposal:'VERIFY_DUPLICATE',reason:'Check duplicate'},null,ev,'uat-submitter')
const approved=nextReview({action:'approve',dailyPlanId:id,expectedRevision:0,reason:'Checked evidence'},pending,ev,uid)
const q={dailyPlanId:id,expectedRevision:1,reason:'Archive exact duplicate'}
const a={testOnly:true,sourceOrigin:'QC',qcFormType:'spray',dailyPlanId:id,qcRecordId:'uat-q1',actualReportId:'qcactual_uat-q1',actualArea100:800},canonical={id:a.actualReportId,row:a},copy={id:'uat-copy',row:{...a}},rows=[canonical,copy]
const c=duplicateCandidate(id,rows),after=appliedReview(q,approved,ev,uid)
let n=0
const check=(name,fn)=>{fn();n++;console.log('PASS: '+name)},deny=(fn,message)=>assert.throws(fn,{message})
check('only unique exact duplicate recognized regardless of map key order',()=>{assert.equal(c.duplicateId,copy.id);assert.equal(c.canonicalId,canonical.id);assert.equal(duplicateCandidate(id,[canonical,{...copy,row:Object.fromEntries(Object.entries(a).reverse())}]).duplicateId,copy.id)})
check('ambiguous mismatched missing canonical and non-synthetic rows rejected',()=>{for(const x of [[copy],[canonical,{...copy,row:{...a,actualArea100:900}}],[...rows,{...copy,id:'uat-copy2'}],[canonical,{...copy,id:'production-copy'}]])assert.equal(duplicateCandidate(id,x),null)})
check('component Actual duplicate recognized without scalar inference',()=>{const f={...a,qcFormType:'fertilizer',applicationArea100:1300};delete f.actualArea100;assert.equal(duplicateCandidate(id,[{...canonical,row:f},{...copy,row:{...f}}]).duplicateId,copy.id)})
check('request exact, no patch or supplied target and reason mandatory',()=>{deny(()=>correctionRequest({...q,duplicateId:copy.id}),'INVALID_CORRECTION_FIELDS');deny(()=>correctionRequest({...q,reason:'x'}),'CORRECTION_REASON_REQUIRED')})
check('approval revision and proposal enforced',()=>{deny(()=>appliedReview(q,pending,ev,uid),'REVIEW_REVISION_CONFLICT');deny(()=>appliedReview(q,{...approved,proposal:'INVESTIGATE'},ev,uid),'CORRECTION_NOT_APPROVED');deny(()=>appliedReview({...q,expectedRevision:2},approved,ev,uid),'REVIEW_REVISION_CONFLICT')})
check('only independent approver may apply unchanged unresolved evidence',()=>{deny(()=>appliedReview(q,approved,ev,'uat-submitter'),'CORRECTION_APPROVER_ONLY');deny(()=>appliedReview(q,approved,{...ev,fingerprint:'b'.repeat(64)},uid),'REVIEW_EVIDENCE_CHANGED');deny(()=>appliedReview(q,approved,{...ev,status:'CLEAR'},uid),'REVIEW_EVIDENCE_CHANGED')})
check('applied transition preserves approval and verifies audit',()=>{assert.equal(after.status,'APPLIED');assert.equal(after.applied,true);assert.equal(after.revision,2);const audit={testOnly:true,dailyPlanId:id,revision:2,actorUid:uid,action:'apply',before:approved,after};assert.deepEqual(verifyReview(after,audit,id),after);deny(()=>verifyReview(after,{...audit,before:pending},id),'REVIEW_AUDIT_REQUIRED');deny(()=>appliedReview({...q,expectedRevision:2},after,ev,uid),'CORRECTION_NOT_APPROVED')})
check('archive receipt preserves complete original and approval identity',()=>{const r=correctionReceipt(q,approved,after,c,uid);assert.deepEqual(r.original,a);assert.deepEqual(verifyCorrectionReceipt(r,after),r);deny(()=>verifyCorrectionReceipt({...r,canonicalId:'wrong'},after),'CORRECTION_RECEIPT_REQUIRED')})
console.log('SUCCESS: '+n+' Controlled correction contract checks (offline)')
