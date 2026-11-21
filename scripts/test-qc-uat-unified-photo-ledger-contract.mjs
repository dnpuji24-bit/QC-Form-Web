// 11D.5c.3b.2b — pure ledger regression; no Firebase, storage credential, or network.
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {prepareOperationalPhotoManifest} from '../src/qcOperationalPhotoManifest.mjs'
import {stablePhotoLedger,verifiedPhotoLedger,verifyPhotoLedgerPair} from '../src/qcUatVerifiedPhotoLedger.mjs'
import {mockBucket} from '../server/qc-photo-access/uat-unified-photo-trusted-stage.mjs'
const r={id:'qc-v2-uat-photo-test',ownerUid:'uat-field',inputtedBy:'uat-field',
 formType:'spray',clientRevision:'uat-r1',dailyPlanId:'uat-ds',
 holdIntervals:[{holdId:'uat-h1'}]}
const req={record:r,baseRevision:null,jobId:'uat-job',uploaderUid:'uat-field',
 expectedDailyRevision:0,foremanId:'uat-f1'}
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGM0atryn4GBgYGJAQoAJCYCa4s7a6wAAAAASUVORK5CYII='
const hash=v=>createHash('sha256').update(v).digest('hex')
async function proofFor(input=req,changes=[{action:'replace',kind:'main',dataUrl:png}],mode='in-memory-mock',bucket=mockBucket){
 const {manifest}=await prepareOperationalPhotoManifest({recordId:input.record.id,uploaderUid:input.uploaderUid,changes,bucket})
 const plain={testOnly:true,storageMode:mode,formType:input.record.formType,ownerUid:input.uploaderUid,
  recordId:input.record.id,clientRevision:input.record.clientRevision,jobId:input.jobId,
  baseRevision:input.baseRevision,dailyPlanId:input.record.dailyPlanId,
  expectedDailyRevision:input.expectedDailyRevision,bucket,manifest}
 return {...plain,manifestSha256:hash(stablePhotoLedger(plain)),status:'verified-staged-only'}
}
let n=0;const check=async(label,fn)=>{await fn();n++;console.log('PASS: '+label)}
await check('trusted stage digest maps exact Spray revision into immutable photo ledger',async()=>{
 const proof=await proofFor(),row=verifiedPhotoLedger(req,proof,mockBucket,'in-memory-mock')
 assert.equal(row.recordId,'uat-photo-test');assert.equal(row.fullRecordId,r.id)
 assert.equal(row.clientRevision,'uat-r1');assert.equal(row.bucket,mockBucket)
 assert.equal(row.manifest.main.sha256,proof.manifest.main.sha256)
 assert.ok(!Object.hasOwn(row,'dataUrl')&&!Object.hasOwn(row,'signedUrl'))
})
await check('canonical digest remains stable under object key reordering',async()=>{
 assert.equal(stablePhotoLedger({z:2,a:{b:1,a:2}}),stablePhotoLedger({a:{a:2,b:1},z:2}))
})
await check('exact retry yields same ledger and immutable audit',async()=>{
 const p=await proofFor(),row=verifiedPhotoLedger(req,p,mockBucket,'in-memory-mock')
 assert.deepEqual(verifiedPhotoLedger(req,p,mockBucket,'in-memory-mock'),row)
 assert.deepEqual(verifyPhotoLedgerPair(row,structuredClone(row),row),row)
})
await check('modified proof digest or forged stage status rejected',async()=>{
 const p=await proofFor()
 assert.throws(()=>verifiedPhotoLedger(req,{...p,manifestSha256:'a'.repeat(64)},mockBucket,'in-memory-mock'),{message:'PHOTO_PROOF_DIGEST_INVALID'})
 assert.throws(()=>verifiedPhotoLedger(req,{...p,status:'committed'},mockBucket,'in-memory-mock'),{message:'PHOTO_PROOF_UNTRUSTED'})
})
await check('record UID, client revision, job, Daily revision cannot be changed',async()=>{
 const p=await proofFor()
 for(const changed of [{...req,uploaderUid:'uat-other'},{...req,jobId:'uat-wrong'},
  {...req,expectedDailyRevision:1},{...req,record:{...r,clientRevision:'uat-r2'}},
  {...req,record:{...r,id:'qc-v2-uat-forged'}}])
  assert.throws(()=>verifiedPhotoLedger(changed,p,mockBucket,'in-memory-mock'))
})
await check('mode and bucket must match trusted server store',async()=>{
 const p=await proofFor()
 assert.throws(()=>verifiedPhotoLedger(req,p,'qc-photos-uat','in-memory-mock'))
 assert.throws(()=>verifiedPhotoLedger(req,p,mockBucket,'supabase-private-uat'))
})
await check('HOLD photo must reference an existing form hold',async()=>{
 const p=await proofFor(req,[{action:'replace',kind:'hold',holdId:'uat-h1',dataUrl:png}])
 const row=verifiedPhotoLedger(req,p,mockBucket,'in-memory-mock')
 assert.ok(row.manifest['hold_uat-h1'])
 const bad=await proofFor(req,[{action:'replace',kind:'hold',holdId:'uat-h9',dataUrl:png}])
 assert.throws(()=>verifiedPhotoLedger(req,bad,mockBucket,'in-memory-mock'),{message:'PHOTO_LEDGER_SLOT_MISMATCH'})
})
await check('scan slot reserved for Fertilizer, never Spray',async()=>{
 const p=await proofFor(req,[{action:'replace',kind:'scan',dataUrl:png}])
 assert.throws(()=>verifiedPhotoLedger(req,p,mockBucket,'in-memory-mock'),{message:'PHOTO_LEDGER_SLOT_MISMATCH'})
 const f={...req,record:{...r,formType:'fertilizer'}}
 const q=await proofFor(f,[{action:'replace',kind:'scan',dataUrl:png}])
 assert.ok(verifiedPhotoLedger(f,q,mockBucket,'in-memory-mock').manifest.scan)
})
await check('client-selected arbitrary path is denied even with recomputed digest',async()=>{
 const p=await proofFor()
 const altered=structuredClone(p),original=altered.manifest.main
 altered.manifest.main={...original,objectPath:'uat-other/qc/production/secret.jpg'}
 const {status,manifestSha256,...base}=altered
 altered.manifestSha256=hash(stablePhotoLedger(base))
 assert.throws(()=>verifiedPhotoLedger(req,altered,mockBucket,'in-memory-mock'),{message:'PHOTO_LEDGER_REFERENCE_INVALID'})
})
await check('sha, slot identity and MIME cannot be forged with recomputed proof',async()=>{
 const p=await proofFor()
 for(const field of [{photoId:'a'.repeat(24)+'_'+p.manifest.main.sha256},
  {contentType:'image/svg+xml'},{sha256:'b'.repeat(64)},{size:2097153}]){
  const altered=structuredClone(p);altered.manifest.main={...altered.manifest.main,...field}
  const {status,manifestSha256,...base}=altered
  altered.manifestSha256=hash(stablePhotoLedger(base))
  assert.throws(()=>verifiedPhotoLedger(req,altered,mockBucket,'in-memory-mock'))
 }
})
await check('missing or mismatched immutable ledger/audit always fails closed',async()=>{
 const row=verifiedPhotoLedger(req,await proofFor(),mockBucket,'in-memory-mock')
 assert.throws(()=>verifyPhotoLedgerPair(null,row,row),{message:'PHOTO_LEDGER_PAIR_MISMATCH'})
 assert.throws(()=>verifyPhotoLedgerPair(row,null,row),{message:'PHOTO_LEDGER_PAIR_MISMATCH'})
 assert.throws(()=>verifyPhotoLedgerPair(row,{...row,jobId:'uat-other'},row),{message:'PHOTO_LEDGER_PAIR_MISMATCH'})
})
console.log('SUCCESS: '+n+' immutable QC photo ledger contract checks passed (offline, no upload)')
