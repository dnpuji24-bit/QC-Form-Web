// Focused offline regression: per-record operational QC sync errors are visible
// instead of reporting success while the same IndexedDB queue job remains.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { operationalFailureForRecord } from '../src/qcOperationalQueue.mjs'

const ref=id=>JSON.stringify(['test-user-uid',id,'test-revision'])
let count=0
function check(name,fn){fn();count++;console.log('PASS: '+name)}
check('finds only the selected QC failure',()=>{
  const failures=[
    {id:ref('qc-v2-fert-a'),error:'FirebaseError: Missing or insufficient permissions.'},
    {id:ref('qc-v2-fert-b'),error:'QC photo upload HTTP 503'}
  ]
  assert.equal(operationalFailureForRecord(failures,'qc-v2-fert-a'),'FirebaseError: Missing or insufficient permissions.')
  assert.equal(operationalFailureForRecord(failures,'qc-v2-fert-b'),'QC photo upload HTTP 503')
  assert.equal(operationalFailureForRecord(failures,'qc-v2-not-present'),'')
})
check('malformed keys, empty error and newline injection fail closed',()=>{
  assert.equal(operationalFailureForRecord([{id:'not-json',error:'secret'},{id:ref('qc-v2-ok'),error:'HTTP\n503'}],'qc-v2-ok'),'HTTP 503')
  assert.equal(operationalFailureForRecord([{id:ref('qc-v2-ok'),error:null}],'qc-v2-ok'),'')
  assert.equal(operationalFailureForRecord(undefined,'qc-v2-ok'),'')
  assert.equal(operationalFailureForRecord([{id:ref('qc-v2-ok'),error:'a'.repeat(400)}],'qc-v2-ok').length,280)
})
check('UI retry no longer claims success when sync fails',()=>{
  const src=readFileSync(new URL('../src/offline.ts',import.meta.url),'utf8')
  assert.match(src,/const pending=\(await operationalQueuedRecords\(\)\)\.find\(job=>job\.record\.id===recordId\)/)
  assert.match(src,/operationalFailureForRecord\(result\.failures,recordId\)/)
  assert.match(src,/if\(failure\)\{/)
  assert.match(src,/throw Error\('Sinkronisasi QC belum berhasil: '\+failure\)/)
  assert.match(src,/const remains=\(await operationalQueuedRecords\(\)\)\.some/)
  assert.match(src,/firestoreSaveError:String\(job\.lastError\)/)
  const q=readFileSync(new URL('../src/qcOperationalQueue.mjs',import.meta.url),'utf8')
  assert.match(q,/store\.put\(\{\.\.\.item,lastError:message,lastAttemptAt:now,attempts,nextAttemptAt:now\+operationalRetryDelay/)
  assert.match(q,/if\(item\?\.record\?\.clientRevision===job\.record\.clientRevision\)/)
})
check('TypeScript declarations expose diagnostic helper and persisted error metadata',()=>{
  const declarations=readFileSync(new URL('../src/qcOperationalQueue.d.mts',import.meta.url),'utf8')
  assert.match(declarations,/export function operationalFailureForRecord\(/)
  const adapters=readFileSync(new URL('../src/qcOperationalAdapters.ts',import.meta.url),'utf8')
  assert.match(adapters,/type PersistedJob=OperationalJob&\{id:string;createdAt:number;lastError\?:string\}/)
  assert.match(adapters,/type PersistedQcJob=Job&\{id:string;createdAt:number;lastError\?:string\}/)
})
console.log('SUCCESS: '+count+' focused retry diagnostic tests passed (OFFLINE, NO WRITES)')
