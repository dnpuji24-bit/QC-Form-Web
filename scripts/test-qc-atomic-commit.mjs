import assert from 'node:assert/strict'
import {commitQcAndActual} from '../src/qcAtomicCommit.mjs'
const row={id:'qc_1',ownerUid:'u1',inputtedBy:'mandor',formType:'spray',clientRevision:'r1',saveType:'ready',actualAreaHa:5,dailyPlanId:'dp1'}
let qc=null,actual=null,uid='u1',fail=false,writes=0
const deps={currentUid:async()=>uid,buildActual:r=>r.saveType==='draft'?null:{sourceOrigin:'QC',qcRecordId:r.id,actualAreaHa:r.actualAreaHa,dailyPlanId:r.dailyPlanId},transaction:async fn=>{
 let q=qc,a=actual,n=0
 const result=await fn({readQc:async()=>qc,readActual:async()=>actual,writeQc:(_id,r)=>{q=r;n++},writeActual:(_id,r)=>{a=r;n++}})
 if(fail)throw Error('SIMULATED_ATOMIC_FAILURE')
 qc=q;actual=a;writes+=n;return result
}}
const run=(record=row,baseRevision=null,jobId='j1')=>commitQcAndActual({record,baseRevision,jobId,uploaderUid:'u1'},deps)
await run();assert.equal(qc.clientRevision,'r1');assert.equal(actual.actualAreaHa,5);assert.equal(writes,2);console.log('PASS: QC and Actual committed together')
await run();assert.equal(writes,2);console.log('PASS: replay is idempotent')
await assert.rejects(run({...row,clientRevision:'r2'},'wrong','j2'),/QC_REVISION_CONFLICT/);console.log('PASS: stale revision rejected')
fail=true;await assert.rejects(run({...row,clientRevision:'r2',actualAreaHa:9},'r1','j2'),/SIMULATED/);assert.equal(qc.clientRevision,'r1');assert.equal(actual.actualAreaHa,5);fail=false;console.log('PASS: failed transaction leaves both unchanged')
await run({...row,clientRevision:'r2',actualAreaHa:9},'r1','j2');assert.equal(actual.actualAreaHa,9);console.log('PASS: correction updates same Actual')
await assert.rejects(run({...row,clientRevision:'r3',ownerUid:'u2'},'r2','j3'),/QC_IDENTITY_IMMUTABLE/);console.log('PASS: owner immutable')
await assert.rejects(run({...row,clientRevision:'r3',saveType:'draft'},'r2','j3'),/QC_ACTUAL_REMOVAL_REQUIRES_REVIEW/);console.log('PASS: existing Actual cannot disappear silently')
uid='u2';await assert.rejects(run({...row,clientRevision:'r3'},'r2','j3'),/QC_QUEUE_ACCOUNT_MISMATCH/);uid='u1';console.log('PASS: other account rejected')
console.log('SUCCESS: 8 atomic QC/Actual core checks passed (mock transaction only)')
