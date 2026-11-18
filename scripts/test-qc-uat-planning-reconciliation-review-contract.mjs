import assert from 'node:assert/strict'
import {evidenceFingerprint,reviewRequest,nextReview,verifyReview} from '../src/qcUatPlanningReconciliationReview.mjs'
const id='uat-d1',uid='uat-submitter',reviewer='uat-reviewer',code='ACTUAL_RECONCILIATION_REQUIRED',prefix='qc_uat_workspaces/cutover/'
const versions=[[prefix+'daily_plans/'+id,'10:20'],[prefix+'daily_reports/uat-orphan','12:34'],[prefix+'qc_records/uat-missing',null]]
const fingerprint=evidenceFingerprint(id,code,versions),ev={dailyPlanId:id,status:'REVIEW_REQUIRED',code,fingerprint}
const q={action:'submit',dailyPlanId:id,expectedRevision:null,fingerprint,proposal:'VERIFY_DUPLICATE',reason:'Investigate orphan Actual'}
const run=(input=q,prior=null,e=ev,actor=uid)=>nextReview(input,prior,e,actor)
const p=run(),dec=(action,revision=0)=>({action,dailyPlanId:id,expectedRevision:revision,reason:'Reviewed field evidence'})
const audit={testOnly:true,dailyPlanId:id,revision:0,actorUid:uid,action:'submit',before:null,after:p}
let n=0
const check=(name,fn)=>{fn();n++;console.log('PASS: '+name)},deny=(fn,message)=>assert.throws(fn,{message})
check('fingerprint stable by path order but changes on update or missing document',()=>{assert.equal(fingerprint,evidenceFingerprint(id,code,[...versions].reverse()));assert.notEqual(fingerprint,evidenceFingerprint(id,code,[...versions.slice(0,2),[versions[2][0],'0:1']]));assert.notEqual(fingerprint,evidenceFingerprint(id,code,versions.slice(0,2)));deny(()=>evidenceFingerprint(id,code,[versions[0],versions[0]]),'INVALID_REVIEW_EVIDENCE')})
check('strict request rejects executable correction or injected actor',()=>{deny(()=>reviewRequest({...q,patch:{actualArea100:0}}),'INVALID_REVIEW_FIELDS');deny(()=>reviewRequest({...q,proposal:'DELETE_ACTUAL'}),'INVALID_REVIEW_PROPOSAL');deny(()=>reviewRequest({...q,reason:'x'}),'REVIEW_REASON_REQUIRED')})
check('submit requires current unresolved evidence',()=>{assert.equal(p.status,'PENDING');assert.equal(p.applied,false);deny(()=>run(q,null,{...ev,status:'CLEAR'}),'REVIEW_ISSUE_REQUIRED');deny(()=>run(q,null,{...ev,fingerprint:'0'.repeat(64)}),'REVIEW_EVIDENCE_CHANGED')})
check('duplicate pending and stale revision denied',()=>{deny(()=>run({...q,expectedRevision:0},p),'REVIEW_ALREADY_PENDING');deny(()=>run(q,p),'REVIEW_REVISION_CONFLICT')})
check('cannot approve or reject own submission',()=>{deny(()=>run(dec('approve'),p),'REVIEW_INDEPENDENT_APPROVER_REQUIRED');deny(()=>run(dec('reject'),p),'REVIEW_INDEPENDENT_APPROVER_REQUIRED')})
check('approval binds evidence and never marks applied',()=>{const x=run(dec('approve'),p,ev,reviewer);assert.equal(x.status,'APPROVED');assert.equal(x.applied,false);assert.equal(x.decisionBy,reviewer);deny(()=>run(dec('approve'),p,{...ev,fingerprint:'1'.repeat(64)},reviewer),'REVIEW_EVIDENCE_CHANGED');deny(()=>run(dec('approve'),p,{...ev,status:'CLEAR'},reviewer),'REVIEW_EVIDENCE_CHANGED')})
check('reject and withdraw can close stale proposal, only submitter withdraws',()=>{assert.equal(run(dec('reject'),p,null,reviewer).status,'REJECTED');assert.equal(run(dec('withdraw'),p,null).status,'WITHDRAWN');deny(()=>run(dec('withdraw'),p,null,reviewer),'REVIEW_SUBMITTER_ONLY')})
check('terminal case cannot be decided again; new proposal increments revision',()=>{const x=run(dec('reject'),p,null,reviewer);deny(()=>run(dec('approve',1),x,ev,reviewer),'REVIEW_NOT_PENDING');const y=run({...q,expectedRevision:1},x);assert.equal(y.revision,2);assert.equal(y.status,'PENDING')})
check('immutable latest audit binds row and actor',()=>{assert.deepEqual(verifyReview(p,audit,id),p);deny(()=>verifyReview(p,null,id),'REVIEW_AUDIT_REQUIRED');deny(()=>verifyReview({...p,reason:'Changed reason'},audit,id),'REVIEW_AUDIT_REQUIRED');deny(()=>verifyReview({...p,applied:true},audit,id),'INVALID_REVIEW_ROW')})
console.log('SUCCESS: '+n+' Reconciliation review contract checks (offline)')
