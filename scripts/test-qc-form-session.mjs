import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { enqueueOperationalBatch,listOperationalJobs } from '../src/qcOperationalQueue.mjs'
import { buildQcFormSaveIntent } from '../src/qcFormSaveIntent.mjs'
const require=createRequire(process.env.QC_TEST_IDB_ROOT ? process.env.QC_TEST_IDB_ROOT+'/package.json' : import.meta.url)
const {IDBFactory}=require('fake-indexeddb')
const factory=new IDBFactory()
const row=(id,revision='r1')=>({record:{id,clientRevision:revision,saveType:'draft'},uploaderUid:'user1',baseRevision:null,action:'syncRecord',changes:[]})
let n=0
const pass=label=>{n++;console.log('PASS: '+label)}
await enqueueOperationalBatch([row('qc-v2-1'),row('qc-v2-2')],factory)
assert.equal((await listOperationalJobs('user1',factory)).length,2);pass('two units persisted in one local transaction')
await assert.rejects(enqueueOperationalBatch([row('qc-v2-3'),row('qc-v2-1','r2')],factory))
assert.equal((await listOperationalJobs('user1',factory)).length,2);pass('pending revision aborts entire batch')
await assert.rejects(enqueueOperationalBatch([row('qc-v2-4'),row('qc-v2-4')],factory));pass('duplicate unit identity rejected')
await assert.rejects(enqueueOperationalBatch([row('qc-v2-4'),{...row('qc-v2-5'),uploaderUid:'user2'}],factory));pass('mixed accounts rejected')
assert.equal((await listOperationalJobs('user2',factory)).length,0);pass('other account sees no queued jobs')
const previous={clientRevision:'r2',holdIntervals:[{holdId:'h1'},{holdId:'h2',photoBase64:'data:image/png;base64,AQID'},{holdId:'h3',photoBase64:'data:image/png;base64,AQID'}]}
const intent=buildQcFormSaveIntent(previous,{isNew:false,baseRevision:'r1',previousHoldIds:['h1','h2','h3','h4'],replaceHoldIds:['h2'],removedHoldIds:['h1']})
assert.deepEqual(intent.changes.map(c=>[c.holdId,c.action]).sort(),[['h1','remove'],['h2','replace'],['h4','remove']]);pass('explicit HOLD replacement/removal; untouched photo retained')
assert.equal(intent.baseRevision,'r1');pass('original revision retained')
assert.throws(()=>buildQcFormSaveIntent(previous,{isNew:false}),/BASE_REVISION/);pass('missing base revision rejected')
console.log('SUCCESS: '+n+' QC form session checks passed (simulated IndexedDB; no network writes)')
