// Synthetic browser candidate. Separate DB and lock from operational/legacy queues.
import {openOperationalQueue,enqueueOperationalJob,listOperationalJobs} from './qcOperationalQueue.mjs'
import {need,prepareStrictJob,enqueueStrictSyntheticJob,processStrictSyntheticJob,assertSameQueuedPayload} from './qcUatStrictQueueContract.mjs'
export const STRICT_DB='qc_uat_strict_queue_v1'
export function isolatedQueueFactory(factory=globalThis.indexedDB){
 need(factory&&typeof factory.open==='function','INDEXEDDB_REQUIRED')
 return {open(name,version){need(name==='qc_operational_queue_v1'&&version===1,'STRICT_DB_SCOPE');return factory.open(STRICT_DB,version)}}
}
const uidGuard=uid=>need(typeof uid==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(uid),'SYNTHETIC_UID_REQUIRED')
export async function enqueueStrictBrowserJob(job,factory){
 const f=isolatedQueueFactory(factory)
 return enqueueStrictSyntheticJob(job,next=>enqueueOperationalJob(next,f))
}
export async function listStrictBrowserJobs(uid,factory){
 uidGuard(uid)
 return listOperationalJobs(uid,isolatedQueueFactory(factory))
}
// Compare within the same IDB transaction before deleting. No deletion if
// row changed or is malformed, even after the remote commit succeeded.
async function deleteConfirmed(job,factory){
 const db=await openOperationalQueue(isolatedQueueFactory(factory))
 try{
  await new Promise((resolve,reject)=>{
   const tx=db.transaction('jobs','readwrite'),store=tx.objectStore('jobs')
   let failure
   tx.oncomplete=resolve
   tx.onabort=()=>reject(failure??tx.error??Error('STRICT_DELETE_ABORTED'))
   tx.onerror=()=>reject(tx.error??Error('STRICT_DELETE_FAILED'))
   const req=store.get(job.id)
   req.onsuccess=()=>{
    try{
     if(!req.result)return // another successful worker may already have removed it
     assertSameQueuedPayload(req.result,job)
     need(req.result.payloadFingerprint===job.payloadFingerprint,'QC_QUEUE_FINGERPRINT_MISMATCH')
     store.delete(job.id)
    }catch(e){failure=e;tx.abort()}
   }
  })
 }finally{db.close()}
}
const running=new Map()
export function flushStrictBrowserJobs(uid,deps,factory){
 uidGuard(uid)
 if(running.has(uid))return running.get(uid)
 const run=async()=>{
  let sent=0;const failures=[],blocked=new Set()
  for(const job of await listStrictBrowserJobs(uid,factory)){
   if(await deps.currentUid()!==uid)break
   const recordId=job?.record?.id
   if(blocked.has(recordId))continue
   try{
    need(job.scope==='uat-strict'&&job.testOnly===true,'STRICT_JOB_SCOPE')
    const checked=await prepareStrictJob(job)
    need(job.payloadFingerprint===checked.payloadFingerprint,'QC_QUEUE_FINGERPRINT_MISMATCH')
    const result=await processStrictSyntheticJob(job,deps)
    need(result.status==='confirmed','QC_COMMIT_UNCONFIRMED')
    need(await deps.currentUid()===uid,'QC_QUEUE_ACCOUNT_MISMATCH')
    await deleteConfirmed(job,factory)
    sent++
   }catch(e){blocked.add(recordId);failures.push({id:job.id,error:String(e?.message??e)})}
  }
  return {sent,left:(await listStrictBrowserJobs(uid,factory)).length,failures}
 }
 // In browsers without Web Locks, trusted server CAS remains mandatory.
 const promise=Promise.resolve().then(()=>globalThis.navigator?.locks?globalThis.navigator.locks.request('qc-uat-strict-'+uid,run):run()).finally(()=>running.delete(uid))
 running.set(uid,promise)
 return promise
}
