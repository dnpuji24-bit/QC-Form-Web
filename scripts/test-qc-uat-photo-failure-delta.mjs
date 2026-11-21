// 11D.5c.3b.2f.2 — tiny delta-only failure reconciliation gate.
// No Firebase Emulator, Supabase network, secrets, photos or mutations.
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {assessFailedPhotoRun} from '../server/qc-photo-access/uat-unified-photo-failure-assessment.mjs'
import {unifiedPhotoBucket} from '../server/qc-photo-access/uat-unified-private-photo-store.mjs'

const digest=s=>createHash('sha256').update(s).digest('hex')
const runId='e'.repeat(32),actorUid='uat-field',id='uat-'+runId+'-s',revision='uat-r1'
const make=(name,rev=revision)=>{
 const slot='main',sha256=digest(name),photoId=digest(slot).slice(0,24)+'_'+sha256
 const ref={photoId,provider:'supabase',bucket:unifiedPhotoBucket,
  objectPath:actorUid+'/qc/qc-v2-'+id+'/'+photoId+'.png',uploaderUid:actorUid,
  kind:'main',contentType:'image/png',sha256,size:64}
 const ledger={testOnly:true,recordId:id,fullRecordId:'qc-v2-'+id,ownerUid:actorUid,
  formType:'spray',clientRevision:rev,jobId:'uat-job-'+name,
  bucket:unifiedPhotoBucket,storageMode:'supabase-private-uat',manifest:{main:ref}}
 return {path:ref.objectPath,pair:{id,ledger,audit:structuredClone(ledger)}}
}
const first=make('initial'),second=make('correction','uat-r2')
const assess=(touched=[],owned=[],ledgerPairs=[])=>assessFailedPhotoRun({runId,actorUid,touched,owned,ledgerPairs})
let passed=0
function check(label,fn){fn();passed++;console.log('PASS: '+label)}
check('acknowledged and historical audited revisions remain protected, never auto-deleted',()=>{
 const v=assess([first.path,second.path],[first.path,second.path],[first.pair,second.pair])
 assert.equal(v.status,'REFERENCES_MATCH_PROCESS_SNAPSHOT')
 assert.equal(v.auditedReferenceCount,2)
 assert.equal(v.stagedUncommittedCount,0)
 assert.equal(v.automatedDeletionAllowed,false)
 assert.equal(v.requiresManualReconciliation,true)
 assert.equal(v.scope,'CURRENT_PROCESS_AND_DEMO_EMULATOR_ONLY')
})
check('staged-only orphan and ambiguous upload are distinguished without any deletion',()=>{
 const orphan=assess([first.path],[first.path],[])
 assert.equal(orphan.status,'STAGED_UNCOMMITTED')
 assert.equal(orphan.stagedUncommittedCount,1)
 const ambiguous=assess([first.path],[],[])
 assert.equal(ambiguous.status,'AMBIGUOUS_UPLOAD')
 assert.equal(ambiguous.unacknowledgedCount,1)
 const missing=assess([],[],[first.pair])
 assert.equal(missing.status,'COMMITTED_REFERENCE_NOT_ACKNOWLEDGED')
 assert.equal(missing.referenceNotAcknowledgedCount,1)
 for(const x of [orphan,ambiguous,missing])assert.equal(x.automatedDeletionAllowed,false)
})
check('tampered audit, foreign path and empty in-process snapshot fail closed',()=>{
 const forged={...first.pair,audit:{...first.pair.audit,jobId:'uat-forged'}}
 const audit=assess([first.path],[first.path],[forged])
 assert.equal(audit.status,'AUDIT_CONFLICT')
 assert.equal(audit.auditConflictCount,1)
 const outside=actorUid+'/qc/qc-v2-uat-'+('a'.repeat(32))+'-s/'+first.path.split('/').at(-1)
 const scope=assess([first.path,outside],[first.path,outside],[first.pair])
 assert.equal(scope.status,'SCOPE_CONFLICT')
 assert.equal(scope.scopeConflictCount,1)
 const empty=assess()
 assert.equal(empty.status,'NO_PROCESS_EVIDENCE')
 for(const v of [audit,scope,empty]){
  assert.equal(v.automatedDeletionAllowed,false)
  assert.doesNotMatch(JSON.stringify(v),/qc-v2-uat-|signedUrl|sb_secret_/)
 }
 assert.throws(()=>assessFailedPhotoRun({runId:'bad',actorUid,touched:[],owned:[],ledgerPairs:[]}),
  {message:'PHOTO_RECOVERY_SCOPE_INVALID'})
})
console.log('SUCCESS: '+passed+' read-only photo failure delta checks passed (NO emulator, NO Supabase upload)')
