import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import {sameQcRevision,serverConfirmsPendingQc,reconcileServerSnapshot,preserveConfirmedRecord} from '../src/qcPendingReconciliation.ts'
import {assertLegacyQcWriteAllowed} from '../src/qcCutoverPolicy.mjs'
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const base={
  id:'qc-v2-fertilizer-test',formType:'fertilizer',date:'2026-11-20',
  paddock:'JAGF-2-K-003',noUnit:'TR073G',inputtedBy:'gustinus',
  ownerUid:'firebase-uid-1',clientRevision:'rev123',saveType:'ready',
  firestoreSaveState:'queued'
}
test('matching exact server revision is confirmed but not labelled Uploaded',()=>{
 const remote={...base,firestoreSaveState:'confirmed'}
 assert.equal(sameQcRevision(base,remote),true)
 assert.equal(serverConfirmsPendingQc(base,remote),true)
 const saved=reconcileServerSnapshot(base,true)
 assert.equal(saved.firestoreSaveState,'confirmed')
 assert.equal(saved.saveType,'ready')
 assert.equal(saved.id,base.id)
})
test('cache-only and pending local writes cannot claim Firestore success',()=>{
 assert.deepEqual(reconcileServerSnapshot(base,false),base)
 const noVersion={...base,clientRevision:''}
 assert.deepEqual(reconcileServerSnapshot(noVersion,true),noVersion)
})
test('same ID cannot confirm wrong revision, unit or author',()=>{
 for(const remote of [
  {...base,clientRevision:'rev124'}, {...base,noUnit:'TR072G'},
  {...base,paddock:'JAGF-2-K-004'}, {...base,formType:'spray'},
  {...base,inputtedBy:'someone-else'}, {...base,ownerUid:'other-firebase-uid'},
  {...base,id:'different'}
 ]){
  assert.equal(serverConfirmsPendingQc(base,remote),false)
 }
 assert.equal(serverConfirmsPendingQc({...base,clientRevision:''},{...base,clientRevision:''}),false)
 assert.equal(serverConfirmsPendingQc({...base,ownerUid:undefined},base),false)
})
test('a persisted confirmation is not overwritten by stale IndexedDB queue rehydration',()=>{
 const confirmed={...base,firestoreSaveState:'confirmed'}
 assert.equal(preserveConfirmedRecord(confirmed,base),confirmed)
 const edited={...base,clientRevision:'rev124',firestoreSaveState:'queued'}
 assert.equal(preserveConfirmedRecord(confirmed,edited),edited)
})
test('historical QC remains blocked from automatic writes during Firestore cutover',()=>{
 assert.throws(()=>assertLegacyQcWriteAllowed('qc_legacy_20',true),/QC_LEGACY_WRITE_BLOCKED/)
 const source=read('src/offline.ts')
 assert.match(source,/export async function verifyQueuedQcOnServer\(record:QcRecord\)/)
 const verifier=source.slice(source.indexOf('export async function verifyQueuedQcOnServer'),source.indexOf('export async function retryQueuedRecord'))
 assert.match(verifier,/getDocFromServer/)
 assert.match(verifier,/serverConfirmsPendingQc/)
 assert.match(verifier,/emitUploadState\(confirmed\)/)
 assert.doesNotMatch(verifier,/setDoc\(|updateDoc\(|deleteDoc\(|removeItem\(|enqueueInternal\(/)
 assert.match(read('src/App.tsx'),/Periksa Firestore/)
})
test('Firestore snapshot metadata is authoritative, not an offline cache',()=>{
 const source=read('src/firestoreRealtime.ts')
 assert.match(source,/includeMetadataChanges:true/)
 assert.match(source,/!snapshot\.metadata\.fromCache&&!docSnap\.metadata\.hasPendingWrites/)
 const app=read('src/App.tsx')
 assert.match(app,/fresh\.firestoreSaveState==='confirmed'&&sameQcRevision\(record,fresh\)/)
 const labels=read('src/UploadStatus.tsx')
 assert.match(labels,/Tersimpan di Firestore/)
 assert.match(labels,/Ini bukan berarti status pekerjaan telah difinalkan atau Uploaded/)
})
