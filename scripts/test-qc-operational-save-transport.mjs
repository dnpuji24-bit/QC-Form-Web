import assert from 'node:assert/strict'
import {processOperationalQcJob as process,operationalQueueId as id} from '../src/qcOperationalSaveTransport.mjs'
const uid='user1', record={id:'qc1',clientRevision:'rev1',saveType:'ready',photoBase64:'raw'}
const job={id:id(uid,'qc1','rev1'),record,uploaderUid:uid,baseRevision:null,action:'finalizeRecord',changes:[{kind:'main',action:'replace',dataUrl:'data:image/png;base64,AQID'}]}
let current=null, account=uid, uploads=0, commits=0, failUpload=false, failCommit=false
const deps={currentUid:async()=>account,readRecord:async()=>current,putVerifiedPhoto:async()=>{uploads++;if(failUpload)throw Error('offline')},commitRecord:async({record,baseRevision})=>{commits++;if(failCommit)throw Error('commit offline');assert.equal(current?.clientRevision??null,baseRevision);current=record;return record}}
failUpload=true;await assert.rejects(process(job,deps));assert.equal(commits,0);console.log('PASS: failed photo blocks QC confirmation')
failUpload=false;failCommit=true;await assert.rejects(process(job,deps));assert.equal(current,null);console.log('PASS: failed commit leaves job retryable')
failCommit=false;const result=await process(job,deps);assert.equal(result.record.saveType,'uploaded');assert.equal(result.record.photoBase64,undefined);assert.equal(result.record.operationalPhotoManifest.main.bucket,'qc-photos');console.log('PASS: confirmed save contains reference, not raw photo')
const before=[uploads,commits];await process(job,deps);assert.deepEqual([uploads,commits],before);console.log('PASS: replay after confirmed commit is idempotent')
await assert.rejects(process({...job,id:'other',record:{...record,clientRevision:'rev2'}},deps),/QC_REVISION_CONFLICT/);console.log('PASS: stale correction cannot overwrite current record')
account='other';await assert.rejects(process(job,deps),/ACCOUNT_MISMATCH/);account=uid;console.log('PASS: another Firebase account cannot replay job')
const correction={...job,id:id(uid,'qc1','rev2'),baseRevision:'rev1',record:{...record,clientRevision:'rev2'},changes:[],action:'syncRecord'};const old=current.operationalPhotoManifest;await process(correction,deps);assert.deepEqual(current.operationalPhotoManifest,old);console.log('PASS: correction retains untouched photo')
assert.notEqual(id(uid,'qc1','rev1'),id('other','qc1','rev1'));assert.throws(()=>id(uid,'../bad','rev1'));console.log('PASS: queue identity scopes account and revision')
console.log('SUCCESS: 8 operational save transport checks passed (mock adapters only)')
